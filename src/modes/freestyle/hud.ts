import type { Hud } from '../../ui/hud';
import type { MusicState } from '../../audio/musicState';
import type { AudioEngine } from '../../audio/engine';
import { MODES } from '../../audio/music';
import { RANDOM } from '../../audio/musicState';
import { NOTE_NAMES, noteName } from '../../midi/notes';
import { freestyleSettings, setFreestyleSettings } from './settings';

/**
 * Everything the player might want to change mid-phrase, on screen.
 *
 * Key, scale, bed and room all live here rather than behind Escape, because
 * having to leave what you are playing to change what you are playing in is the
 * opposite of freestyle.
 */
export class FreestyleHud {
  private chordEl!: HTMLElement;
  private keyEl!: HTMLSelectElement;
  private scaleEl!: HTMLSelectElement;
  private rollEl!: HTMLButtonElement;
  private nowEl!: HTMLElement;
  private bedEl!: HTMLButtonElement;
  private reverbEl!: HTMLInputElement;
  private wheelsEl!: HTMLElement;

  constructor(
    private readonly hud: Hud,
    private readonly music: MusicState,
    private readonly engine: AudioEngine,
    private readonly onBedChange: () => void,
  ) {}

  mount(): void {
    const keys = NOTE_NAMES
      .map((n, i) => `<option value="${i}">${n}</option>`).join('');
    // Random belongs here as much as in the panel: picking a named scale used
    // to overwrite it globally, quietly ending random-each-game for the table.
    const scales = `<option value="${RANDOM}">random</option>`
      + MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');

    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="chord" id="fs-chord">&nbsp;</div>
        <div class="hud-controls">
          <select id="fs-key" aria-label="Key">${keys}</select>
          <select id="fs-scale" aria-label="Scale">${scales}</select>
          <button id="fs-roll" title="Draw a scale at random">&#9860;</button>
        </div>
        <div class="score-sub" id="fs-now"></div>
      </div>
    `;
    this.hud.right.innerHTML = `
      <button class="hud-toggle" id="fs-bed">Backing bed</button>
      <div class="wheel"><b>room</b><input type="range" id="fs-reverb" min="0" max="1" step="0.01"></div>
      <div class="wheels" id="fs-wheels"></div>
    `;

    const q = <T extends HTMLElement>(sel: string) =>
      (this.hud.left.querySelector(sel) ?? this.hud.right.querySelector(sel)) as T;
    this.chordEl = q('#fs-chord');
    this.keyEl = q<HTMLSelectElement>('#fs-key');
    this.scaleEl = q<HTMLSelectElement>('#fs-scale');
    this.rollEl = q<HTMLButtonElement>('#fs-roll');
    this.nowEl = q('#fs-now');
    this.bedEl = q<HTMLButtonElement>('#fs-bed');
    this.reverbEl = q<HTMLInputElement>('#fs-reverb');
    this.wheelsEl = q('#fs-wheels');

    this.keyEl.addEventListener('change', () => this.music.setRoot(Number(this.keyEl.value)));
    this.scaleEl.addEventListener('change', () => this.music.setChoice(this.scaleEl.value));
    // Re-picking the option already selected fires no change event, so drawing
    // again needs a control of its own.
    this.rollEl.addEventListener('click', () => this.music.setChoice(RANDOM));
    this.bedEl.addEventListener('click', () => {
      setFreestyleSettings({ bed: !freestyleSettings().bed });
      this.onBedChange();
    });
    this.reverbEl.addEventListener('input', () => {
      this.engine.setSettings({ reverb: Number(this.reverbEl.value) });
      this.paintReverb();
    });

    this.sync();
  }

  /** Push the current music and audio state into the controls. */
  sync(): void {
    const random = this.music.choice === RANDOM;
    this.keyEl.value = String(((this.music.root % 12) + 12) % 12);
    // Show the preference, not what it resolved to — otherwise a player on
    // random sees a named scale and has no way to know, or to get back.
    this.scaleEl.value = random ? RANDOM : this.music.id;
    // Which is why what it resolved to has to be said out loud.
    this.nowEl.textContent = `${noteName(this.music.root)} ${this.music.label}`;
    this.nowEl.style.opacity = random ? '1' : '0.5';
    this.reverbEl.value = String(this.engine.settings.reverb);
    this.paintReverb();
  }

  private paintReverb(): void {
    this.reverbEl.style.setProperty('--fill', `${Number(this.reverbEl.value) * 100}%`);
  }

  update(chord: string | null, bend: number, mod: number): void {
    this.chordEl.textContent = chord ?? ' ';
    this.chordEl.style.opacity = chord ? '1' : '0.22';
    this.bedEl.classList.toggle('on', freestyleSettings().bed);
    const bar = (v: number) => `<i style="width:${Math.round(Math.abs(v) * 100)}%"></i>`;
    this.wheelsEl.innerHTML =
      `<div class="wheel"><b>bend</b><span>${bar(bend)}</span></div>`
      + `<div class="wheel"><b>mod</b><span>${bar(mod)}</span></div>`;
  }
}
