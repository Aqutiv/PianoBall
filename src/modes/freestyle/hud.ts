import type { Hud } from '../../ui/hud';
import type { MusicState } from '../../audio/musicState';
import type { AudioEngine } from '../../audio/engine';
import { noteName } from '../../midi/notes';

/** Scale, chord and the two wheels. No score: there is nothing to win. */
export class FreestyleHud {
  private chordEl!: HTMLElement;
  private scaleEl!: HTMLElement;
  private bedEl!: HTMLButtonElement;
  private wheelsEl!: HTMLElement;

  constructor(
    private readonly hud: Hud,
    private readonly music: MusicState,
    private readonly engine: AudioEngine,
  ) {}

  mount(): void {
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="chord" id="fs-chord">&nbsp;</div>
        <div class="score-sub" id="fs-scale"></div>
      </div>
    `;
    this.hud.right.innerHTML = `
      <button class="hud-toggle" id="fs-bed">Backing bed</button>
      <div class="wheels" id="fs-wheels"></div>
    `;
    this.chordEl = this.hud.left.querySelector('#fs-chord') as HTMLElement;
    this.scaleEl = this.hud.left.querySelector('#fs-scale') as HTMLElement;
    this.bedEl = this.hud.right.querySelector('#fs-bed') as HTMLButtonElement;
    this.wheelsEl = this.hud.right.querySelector('#fs-wheels') as HTMLElement;
    this.bedEl.addEventListener('click', () => {
      this.engine.setSettings({ bed: !this.engine.settings.bed });
    });
  }

  update(chord: string | null, bend: number, mod: number): void {
    this.chordEl.textContent = chord ?? ' ';
    this.chordEl.style.opacity = chord ? '1' : '0.22';
    this.scaleEl.textContent = `${noteName(this.music.root)} ${this.music.label}`;
    this.bedEl.classList.toggle('on', this.engine.settings.bed);
    const bar = (v: number) => `<i style="width:${Math.round(Math.abs(v) * 100)}%"></i>`;
    this.wheelsEl.innerHTML =
      `<div class="wheel"><b>bend</b><span>${bar(bend)}</span></div>`
      + `<div class="wheel"><b>mod</b><span>${bar(mod)}</span></div>`;
  }
}
