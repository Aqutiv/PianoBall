import type { Hud } from '../../ui/hud';
import type { MusicState } from '../../audio/musicState';
import type { AudioEngine } from '../../audio/engine';
import type { RhythmBox } from '../../audio/rhythmBox';
import { MODES } from '../../audio/music';
import { MAX_BPM, MIN_BPM, RANDOM } from '../../audio/musicState';
import { PATTERNS, PATTERN_FAMILIES, findPattern } from '../../audio/patterns';
import { NOTE_NAMES, noteName } from '../../midi/notes';
import { freestyleSettings, setFreestyleSettings } from './settings';
import { rhythmSettings, setRhythmSettings } from './rhythmSettings';

/**
 * Everything the player might want to change mid-phrase, on screen.
 *
 * Key, scale, rhythm, tempo, bed and room all live here rather than behind
 * Escape, because having to leave what you are playing to change what you are
 * playing in is the opposite of freestyle.
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
  private rhythmEl!: HTMLButtonElement;
  private patternEl!: HTMLSelectElement;
  private tempoEl!: HTMLInputElement;
  private swingEl!: HTMLInputElement;
  private levelEl!: HTMLInputElement;
  private bpmEl!: HTMLElement;
  private stepsEl!: HTMLElement;
  private stepPips: HTMLElement[] = [];
  private litStep = -1;

  constructor(
    private readonly hud: Hud,
    private readonly music: MusicState,
    private readonly engine: AudioEngine,
    private readonly box: RhythmBox,
    private readonly onBedChange: () => void,
  ) {}

  mount(): void {
    const keys = NOTE_NAMES
      .map((n, i) => `<option value="${i}">${n}</option>`).join('');
    // Random belongs here as much as in the panel: picking a named scale used
    // to overwrite it globally, quietly ending random-each-game for the table.
    const scales = `<option value="${RANDOM}">random</option>`
      + MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    const r = rhythmSettings();

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
      <div class="rhythm">
        <div class="rhythm-head">
          <button class="hud-toggle" id="fs-rhythm">Rhythm</button>
          <span class="rhythm-bpm"><b id="fs-bpm">${this.music.bpm}</b> bpm</span>
        </div>
        <select class="hud-select" id="fs-pattern" aria-label="Rhythm pattern">
          ${this.patternOptions(r.patternId)}
        </select>
        ${this.knob('fs-tempo', 'tempo', MIN_BPM, MAX_BPM, this.music.bpm)}
        ${this.knob('fs-swing', 'swing', 0, 100, Math.round(r.swing * 100))}
        ${this.knob('fs-level', 'level', 0, 100, Math.round(r.level * 100))}
        <div class="steps" id="fs-steps"></div>
      </div>
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
    this.rhythmEl = q<HTMLButtonElement>('#fs-rhythm');
    this.patternEl = q<HTMLSelectElement>('#fs-pattern');
    this.tempoEl = q<HTMLInputElement>('#fs-tempo');
    this.swingEl = q<HTMLInputElement>('#fs-swing');
    this.levelEl = q<HTMLInputElement>('#fs-level');
    this.bpmEl = q('#fs-bpm');
    this.stepsEl = q('#fs-steps');

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

    this.rhythmEl.addEventListener('click', () => {
      const on = !this.box.playing;
      setRhythmSettings({ on });
      if (on) this.box.start(); else this.box.stop();
    });

    this.patternEl.addEventListener('change', () => {
      const pattern = findPattern(this.patternEl.value);
      this.box.setPattern(pattern);
      setRhythmSettings({ patternId: pattern.id });
      // A waltz has a different bar to a backbeat, so the row is rebuilt.
      this.buildSteps();
    });

    this.bindKnob(this.tempoEl, MIN_BPM, MAX_BPM, (v) => {
      this.music.setBpm(v);
      setRhythmSettings({ bpm: this.music.bpm });
    });
    this.bindKnob(this.swingEl, 0, 100, (v) => {
      this.box.swing = v / 100;
      setRhythmSettings({ swing: this.box.swing });
    });
    this.bindKnob(this.levelEl, 0, 100, (v) => {
      this.box.level = v / 100;
      setRhythmSettings({ level: this.box.level });
    });

    this.buildSteps();
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
    // A tune can retune the app from under the panel, and "reset everything"
    // can clear the rhythm from under it, so the controls follow the state
    // rather than only the other way round.
    this.tempoEl.value = String(this.music.bpm);
    this.paintKnob(this.tempoEl, MIN_BPM, MAX_BPM);
    this.swingEl.value = String(Math.round(this.box.swing * 100));
    this.paintKnob(this.swingEl, 0, 100);
    this.levelEl.value = String(Math.round(this.box.level * 100));
    this.paintKnob(this.levelEl, 0, 100);
    this.patternEl.value = this.box.pattern.id;
    if (this.stepPips.length !== this.box.pattern.steps) this.buildSteps();
  }

  update(chord: string | null, bend: number, mod: number): void {
    this.chordEl.textContent = chord ?? ' ';
    this.chordEl.style.opacity = chord ? '1' : '0.22';
    this.bedEl.classList.toggle('on', freestyleSettings().bed);
    this.rhythmEl.classList.toggle('on', this.box.playing);
    this.bpmEl.textContent = String(this.music.bpm);

    // Only the pip that moved is touched: the row is rebuilt when the pattern
    // changes and never on a frame, because the controls beside it are live.
    const step = this.box.step;
    if (step !== this.litStep) {
      this.stepPips[this.litStep]?.classList.remove('on');
      this.stepPips[step]?.classList.add('on');
      this.litStep = step;
    }

    const bar = (v: number) => `<i style="width:${Math.round(Math.abs(v) * 100)}%"></i>`;
    this.wheelsEl.innerHTML =
      `<div class="wheel"><b>bend</b><span>${bar(bend)}</span></div>`
      + `<div class="wheel"><b>mod</b><span>${bar(mod)}</span></div>`;
  }

  // ------------------------------------------------------------ plumbing ---

  private paintReverb(): void {
    this.reverbEl.style.setProperty('--fill', `${Number(this.reverbEl.value) * 100}%`);
  }

  private patternOptions(selected: string): string {
    return PATTERN_FAMILIES.map((family) => {
      const options = PATTERNS.filter((p) => p.family === family)
        .map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${p.name}</option>`)
        .join('');
      return `<optgroup label="${family}">${options}</optgroup>`;
    }).join('');
  }

  private knob(id: string, label: string, min: number, max: number, value: number): string {
    return `<label class="hud-knob"><b>${label}</b>`
      + `<input type="range" id="${id}" min="${min}" max="${max}" step="1" value="${value}"></label>`;
  }

  /** The track's fill is drawn from --fill, so it has to be repainted by hand. */
  private paintKnob(el: HTMLInputElement, min: number, max: number): void {
    el.style.setProperty('--fill', `${((Number(el.value) - min) / (max - min)) * 100}%`);
  }

  private bindKnob(el: HTMLInputElement, min: number, max: number, apply: (v: number) => void): void {
    el.addEventListener('input', () => {
      apply(Number(el.value));
      this.paintKnob(el, min, max);
    });
    this.paintKnob(el, min, max);
  }

  /** One pip per step of the current bar, with the beats marked. */
  private buildSteps(): void {
    const pattern = this.box.pattern;
    const per = pattern.steps / pattern.beats;
    this.stepsEl.innerHTML = Array.from(
      { length: pattern.steps },
      (_, i) => `<i class="${i % per === 0 ? 'beat' : ''}"></i>`,
    ).join('');
    this.stepPips = [...this.stepsEl.querySelectorAll('i')] as HTMLElement[];
    this.litStep = -1;
  }
}
