import type { Hud } from '../../ui/hud';
import type { MusicState } from '../../audio/musicState';
import type { AudioEngine } from '../../audio/engine';
import type { ChordBed, ManualChordQuality } from '../../audio/bed';
import type { NoteMapping } from '../../midi/mapping';
import type { RhythmBox } from '../../audio/rhythmBox';
import { identifyChord, MODES } from '../../audio/music';
import { MAX_BPM, MIN_BPM, RANDOM, toKeyChoice } from '../../audio/musicState';
import { PATTERNS, PATTERN_FAMILIES, findPattern } from '../../audio/patterns';
import {
  BED_FAMILIES, BED_VOICES, LEAD_FAMILIES, LEAD_VOICES,
} from '../../audio/voices';
import { NOTE_NAMES, noteName, noteLabel } from '../../midi/notes';
import { VoicePicker } from '../../ui/voicePicker';
import { freestyleSettings, setFreestyleSettings } from './settings';
import { rhythmSettings, setRhythmSettings } from './rhythmSettings';

interface BackingControls {
  bed: ChordBed;
  mapping: NoteMapping;
  change(): void;
  stop(): void;
  shift(dir: number): void;
  openSound(): void;
}

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
  private voiceEl!: VoicePicker;
  private voiceLevelEl!: HTMLInputElement;
  private bedVoiceEl!: VoicePicker;
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
  private backingKey = '';
  private backingName: string | null = null;
  private bedModeEls!: NodeListOf<HTMLInputElement>;
  private manualPanel!: HTMLElement;
  private autoHint!: HTMLElement;
  private autoPanel!: HTMLElement;
  private manualHint!: HTMLElement;
  private qualityEl!: HTMLSelectElement;
  private holdEl!: HTMLInputElement;
  private backingChordEl!: HTMLElement;
  private rangeEl!: HTMLElement;
  private stopEl!: HTMLButtonElement;
  private compactEl!: HTMLElement;
  private compactNameEl!: HTMLElement;
  private compactStopEl!: HTMLButtonElement;
  private mutedEl!: HTMLElement;
  private octaveDownEl!: HTMLButtonElement;
  private octaveUpEl!: HTMLButtonElement;
  private helpDialog!: HTMLDialogElement;
  private helpButton!: HTMLButtonElement;

  constructor(
    private readonly hud: Hud,
    private readonly music: MusicState,
    private readonly engine: AudioEngine,
    private readonly box: RhythmBox,
    private readonly backing: BackingControls,
  ) {}

  mount(): void {
    // Bare `?` rather than the panel's spelled-out label: there is no room in
    // the card head, and the die beside it says what it means.
    const keys = `<option value="${RANDOM}">?</option>`
      + NOTE_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
    // These choices belong to Freestyle; Pinball has separate saved preferences.
    const scales = `<option value="${RANDOM}">random</option>`
      + MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
    const r = rhythmSettings();
    const s = freestyleSettings();

    // Backing and its chord live on the left. The lead instrument and rhythm
    // live on the right; melody keeps its own field visuals.
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="chord" id="fs-chord">&nbsp;</div>
      </div>
      <div class="fs-compact" id="fs-compact" hidden>
        <span id="fs-compact-name"></span>
        <button type="button" id="fs-compact-stop" aria-label="Stop backing chord">Stop</button>
      </div>
      <div class="hud-card fs-backing">
        <div class="card-head">
          <span class="card-title">Backing</span>
          <button type="button" class="hud-toggle" id="fs-bed" aria-label="Backing" aria-pressed="false">Off</button>
        </div>
        <div class="fs-mode" role="radiogroup" aria-label="Backing mode">
          <label><input type="radio" name="fs-bed-mode" value="auto"><span>Auto</span></label>
          <label><input type="radio" name="fs-bed-mode" value="manual" aria-describedby="fs-manual-hint"><span>Manual</span></label>
        </div>
      <div class="fs-auto" id="fs-auto">
        <div class="card-title">Key &amp; scale</div>
        <div class="card-head">
          <select class="hud-select" id="fs-key" aria-label="Key">${keys}</select>
          <button type="button" id="fs-roll" aria-label="Draw a random scale" title="Draw again at random">&#9860;</button>
        </div>
        <select class="hud-select" id="fs-scale" aria-label="Scale">${scales}</select>
        <div class="fs-hint" id="fs-now"></div>
      </div>
        <p class="fs-hint" id="fs-auto-hint">Colored keys match the scale. Brighter keys are the root.</p>
        <p class="fs-hint" id="fs-manual-hint" hidden>Manual needs at least 12 mapped keys.</p>
        <div class="fs-manual" id="fs-manual" hidden>
          <label class="fs-quality">Chord type
            <select class="hud-select" id="fs-quality">
              <option value="maj">Major</option><option value="min">Minor</option>
              <option value="dom7">7</option><option value="min7">m7</option>
            </select>
          </label>
          <label class="fs-hold"><span>Hold chord</span><input type="checkbox" id="fs-hold"></label>
          <div class="fs-current" role="status" aria-live="polite" aria-atomic="true" id="fs-backing-chord"></div>
          <button type="button" id="fs-stop-chord">Stop chord</button>
          <div class="fs-range"><span>Chord keys <b id="fs-range"></b></span>
            <div><button type="button" id="fs-oct-down" aria-label="Octave down" title="Shift the visible keys and backing down an octave">−8</button><button type="button" id="fs-oct-up" aria-label="Octave up" title="Shift the visible keys and backing up an octave">+8</button></div>
          </div>
          <dialog class="fs-help-dialog" id="fs-help-dialog" aria-labelledby="fs-help-title">
            <div class="fs-help-head">
              <h2 id="fs-help-title">How to play chords</h2>
              <button type="button" id="fs-close-help" aria-label="Close chord help" autofocus>✕</button>
            </div>
            <div class="fs-help-body" tabindex="0" role="region" aria-label="Chord playing instructions">
              <p>Play a key in the marked octave for the selected chord type. The remaining keys play melody.</p>
              <p>The lowest held chord key is the root. Hold it and add keys to its right:</p>
              <table>
                <thead><tr><th scope="col">Keys held</th><th scope="col">Chord</th></tr></thead>
                <tbody>
                  <tr><th scope="row">1 key</th><td>Selected chord type</td></tr>
                  <tr><th scope="row">2 keys</th><td>Minor</td></tr>
                  <tr><th scope="row">3 keys</th><td>Dominant seventh (7)</td></tr>
                  <tr><th scope="row">4 or more keys</th><td>Minor seventh (m7)</td></tr>
                </tbody>
              </table>
              <p>Black or white keys both work. Near the split, use <strong>Chord type</strong> for one-finger chords. Release the gesture before choosing a new root.</p>
              <p><strong>Hold chord</strong> keeps pads sounding and repeats decaying sounds every two bars. Use <strong>Stop chord</strong> to silence the backing.</p>
              <p>Manual chords and melody notes follow the keys you play, independently of the Auto scale.</p>
              <p>Controller octave buttons send new note pitches. Play an end key to update the visible range, or use <strong>−8 / +8</strong> in Backing.</p>
            </div>
          </dialog>
        </div>
        <p class="fs-hint fs-muted" id="fs-muted" hidden>Backing is muted in Sound &amp; music.
          <button type="button" id="fs-open-sound">Open sound settings</button>
        </p>
        <div id="fs-bed-voice"></div>
        ${this.knob('fs-bed-level', 'level', 0, 100, this.bedLevel())}
        <button type="button" class="fs-help" id="fs-open-help" aria-haspopup="dialog" aria-controls="fs-help-dialog" title="Open chord help" hidden>
          <span>How to play chords</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
            <path d="M14 4h6v6M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>
          </svg>
        </button>
      </div>
    `;
    this.hud.right.innerHTML = `
      <div class="hud-card">
        <div class="card-title">Instrument</div>
        <div id="fs-voice"></div>
        ${this.knob('fs-voice-level', 'level', 0, 100, this.leadLevel())}
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
    this.bedModeEls = this.hud.left.querySelectorAll<HTMLInputElement>('input[name="fs-bed-mode"]');
    this.manualPanel = q('#fs-manual');
    this.autoHint = q('#fs-auto-hint');
    this.autoPanel = q('#fs-auto');
    this.manualHint = q('#fs-manual-hint');
    this.qualityEl = q<HTMLSelectElement>('#fs-quality');
    this.holdEl = q<HTMLInputElement>('#fs-hold');
    this.backingChordEl = q('#fs-backing-chord');
    this.rangeEl = q('#fs-range');
    this.stopEl = q<HTMLButtonElement>('#fs-stop-chord');
    this.compactEl = q('#fs-compact');
    this.compactNameEl = q('#fs-compact-name');
    this.compactStopEl = q<HTMLButtonElement>('#fs-compact-stop');
    this.mutedEl = q('#fs-muted');
    this.octaveDownEl = q<HTMLButtonElement>('#fs-oct-down');
    this.octaveUpEl = q<HTMLButtonElement>('#fs-oct-up');
    this.helpDialog = q<HTMLDialogElement>('#fs-help-dialog');
    this.helpButton = q<HTMLButtonElement>('#fs-open-help');
    this.helpButton.addEventListener('click', () => {
      this.helpDialog.showModal();
      this.helpDialog.querySelector('.fs-help-body')!.scrollTop = 0;
    });
    q('#fs-close-help').addEventListener('click', () => this.closeHelp());
    // Escape belongs to this dialog, not the pause menu. Key-up still reaches
    // the input hub so notes held before opening the help can be released.
    this.helpDialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      const close = q<HTMLButtonElement>('#fs-close-help');
      const body = this.helpDialog.querySelector<HTMLElement>('.fs-help-body')!;
      // Keep Tab in the help: tabbing into browser chrome would blur the app
      // and trigger its focus-loss pause.
      if (event.shiftKey && document.activeElement === close) {
        event.preventDefault();
        body.focus();
      } else if (!event.shiftKey && document.activeElement === body) {
        event.preventDefault();
        close.focus();
      }
    });
    this.helpDialog.addEventListener('click', (event) => {
      if (event.target !== this.helpDialog) return;
      const r = this.helpDialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right
        || event.clientY < r.top || event.clientY > r.bottom) this.closeHelp();
    });
    this.backingKey = '';
    const change = () => { this.backing.change(); this.syncBacking(); };
    for (const radio of this.bedModeEls) radio.addEventListener('change', () => {
      if (radio.checked) setFreestyleSettings({ bedMode: radio.value as 'auto' | 'manual' });
      change();
    });
    this.qualityEl.addEventListener('change', () => {
      setFreestyleSettings({ manualChordQuality: this.qualityEl.value as ManualChordQuality });
      change();
    });
    this.holdEl.addEventListener('change', () => {
      setFreestyleSettings({ holdChord: this.holdEl.checked });
      change();
    });
    const stop = () => { this.backing.stop(); this.syncBacking(); };
    this.stopEl.addEventListener('click', stop);
    this.compactStopEl.addEventListener('click', stop);
    this.octaveDownEl.addEventListener('click', () => { this.backing.shift(-1); this.syncBacking(); });
    this.octaveUpEl.addEventListener('click', () => { this.backing.shift(1); this.syncBacking(); });
    q('#fs-open-sound').addEventListener('click', () => this.backing.openSound());
    // Mouse/touch controls hand the computer keyboard back after activation.
    for (const panel of [this.hud.left, this.hud.right]) {
      for (const node of panel.querySelectorAll<HTMLElement>('button, input[type="radio"], summary')) {
        node.addEventListener('click', (event) => { if (event.detail > 0) node.blur(); });
      }
    }
    // Neither picker cuts what is already sounding: a held note finishes as
    // the voice it was struck as, and the bed changes at the next chord.
    this.voiceEl = this.mountPicker(q('#fs-voice'), LEAD_VOICES, LEAD_FAMILIES, s.voiceId,
      'Instrument', (id) => {
        this.engine.setLeadVoice(id);
        setFreestyleSettings({ voiceId: this.engine.leadVoice });
      });
    this.voiceLevelEl = q<HTMLInputElement>('#fs-voice-level');
    this.bedVoiceEl = this.mountPicker(q('#fs-bed-voice'), BED_VOICES, BED_FAMILIES,
      s.bedVoiceId, 'Backing sound', (id) => {
        this.engine.setBedVoice(id);
        setFreestyleSettings({ bedVoiceId: this.engine.bedVoice });
        this.backing.bed.refreshManualChord();
      });
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
      change();
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
      this.backing.bed.setManualMeter(pattern.beats);
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

  destroy(): void {
    this.closeHelp();
    this.voiceEl?.destroy();
    this.bedVoiceEl?.destroy();
  }

  closeHelp(): void {
    if (this.helpDialog?.open) this.helpDialog.close();
  }

  /** Push the current music and audio state into the controls. */
  sync(): void {
    // Show the preference, not what it resolved to — otherwise a player on
    // random sees a named key and scale and has no way to know, or to get back.
    this.keyEl.value = String(this.music.keyChoice);
    this.scaleEl.value = this.music.choice === RANDOM ? RANDOM : this.music.id;
    // Which is why what they resolved to has to be said out loud.
    this.nowEl.textContent = `${noteName(this.music.root)} ${this.music.label}`;
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
    this.voiceEl.setValue(this.engine.leadVoice);
    this.bedVoiceEl.setValue(this.engine.bedVoice);
    if (this.stepPips.length !== this.box.pattern.steps) this.buildSteps();
    this.syncBacking();
  }

  update(leadChord: string | null, bend: number, mod: number): void {
    this.syncBacking();
    const s = freestyleSettings();
    // Backing owns this readout whenever it is on. An empty Manual chord
    // stays blank; Auto follows the progression's current voiced chord.
    const chord = !s.bed ? leadChord : s.bedMode === 'manual'
      ? this.backingName : identifyChord(this.backing.bed.chordTones);
    this.chordEl.textContent = chord ?? ' ';
    this.chordEl.style.opacity = chord ? '1' : '0.22';
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

  private syncBacking(): void {
    const s = freestyleSettings();
    const { bed, mapping } = this.backing;
    const chord = bed.manualChord;
    const supported = mapping.settings.count >= 12;
    const manual = s.bedMode === 'manual';
    const muted = !this.engine.settings.bed;
    const key = JSON.stringify([s.bed, s.bedMode, s.manualChordQuality, s.holdChord, chord,
      mapping.low, mapping.settings.count, muted]);
    if (key === this.backingKey) return;
    this.backingKey = key;
    this.bedEl.classList.toggle('on', s.bed);
    this.bedEl.textContent = s.bed ? 'On' : 'Off';
    this.bedEl.setAttribute('aria-pressed', String(s.bed));
    for (const radio of this.bedModeEls) {
      radio.checked = radio.value === s.bedMode;
      radio.disabled = radio.value === 'manual' && !supported;
    }
    this.manualPanel.hidden = !manual || !supported;
    this.helpButton.hidden = this.manualPanel.hidden;
    this.autoHint.hidden = manual;
    this.autoPanel.hidden = manual;
    this.manualHint.hidden = supported;
    this.qualityEl.value = s.manualChordQuality;
    this.holdEl.checked = s.holdChord;
    const suffix = chord ? { maj: '', min: 'm', dom7: '7', min7: 'm7' }[chord.quality] : '';
    const name = chord ? noteName(chord.root) + suffix : '';
    this.backingName = name || null;
    this.backingChordEl.textContent = chord ? name + ' · root ' + noteLabel(chord.root)
      : s.bed ? 'Press a chord key' : 'Turn Backing on to play chords';
    this.stopEl.disabled = !chord;
    this.compactStopEl.disabled = !chord;
    this.compactEl.hidden = !manual || !s.bed || !supported;
    this.compactNameEl.textContent = 'Manual · ' + (muted ? 'Muted' : name || 'Ready');
    this.rangeEl.textContent = noteLabel(mapping.low) + '–' + noteLabel(mapping.low + 11);
    this.octaveDownEl.disabled = mapping.low <= 0;
    this.octaveUpEl.disabled = mapping.low >= 127 - mapping.settings.count;
    this.mutedEl.hidden = !muted;
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
  /**
   * Swap a placeholder div for a picker.
   *
   * The HUD is written as one `innerHTML` string, so the pickers cannot be
   * built inline with everything else; they are mounted into the holes that
   * string leaves behind, which also keeps their DOM out of the template.
   */
  private mountPicker(
    host: HTMLElement,
    items: readonly { id: string; name: string; family: string }[],
    families: readonly string[],
    selected: string,
    label: string,
    onPick: (id: string) => void,
  ): VoicePicker {
    const picker = new VoicePicker(items, families, selected, label, onPick);
    host.replaceWith(picker.el);
    return picker;
  }

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
