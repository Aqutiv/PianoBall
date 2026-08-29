import type { Game } from '../game/game';
import type { InputHub } from '../midi/inputHub';

/**
 * DOM heads-up display. Kept out of the canvas so text stays crisp at any DPR
 * and so it can be read by assistive tech.
 */
export class Hud {
  private root: HTMLElement;
  private scoreEl!: HTMLElement;
  private multEl!: HTMLElement;
  private ballsEl!: HTMLElement;
  private slowEl!: HTMLElement;
  private tiltEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private dotEl!: HTMLElement;
  private soundEl!: HTMLElement;
  private soundDotEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private fpsEl!: HTMLElement;

  private bannerUntil = 0;
  showFps = false;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-top">
        <div class="score-block">
          <div class="score" id="hud-score">0</div>
          <div class="score-sub" id="hud-sub"></div>
        </div>
        <div class="hud-right">
          <div class="mult" id="hud-mult">&times;1.0</div>
          <div class="balls" id="hud-balls"></div>
          <div class="meters">
            <div class="meter"><span>Slow</span><div class="meter-bar"><div class="meter-fill slow" id="hud-slow"></div></div></div>
            <div class="meter"><span>Tilt</span><div class="meter-bar"><div class="meter-fill tilt" id="hud-tilt"></div></div></div>
          </div>
        </div>
      </div>
      <div></div>
      <div class="hud-bottom">
        <div class="status">
          <span class="dot" id="hud-dot"></span><span id="hud-status">Starting&hellip;</span>
          <span class="sep"></span>
          <span class="dot" id="hud-sound-dot"></span><span id="hud-sound">Sound off</span>
        </div>
      </div>
      <div class="banner" id="hud-banner"></div>
      <div class="fps" id="hud-fps" style="display:none"></div>
    `;
    this.scoreEl = root.querySelector('#hud-score')!;
    this.multEl = root.querySelector('#hud-mult')!;
    this.ballsEl = root.querySelector('#hud-balls')!;
    this.slowEl = root.querySelector('#hud-slow')!;
    this.tiltEl = root.querySelector('#hud-tilt')!;
    this.statusEl = root.querySelector('#hud-status')!;
    this.dotEl = root.querySelector('#hud-dot')!;
    this.soundEl = root.querySelector('#hud-sound')!;
    this.soundDotEl = root.querySelector('#hud-sound-dot')!;
    this.bannerEl = root.querySelector('#hud-banner')!;
    this.fpsEl = root.querySelector('#hud-fps')!;
  }

  setSubtitle(text: string): void {
    const el = this.root.querySelector('#hud-sub');
    if (el) el.textContent = text;
  }

  /**
   * Sound needs a user gesture the browser will accept, and a MIDI note is not
   * one. When it is still off, say so and say what fixes it — a silent game
   * with no explanation reads as broken.
   */
  setSound(on: boolean): void {
    this.soundEl.textContent = on ? 'Sound on' : 'Sound off — click the table';
    this.soundDotEl.className = `dot ${on ? 'ok' : 'warn'}`;
    this.soundEl.classList.toggle('nudge', !on);
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

  update(game: Game, input: InputHub, stats: { fps: number; stepMs: number; drawMs: number; particles: number }): void {
    this.scoreEl.textContent = game.scoring.score.toLocaleString();
    const m = game.scoring.multiplier;
    this.multEl.textContent = `×${m.toFixed(m >= 10 ? 0 : 1)}`;
    this.multEl.style.opacity = m > 1.01 ? '1' : '0.42';

    const total = game.cfg.ballsPerGame;
    if (this.ballsEl.childElementCount !== total) {
      this.ballsEl.innerHTML = Array.from({ length: total }, () => '<i class="ball-pip"></i>').join('');
    }
    const pips = this.ballsEl.children;
    for (let i = 0; i < pips.length; i++) {
      (pips[i] as HTMLElement).className = i < game.ballsLeft ? 'ball-pip' : 'ball-pip spent';
    }

    this.slowEl.style.width = `${game.slowCharge * 100}%`;
    this.tiltEl.style.width = `${game.tilt.strain01 * 100}%`;

    if (this.bannerUntil && performance.now() > this.bannerUntil) {
      this.bannerEl.className = 'banner';
      this.bannerUntil = 0;
    }

    this.fpsEl.style.display = this.showFps ? 'block' : 'none';
    if (this.showFps) {
      this.fpsEl.textContent =
        `${stats.fps.toFixed(0)} fps\n` +
        `step ${stats.stepMs.toFixed(2)}ms\n` +
        `draw ${stats.drawMs.toFixed(2)}ms\n` +
        `balls ${game.balls.length}  parts ${stats.particles}\n` +
        `held ${input.held.size}  bend ${input.bend.toFixed(2)}`;
    }
  }
}
