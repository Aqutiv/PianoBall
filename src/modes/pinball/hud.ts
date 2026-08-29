import type { Hud } from '../../ui/hud';
import type { Game } from '../../game/game';
import { noteName } from '../../midi/notes';

/** Score, multiplier, balls left and the two meters. */
export class PinballHud {
  private scoreEl!: HTMLElement;
  private subEl!: HTMLElement;
  private multEl!: HTMLElement;
  private ballsEl!: HTMLElement;
  private slowEl!: HTMLElement;
  private tiltEl!: HTMLElement;

  constructor(private readonly hud: Hud, private readonly game: Game) {}

  mount(): void {
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="score" id="hud-score">0</div>
        <div class="score-sub" id="hud-sub"></div>
      </div>
    `;
    this.hud.right.innerHTML = `
      <div class="mult" id="hud-mult">&times;1.0</div>
      <div class="balls" id="hud-balls"></div>
      <div class="meters">
        <div class="meter"><span>Slow</span><div class="meter-bar"><div class="meter-fill slow" id="hud-slow"></div></div></div>
        <div class="meter"><span>Tilt</span><div class="meter-bar"><div class="meter-fill tilt" id="hud-tilt"></div></div></div>
      </div>
    `;
    const q = (sel: string) => this.hud.left.querySelector(sel) ?? this.hud.right.querySelector(sel);
    this.scoreEl = q('#hud-score') as HTMLElement;
    this.subEl = q('#hud-sub') as HTMLElement;
    this.multEl = q('#hud-mult') as HTMLElement;
    this.ballsEl = q('#hud-balls') as HTMLElement;
    this.slowEl = q('#hud-slow') as HTMLElement;
    this.tiltEl = q('#hud-tilt') as HTMLElement;
    this.showMusic();
  }

  /** The table's key, wherever it is shown. */
  showMusic(): void {
    const m = this.game.music;
    this.subEl.textContent = `${this.game.def.name} · ${noteName(m.root)} ${m.label}`;
  }

  update(): void {
    const game = this.game;
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
  }
}
