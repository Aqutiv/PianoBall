import type { Hud } from '../../ui/hud';
import type { MusicState } from '../../audio/musicState';
import type { AudioEngine } from '../../audio/engine';
import type { RhythmBox } from '../../audio/rhythmBox';
import { MODES } from '../../audio/music';
import { MAX_BPM, MIN_BPM, RANDOM, toKeyChoice } from '../../audio/musicState';
import { PATTERNS, PATTERN_FAMILIES, findPattern } from '../../audio/patterns';
import {
  BED_FAMILIES, BED_VOICES, LEAD_FAMILIES, LEAD_VOICES,
} from '../../audio/voices';
import { NOTE_NAMES, noteName } from '../../midi/notes';
import { freestyleSettings, setFreestyleSettings } from './settings';
import { rhythmSettings, setRhythmSettings } from './rhythmSettings';

/**
 * Everything the player might want to change mid-phrase, on screen.
 *
 * Key, scale, instrument, rhythm, tempo, bed and room all live here rather
 * than behind Escape, because having to leave what you are playing to change
 * what you are playing it on is the opposite of freestyle.
 */
export class FreestyleHud {
  private chordEl!: HTMLElement;
  private keyEl!: HTMLSelectElement;
  private scaleEl!: HTMLSelectElement;
  private rollEl!: HTMLButtonElement;
  private nowEl!: HTMLElement;
  private bedEl!: HTMLButtonElement;
  private voiceEl!: HTMLSelectElement;
  private voiceLevelEl!: HTMLInputElement;
  private bedVoiceEl!: HTMLSelectElement;
  private bedLevelEl!: HTMLInputElement;
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
    // Bare `?` rather than the panel's spelled-out label: there is no room in
    // the card head, and the die beside it says what it means.
    const keys = `<option value="${RANDOM}">?</option>`
      + NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    // Random belongs here as much as in the panel: picking a named scale used
    // to overwrite it globally, quietly ending random-each-game for the table.
    const scales = `<option value="${RANDOM}">random</option>`
      + MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    const r = rhythmSettings();
    const s = freestyleSettings();

    // The left is what the player is playing: the chord under their hands, and
    // the instrument making it. Everything that plays *with* them — the key
    // they are all in, the rhythm, the bed — is on the right.
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="chord" id="fs-chord">&nbsp;</div>
      </div>
      <div class="hud-card">
        <div class="card-title">Instrument</div>
        <select class="hud-select" id="fs-voice" aria-label="Instrument">
          ${this.grouped(LEAD_VOICES, LEAD_FAMILIES, s.voiceId)}
        </select>
        ${this.knob('fs-voice-level', 'level', 0, 100, this.leadLevel())}
      </div>
    `;
    this.hud.right.innerHTML = `
      <div class="hud-card">
        <div class="card-head">
          <span class="card-title">Scale</span>
          <select class="hud-select" id="fs-key" aria-label="Key">${keys}</select>
          <button id="fs-roll" title="Draw again at random">&#9860;</button>
        </div>
        <select class="hud-select" id="fs-scale" aria-label="Scale">${scales}</select>
        <div class="score-sub" id="fs-now"></div>
      </div>
      <div class="hud-card">
        <div class="card-head">
          <button class="hud-toggle" id="fs-rhythm">Rhythm</button>
          <span class="rhythm-bpm"><b id="fs-bpm">${this.music.bpm}</b> bpm</span>
        </div>
        <select class="hud-select" id="fs-pattern" aria-label="Rhythm pattern">
          ${this.grouped(PATTERNS, PATTERN_FAMILIES, r.patternId)}
        </select>
        ${this.knob('fs-tempo', 'tempo', MIN_BPM, MAX_BPM, this.music.bpm)}
        ${this.knob('fs-swing', 'swing', 0, 100, Math.round(r.swing * 100))}
        ${this.knob('fs-level', 'level', 0, 100, Math.round(r.level * 100))}
        <div class="steps" id="fs-steps"></div>
      </div>
      <div class="hud-card">
        <button class="hud-toggle" id="fs-bed">Backing bed</button>
        <select class="hud-select" id="fs-bed-voice" aria-label="Backing bed sound">
          ${this.grouped(BED_VOICES, BED_FAMILIES, s.bedVoiceId)}
        </select>
        ${this.knob('fs-bed-level', 'level', 0, 100, this.bedLevel())}
      </div>
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
    this.voiceEl = q<HTMLSelectElement>('#fs-voice');
    this.voiceLevelEl = q<HTMLInputElement>('#fs-voice-level');
    this.bedVoiceEl = q<HTMLSelectElement>('#fs-bed-voice');
    this.bedLevelEl = q<HTMLInputElement>('#fs-bed-level');
    this.reverbEl = q<HTMLInputElement>('#fs-reverb');
    this.wheelsEl = q('#fs-wheels');
    this.rhythmEl = q<HTMLButtonElement>('#fs-rhythm');
    this.patternEl = q<HTMLSelectElement>('#fs-pattern');
    this.tempoEl = q<HTMLInputElement>('#fs-tempo');
    this.swingEl = q<HTMLInputElement>('#fs-swing');
    this.levelEl = q<HTMLInputElement>('#fs-level');
    this.bpmEl = q('#fs-bpm');
    this.stepsEl = q('#fs-steps');

