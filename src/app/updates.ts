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
    // Is a handover actually coming? Only a worker that is waiting, on a page
    // some worker already controls, produces one: telling it to stop waiting
    // hands control over, and the plugin reloads on that. Wait for it rather
    // than racing it. Activation has the old caches to clear before it can
    // take over, which on a slow device is not quick, and a reload sent while
    // the old worker is still in charge is answered by the old worker — which
    // is how a fixed timer here would quietly land you back on the bundle you
    // had just asked to leave.
    const handover = !!this.reg?.waiting && !!navigator.serviceWorker.controller;
    await this.apply?.();
    // Otherwise nothing is coming and the button would do nothing at all. A
    // page no worker controls, or one whose new worker activated without ever
    // having to wait, has no change of control to reload on — and reloading is
    // right there anyway: the cache is already serving the new bundle, and
    // only this page is still running the old one.
    if (!handover) location.reload();
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
