import { registerSW } from 'virtual:pwa-register';

/**
 * Whether a newer build is waiting to be taken.
 *
 * The app is an installable PWA, so what you are running is whatever the
 * service worker last cached — and a worker still handing out an old bundle
 * looks exactly like a bug that was never fixed. This is the one place that
 * knows otherwise.
 *
 * Nothing here ever reloads the page on its own. The plugin is registered in
 * `prompt` mode rather than `autoUpdate` precisely so a new worker waits its
 * turn: taking over mid-rally would end a pinball run the player was in the
 * middle of, and no update is worth that. The player takes it from the About
 * screen when it suits them, or by closing the app — a waiting worker
 * activates on its own once no window is left holding the old one.
 *
 * `unsupported` covers three cases that all want the same answer from the UI:
 * a browser with no service workers, a page served over plain http, and
 * `npm run dev` — where the plugin's virtual module is a no-op stub, so
 * `onRegisteredSW` never fires and there is genuinely nothing to check.
 */
export type UpdateState = 'unsupported' | 'idle' | 'checking' | 'ready';

/** How often to ask, in the background, whether a new build has been deployed. */
const CHECK_EVERY = 60 * 60 * 1000;

/**
 * How long to give a worker to take over before reloading regardless.
 *
 * Activation clears the outdated precache first, so this is not instant, but
 * it is seconds at worst on the slowest thing that can run the app. The limit
 * is only here so a worker that never activates leaves the button unresponsive
 * rather than permanently stuck — long enough that reaching it means something
 * has genuinely gone wrong.
 */
const ACTIVATION_LIMIT = 10_000;

/**
 * Resolve once this worker is done becoming whatever it is going to be.
 *
 * `activated` is the one that matters: it is the point where the new worker
 * answers fetches and a reload is safe. `redundant` resolves too, because a
 * worker that was discarded is never going to activate and waiting out the
 * full limit for it would help nobody.
 */
function settled(sw: ServiceWorker): Promise<void> {
  if (sw.state === 'activated') return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      sw.removeEventListener('statechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = (): void => {
      if (sw.state === 'activated' || sw.state === 'redundant') done();
    };
    sw.addEventListener('statechange', onChange);
    const timer = setTimeout(done, ACTIVATION_LIMIT);
  });
}

class Updates {
  state: UpdateState = 'unsupported';

  /** Takes the waiting worker and reloads. Null until one is registered. */
  private apply: ((reloadPage?: boolean) => Promise<void>) | null = null;
  private reg: ServiceWorkerRegistration | null = null;
  private swUrl = '';
  private readonly listeners = new Set<() => void>();

  /**
   * Register the worker and start watching. Called once, from `main`.
   *
   * Safe to call in development: `registerSW` is a stub there, so this leaves
   * the state at `unsupported` rather than pretending to watch something.
   */
  start(): void {
    this.apply = registerSW({
      immediate: true,
      onNeedRefresh: () => this.set('ready'),
      onRegisteredSW: (swUrl, reg) => {
        if (!reg) return;
        this.reg = reg;
        this.swUrl = swUrl;
        if (this.state === 'unsupported') this.set('idle');
        setInterval(() => void this.poll(), CHECK_EVERY);
      },
      onRegisterError: () => this.set('unsupported'),
    });
  }

  /** Subscribe to state changes; returns the unsubscribe. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Ask now, because someone opened About and pressed the button.
   *
   * `update()` resolving does not mean the answer is in — a worker it found
   * still has to install before it can wait — so this settles back to `idle`
   * and lets `onNeedRefresh` flip it to `ready` whenever that lands.
   */
  async check(): Promise<void> {
    // Read once into a local: comparing the field directly narrows it for the
    // rest of the method, and the compiler has no idea `set` puts it back.
    const state = this.state;
    if (!this.reg || state === 'ready' || state === 'checking') return;
    this.set('checking');
    try {
      await this.reg.update();
    } catch {
      // An update check is allowed to fail: offline, or the server is down.
      // Neither is worth reporting, and both are answered by asking again.
    }
    if (this.state === 'checking') this.set('idle');
  }

  /**
   * Take the newer build.
   *
   * The plugin's own call tells a waiting worker to stop waiting, and reloads
   * once it takes control. That covers the ordinary case and is left to do it.
   *
   * It does not cover every case, though, and the button has to work in all of
   * them. A page that no worker was controlling — a first visit, or a tab that
   * was open before any worker activated — gets its new bundle from one that
   * activated without ever having to wait, so there is nothing to send a
   * message to and no change of control coming to reload on. Reloading is the
   * right answer there too: the cache is already serving the new bundle, and
   * only this page is still running the old one. So reload if we are still
   * here shortly after, which we will not be if the plugin got there first.
   */
  async applyNow(): Promise<void> {
    // The only question worth asking before reloading is whether the new
    // worker is the one that will answer it. A reload sent while the old
    // worker is still in charge is served by the old worker, and lands back on
    // the bundle it was trying to leave.
    //
    // So wait on the worker itself rather than on anything about this page.
    // Whether this tab has a controller says only whether the plugin will
    // reload it, which is a different question and was the wrong one: a tab
    // that has no controller can still be sharing a worker with a controlled
    // tab in another window — that other tab is precisely what keeps the new
    // worker waiting — and there the old worker is very much still serving.
    const waiting = this.reg?.waiting ?? null;
    await this.apply?.();
    if (waiting) await settled(waiting);
    // Reload even when the plugin means to as well. Both only get here once
    // the new worker is in charge, so whichever arrives first is right, and
    // there are more ways to have no handover coming than to have one: no
    // waiting worker at all, or no controller to hand over from.
    location.reload();
  }

  /**
   * The hourly check.
   *
   * Fetching the worker script first, rather than calling `update()` outright,
   * is the plugin's own recommendation: it keeps a browser that is offline or
   * a server that is answering with an error from being asked to reinstall.
   */
  private async poll(): Promise<void> {
    const reg = this.reg;
    if (!reg || reg.installing || this.state === 'ready') return;
    if (!navigator.onLine) return;
    try {
      const resp = await fetch(this.swUrl, {
        cache: 'no-store',
        headers: { cache: 'no-store', 'cache-control': 'no-cache' },
      });
      if (resp.status === 200) await reg.update();
    } catch {
      // As above: a failed check is not news.
    }
  }

  private set(state: UpdateState): void {
    if (this.state === state) return;
    this.state = state;
    for (const fn of this.listeners) fn();
  }
}

export const updates = new Updates();