    // Synced by hand as well as on the event: a draw that lands on the key
    // already sounding moves nothing and so announces nothing, and the readout
    // would sit there dimmed as though the key were still pinned.
    this.keyEl.addEventListener('change', () => {
      this.music.setKey(toKeyChoice(this.keyEl.value));
      this.sync();
    });
    this.scaleEl.addEventListener('change', () => this.music.setChoice(this.scaleEl.value));
    // Re-picking the option already selected fires no change event, so drawing
    // again needs a control of its own — the only way to ask for another key,
    // as well, without leaving the mode.
    this.rollEl.addEventListener('click', () => this.music.drawAgain());
    this.bedEl.addEventListener('click', () => {
      setFreestyleSettings({ bed: !freestyleSettings().bed });
      this.onBedChange();
    });
    // Neither cuts what is already sounding: a held note finishes as the
    // voice it was struck as, and the bed changes at the next chord.
    this.voiceEl.addEventListener('change', () => {
      this.engine.setLeadVoice(this.voiceEl.value);
      setFreestyleSettings({ voiceId: this.engine.leadVoice });
    });
    this.bedVoiceEl.addEventListener('change', () => {
      this.engine.setBedVoice(this.bedVoiceEl.value);
      setFreestyleSettings({ bedVoiceId: this.engine.bedVoice });
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
    // The same settings the panel's own faders write, not second copies of
    // them: whichever was touched last is where the sound is, wherever you
    // look next.
    this.bindKnob(this.voiceLevelEl, 0, 100, (v) => {
      this.engine.setSettings({ leadLevel: v / 100 });
    });
    this.bindKnob(this.bedLevelEl, 0, 100, (v) => {
      this.engine.setSettings({ bedLevel: v / 100 });
    });

    this.buildSteps();
    this.sync();
  }

  /** Push the current music and audio state into the controls. */
  sync(): void {
    const random = this.music.choice === RANDOM || this.music.keyChoice === RANDOM;
    // Show the preference, not what it resolved to — otherwise a player on
    // random sees a named key and scale and has no way to know, or to get back.
    this.keyEl.value = String(this.music.keyChoice);
    this.scaleEl.value = this.music.choice === RANDOM ? RANDOM : this.music.id;
    // Which is why what they resolved to has to be said out loud.
    this.nowEl.textContent = `${noteName(this.music.root)} ${this.music.label}`;
    this.nowEl.style.opacity = random ? '1' : '0.5';
    this.reverbEl.value = String(this.engine.settings.reverb);
    this.paintReverb();
    this.voiceLevelEl.value = String(this.leadLevel());
    this.paintKnob(this.voiceLevelEl, 0, 100);
    this.bedLevelEl.value = String(this.bedLevel());
    this.paintKnob(this.bedLevelEl, 0, 100);
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
    this.voiceEl.value = this.engine.leadVoice;
    this.bedVoiceEl.value = this.engine.bedVoice;
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

  /** The engine's faders as this HUD's knobs count, 0..100. */
  private leadLevel(): number {
    return Math.round(this.engine.settings.leadLevel * 100);
  }

  private bedLevel(): number {
    return Math.round(this.engine.settings.bedLevel * 100);
  }

  private paintReverb(): void {
    this.reverbEl.style.setProperty('--fill', `${Number(this.reverbEl.value) * 100}%`);
  }

  /**
   * A picker grouped by family, which all three of the long lists want: the
   * rhythms, the instrument and the bed. Families come from the library rather
   * than from here, so a new one appears in the list by being written.
   */
  private grouped(
    items: readonly { id: string; name: string; family: string }[],
    families: readonly string[],
    selected: string,
  ): string {
    return families.map((family) => {
      const options = items.filter((p) => p.family === family)
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
