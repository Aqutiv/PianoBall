/** Whether the main pointer is a finger, for wording that says "tap" rather than "click". */
function touchScreen(): boolean {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

/** Where a music mode's docked keyboard sits, in canvas CSS pixels. */
export interface DockGeometry {
  /** Top of the dock's header strip: the stage ends here. */
  top: number;
  keysTop: number;
  bottom: number;
  left: number;
  right: number;
  /** Laid out for fingers, with nothing under the keys but the edge of the screen. */
  touch: boolean;
}

const DOCK_VARS = ['--dock-top', '--dock-keys', '--dock-end', '--dock-left', '--dock-right'] as const;

/**
 * DOM heads-up display. Kept out of the canvas so text stays crisp at any DPR
 * and so it can be read by assistive tech.
 *
 * This class owns only what every mode shares — the controller and sound
 * indicators, the banner, the frame budget. The two corner panels are handed to
 * whichever mode is running, because a score and a ball count mean nothing in
 * Freestyle and an accuracy percentage means nothing on a pinball table.
 */
export class Hud {
  /** Mode-owned panels, top left and top right. */
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  /** A mode-owned strip in the header of a docked keyboard. */
  readonly dock: HTMLElement;

  private readonly controlsEl: HTMLButtonElement;

  private readonly statusEl: HTMLElement;
  private readonly dotEl: HTMLElement;
  private readonly soundEl: HTMLElement;
  private readonly soundDotEl: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly fpsEl: HTMLElement;

  private bannerUntil = 0;
  showFps = false;
  /** What `showFps` was when the readout's display was last written. */
  private fpsShown: boolean | null = null;

  constructor(readonly root: HTMLElement, onMenu: () => void) {
    root.innerHTML = `
      <nav class="hud-nav" aria-label="Game controls">
        <button type="button" id="hud-menu" aria-label="Pause and open menu">Menu</button>
        <button type="button" id="hud-controls" aria-controls="hud-panels" aria-expanded="false">Controls</button>
      </nav>
      <div class="hud-top" id="hud-panels">
        <div class="hud-left" id="hud-left"></div>
        <div class="hud-right" id="hud-right"></div>
      </div>
      <div></div>
      <div class="hud-bottom">
        <div class="status">
          <span class="dot" id="hud-dot"></span><span id="hud-status">Starting&hellip;</span>
          <span class="sep"></span>
          <span class="dot" id="hud-sound-dot"></span><span id="hud-sound">Sound off</span>
        </div>
      </div>
      <div class="dock-bar" id="hud-dock" hidden></div>
      <div class="banner" id="hud-banner"></div>
      <div class="fps" id="hud-fps" style="display:none"></div>
    `;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    this.left = q('#hud-left');
    this.right = q('#hud-right');
    this.dock = q('#hud-dock');
    this.controlsEl = q('#hud-controls') as HTMLButtonElement;
    q('#hud-menu').addEventListener('click', () => {
      this.setControlsOpen(false);
      onMenu();
    });
    this.controlsEl.addEventListener('click', (event) => {
      this.setControlsOpen(this.controlsEl.getAttribute('aria-expanded') !== 'true');
      // Leave the computer keyboard available for playing after a click.
      if (event.detail > 0) this.controlsEl.blur();
    });
    this.statusEl = q('#hud-status');
    this.dotEl = q('#hud-dot');
    this.soundEl = q('#hud-sound');
    this.soundDotEl = q('#hud-sound-dot');
    this.bannerEl = q('#hud-banner');
    this.fpsEl = q('#hud-fps');
  }

  /** Empty both panels. Called when a mode hands over. */
  clearPanels(): void {
    this.setControlsOpen(false);
    this.left.innerHTML = '';
    this.right.innerHTML = '';
    this.dock.innerHTML = '';
    this.dock.hidden = true;
    this.setDock(null);
  }

  /**
   * Where the keyboard is docked, or null when the mode on screen has none.
   *
   * Published as custom properties on the app, so the panels above can keep
   * clear of the keys with plain CSS rather than with a measurement each.
   */
  setDock(geom: DockGeometry | null): void {
    const host = (this.root.parentElement ?? this.root) as HTMLElement;
    this.root.classList.toggle('hud-dock', geom !== null);
    this.root.classList.toggle('hud-dock-touch', geom?.touch ?? false);
    if (!geom) {
      for (const v of DOCK_VARS) host.style.removeProperty(v);
      return;
    }
    const px = (n: number) => `${Math.round(n)}px`;
    host.style.setProperty('--dock-top', px(geom.top));
    host.style.setProperty('--dock-keys', px(geom.keysTop));
    host.style.setProperty('--dock-end', px(geom.bottom));
    host.style.setProperty('--dock-left', px(geom.left));
    host.style.setProperty('--dock-right', px(geom.right));
  }

  /** Which mode the HUD is dressed for. Styles key off `data-mode` and `hud-freestyle`. */
  setMode(id: string): void {
    this.root.dataset.mode = id;
    this.root.classList.toggle('hud-freestyle', id === 'freestyle');
    this.setControlsOpen(false);
  }

  private setControlsOpen(on: boolean): void {
    this.root.classList.toggle('controls-open', on);
    this.controlsEl.setAttribute('aria-expanded', String(on));
    this.controlsEl.textContent = on ? 'Hide controls' : 'Controls';
  }

  /**
   * Sound needs a user gesture the browser will accept, and a MIDI note is not
   * one. When it is still off, say so and say what fixes it — a silent game
   * with no explanation reads as broken.
   */
  setSound(on: boolean): void {
    this.soundEl.textContent = on ? 'Sound on' : `Sound off — ${touchScreen() ? 'tap a key' : 'click anywhere'}`;
    this.soundDotEl.className = `dot ${on ? 'ok' : 'warn'}`;
    this.soundEl.classList.toggle('nudge', !on);
    // Under a docked touch keyboard the status line is hidden, except to say this.
    this.root.classList.toggle('sound-off', !on);
  }

  setStatus(text: string, level: 'ok' | 'warn' | 'err' | 'idle' = 'idle'): void {
    this.statusEl.textContent = text;
    this.dotEl.className = `dot ${level === 'idle' ? '' : level}`;
  }

  banner(text: string, seconds = 1.6, tone: '' | 'warn' | 'bad' = ''): void {
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner show ${tone}`;
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  clearBanner(): void {
    this.bannerEl.className = 'banner';
    this.bannerUntil = 0;
  }

  /** Per-frame chrome upkeep. Modes refresh their own panels separately. */
  update(stats: { fps: number; stepMs: number; drawMs: number; extra?: string }): void {
    if (this.bannerUntil && performance.now() > this.bannerUntil) this.clearBanner();

    // Only on a change. This is a style write on every frame otherwise, for a
    // flag that moves when someone presses F3.
    if (this.showFps !== this.fpsShown) {
      this.fpsShown = this.showFps;
      this.fpsEl.style.display = this.showFps ? 'block' : 'none';
    }
    if (this.showFps) {
      this.fpsEl.textContent =
        `${stats.fps.toFixed(0)} fps\n` +
        `step ${stats.stepMs.toFixed(2)}ms\n` +
        `draw ${stats.drawMs.toFixed(2)}ms\n` +
        (stats.extra ?? '');
    }
  }

  /** Hide the whole HUD, for screens that want the canvas to themselves. */
  setVisible(on: boolean): void {
    this.root.style.opacity = on ? '1' : '0';
  }
}
