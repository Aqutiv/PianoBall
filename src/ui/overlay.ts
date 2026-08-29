import { noteLabel, noteName, NOTE_NAMES } from '../midi/notes';
import { MODES } from '../audio/music';
import { RANDOM } from '../audio/musicState';
import type { CurveName } from '../midi/velocityCurve';
import type { Shell } from '../app/shell';
import type { GameModeId } from '../app/mode';
import { loadScores } from '../modes/pinball/pinball';
import type { ModTarget } from '../audio/engine';
import { playTuneSettings, setPlayTuneSettings } from '../modes/playtune/settings';
import { loadProgress, resetProgress } from '../modes/playtune/progress';
import { TUNE_ORDER } from '../modes/playtune/library';

export type Screen =
  | 'home'
  | 'settings'
  | 'calibrate'
  | 'paused'
  | 'gameover'
  | 'songs'
  | 'result'
  | null;

/**
 * Menus, settings and the MIDI monitor.
 *
 * The monitor matters more than it looks: controllers differ in what their
 * octave, bend and sustain controls actually transmit, and this is where that
 * gets discovered rather than assumed.
 */
export class Overlay {
  screen: Screen = 'home';
  private body!: HTMLElement;
  private live: (() => void) | null = null;
  /** Drops whatever input subscription the current screen took out. */
  private offInput: (() => void) | null = null;
  /** Index of the highlighted mode card on the home screen. */
  private cursor = 0;
  /**
   * Where Back should go from settings or calibration.
   *
   * Settings can be opened from the menu, from a pause, or from the song list,
   * and it has to return to whichever it was — inferring it from "is a mode
   * loaded" was wrong, because one is always loaded to sit behind the menu.
   */
  private returnTo: Screen = 'home';

  constructor(private readonly root: HTMLElement, private readonly shell: Shell) {
    root.innerHTML = '<div class="panel" id="panel"></div>';
    this.body = root.querySelector('#panel')!;
    this.show('home');

    root.addEventListener('click', (e) => {
      // Clicking the backdrop steps back, but never out of the home screen —
      // there is nothing behind it.
      if (e.target === root && this.screen !== 'home') {
        if (this.screen === 'paused') this.shell.resumeMode();
        else if (this.screen === 'songs' || this.screen === 'result') this.show('home');
        else this.back();
      }
    });
  }

  get visible(): boolean { return this.screen !== null; }

  show(screen: Screen): void {
    const sub = screen === 'settings' || screen === 'calibrate';
    const wasSub = this.screen === 'settings' || this.screen === 'calibrate';
    if (sub && !wasSub) this.returnTo = this.screen ?? (this.shell.playing ? 'paused' : 'home');
    this.screen = screen;
    this.live = null;
    this.offInput?.();
    this.offInput = null;
    if (!screen) { this.root.classList.remove('show'); return; }
    this.root.classList.add('show');
    this.body.scrollTop = 0;
    if (screen === 'home') this.renderHome();
    else if (screen === 'settings') this.renderSettings();
    else if (screen === 'calibrate') this.renderCalibrate();
    else if (screen === 'paused') this.renderPaused();
    else if (screen === 'gameover') this.renderGameOver();
    else if (screen === 'songs') this.renderSongs();
    else if (screen === 'result') this.renderResult();
  }

  hide(): void { this.show(null); }

  /** Leave a sub-screen for whatever opened it. */
  back(): void {
    if (this.returnTo === null) this.shell.resumeMode();
    else this.show(this.returnTo);
  }

  /** Refresh the live parts of the current screen. */
  update(): void { this.live?.(); }

  /** Keyboard navigation, forwarded by the shell. */
  onKey(e: KeyboardEvent): void {
    if (this.screen !== 'home') return;
    const modes = this.shell.modes;
    if (!modes.length) return;
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
      this.cursor = (this.cursor + 1) % modes.length;
    } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      this.cursor = (this.cursor - 1 + modes.length) % modes.length;
    } else if (e.code === 'Enter' || e.code === 'Space') {
      this.shell.play(modes[this.cursor].id);
      return;
    } else if (/^Digit[1-9]$/.test(e.code)) {
      const i = Number(e.code.slice(5)) - 1;
      if (i < modes.length) this.shell.play(modes[i].id);
      return;
    } else {
      return;
    }
    e.preventDefault();
    const cards = this.body.querySelectorAll('.mode-card');
    cards.forEach((el, i) => el.classList.toggle('on', i === this.cursor));
  }

  private deviceLine(): string {
    const midi = this.shell.input.midi;
    const dev = midi.devices.find((x) => x.id === midi.selectedId);
    if (midi.status === 'ready' && dev) {
      return `<span class="pill" style="border-color:rgba(69,226,160,.5)">${dev.name}</span> connected`;
    }
    if (midi.status === 'unsupported') return 'This browser has no Web MIDI — Chrome or Edge do.';
    if (midi.status === 'denied') return 'MIDI access was declined.';
    return 'No MIDI device found.';
  }

  // ---------------------------------------------------------------- home ---

  private renderHome(): void {
    const modes = this.shell.modes;
    const last = this.shell.lastMode;
    const at = modes.findIndex((m) => m.id === last);
    this.cursor = at >= 0 ? at : 0;
    const m = this.shell.input.mapping;

    const cards = modes.map((info, i) => `
      <button class="mode-card${i === this.cursor ? ' on' : ''}" data-mode="${info.id}">
        <span class="mode-glyph">${info.glyph}</span>
        <span class="mode-name">${info.title}<span class="mode-key">${i + 1}</span></span>
        <span class="mode-tag">${info.tagline}</span>
        ${info.id === last ? '<span class="mode-last">last played</span>' : ''}
      </button>
    `).join('');

    this.body.innerHTML = `
      <h1>PianoBall</h1>
      <p class="lede">Your MIDI keyboard, three ways. All of it plays from the computer
      keyboard or touch as well.</p>

      <div class="mode-grid">${cards}</div>

      <h2>Controller</h2>
      <p>${this.deviceLine()}</p>
      <p class="diag">Mapped ${noteLabel(m.low)}&ndash;${noteLabel(m.high)} &middot; ${m.settings.count} keys</p>

      <div class="actions">
        <button id="btn-settings">Settings</button>
        <span class="diag"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> to choose &middot; <kbd>Enter</kbd> to play</span>
      </div>
    `;

    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('.mode-card'))) {
      el.addEventListener('click', () => this.shell.play(el.dataset.mode as GameModeId));
    }
    this.body.querySelector('#btn-settings')!.addEventListener('click', () => this.show('settings'));
  }

  // -------------------------------------------------------------- paused ---

  private renderPaused(): void {
    const info = this.shell.modes.find((x) => x.id === this.shell.modeId);
    this.body.innerHTML = `
      <h1>Paused</h1>
      <p class="lede">${info?.title ?? ''}</p>
      <div class="actions">
        <button class="primary" id="btn-resume">Resume</button>
        <button id="btn-restart">Restart</button>
        <button id="btn-home">Change mode</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;
    const on = (sel: string, fn: () => void) =>
      this.body.querySelector(sel)!.addEventListener('click', fn);
    on('#btn-resume', () => this.shell.resumeMode());
    on('#btn-restart', () => { this.hide(); this.shell.restartMode(); });
    on('#btn-home', () => this.show('home'));
    on('#btn-settings', () => this.show('settings'));
  }

  // ------------------------------------------------------------ game over ---

  private renderGameOver(): void {
    const result = this.shell.lastResult;
    const best = loadScores().pinball;
    const lines = (result?.lines ?? [])
      .map((l) => `<div class="row"><label>${l.label}</label><span>${l.value}</span></div>`).join('');
    this.body.innerHTML = `
      <h1>${result?.title ?? 'Game over'}</h1>
      ${lines}
      <div class="row"><label>Best</label><span>${best.toLocaleString()}</span></div>
      <div class="actions">
        <button class="primary" id="btn-again">Play again</button>
        <button id="btn-home">Change mode</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;
    const on = (sel: string, fn: () => void) =>
      this.body.querySelector(sel)!.addEventListener('click', fn);
    on('#btn-again', () => { this.hide(); this.shell.restartMode(); });
    on('#btn-home', () => this.show('home'));
    on('#btn-settings', () => this.show('settings'));
  }

  // ------------------------------------------------------------ playtune ---

  private renderSongs(): void {
    const mode = this.shell.playtune;
    if (!mode) { this.show('home'); return; }
    const progress = mode.progress;

    const cards = mode.tunes.map((tune, i) => {
      const unlocked = progress.unlocked.includes(tune.id);
      const best = progress.best[tune.id];
      const fits = mode.fitFor(tune) !== null;
      const previous = i > 0 ? mode.tunes[i - 1].title : null;
      const pips = Array.from({ length: 5 }, (_, d) =>
        `<i class="${d < tune.difficulty ? 'on' : ''}"></i>`).join('');

      const state = !unlocked
        ? `<span class="song-locked">Pass ${previous} to unlock</span>`
        : !fits
          ? '<span class="song-locked">Needs more keys than your controller has</span>'
          : best
            ? `<span class="song-best">${best.grade ?? '—'} · ${Math.round(best.accuracy * 100)}%</span>`
            : '<span class="song-best song-new">new</span>';

      return `
        <button class="song-card${unlocked && fits ? '' : ' locked'}" data-tune="${tune.id}"
          ${unlocked && fits ? '' : 'disabled'}>
          <span class="song-name">${tune.title}</span>
          <span class="pips">${pips}</span>
          <span class="song-by">${tune.composer}</span>
          <span class="song-teaches">${tune.teaches}</span>
          ${state}
        </button>`;
    }).join('');

    const done = mode.tunes.filter((t) => progress.best[t.id]?.grade).length;
    this.body.innerHTML = `
      <h1>PlayTune</h1>
      <p class="lede">The game plays the chords. You play the tune on top —
      press each key as its aura reaches it.</p>
      <p class="diag">${progress.unlocked.length} of ${mode.tunes.length} unlocked &middot; ${done} passed</p>
      <div class="song-list">${cards}</div>
      <div class="actions">
        <button id="btn-home">Change mode</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;

    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('.song-card'))) {
      el.addEventListener('click', () => {
        const id = el.dataset.tune!;
        this.hide();
        void this.shell.startAudio().then(() => { if (!mode.start(id)) this.show('songs'); });
      });
    }
    this.body.querySelector('#btn-home')!.addEventListener('click', () => this.show('home'));
    this.body.querySelector('#btn-settings')!.addEventListener('click', () => this.show('settings'));
  }

  private renderResult(): void {
    const result = this.shell.lastResult;
    const mode = this.shell.playtune;
    const tune = mode?.tune ?? null;
    const order = mode?.tunes ?? [];
    const at = tune ? order.findIndex((t) => t.id === tune.id) : -1;
    const next = at >= 0 ? order[at + 1] : undefined;
    const nextOpen = next && mode?.progress.unlocked.includes(next.id);

    const lines = (result?.lines ?? [])
      .map((l) => `<div class="row"><label>${l.label}</label><span>${l.value}</span></div>`).join('');

    this.body.innerHTML = `
      <h1>${result?.title ?? 'Finished'}</h1>
      ${lines}
      <div class="actions">
        <button class="primary" id="btn-again">Play again</button>
        ${nextOpen ? `<button id="btn-next">Next: ${next!.title}</button>` : ''}
        <button id="btn-list">Song list</button>
      </div>
    `;
    const on = (sel: string, fn: () => void) =>
      this.body.querySelector(sel)?.addEventListener('click', fn);
    on('#btn-again', () => { if (tune && mode) { this.hide(); mode.start(tune.id); } });
    on('#btn-next', () => { if (next && mode) { this.hide(); mode.start(next.id); } });
    on('#btn-list', () => this.show('songs'));
  }

  // ----------------------------------------------------------- calibrate ---

  private renderCalibrate(): void {
    const m = this.shell.input.mapping;
    m.beginCalibration();
    this.body.innerHTML = `
      <h1>Calibrate</h1>
      <p class="lede" id="cal-step"></p>
      <p class="diag">Works with any controller from 25 to 88 keys.</p>
      <div class="actions">
        <button id="btn-done">Cancel</button>
      </div>
    `;
    const step = this.body.querySelector('#cal-step') as HTMLElement;
    const done = this.body.querySelector('#btn-done') as HTMLElement;
    done.addEventListener('click', () => {
      m.cancelCalibration();
      this.show('settings');
    });

    // Nothing else feeds the calibration: without this the panel asks for a key
    // and then ignores every one it is given. The subscription lives exactly as
    // long as the screen does.
    this.offInput = this.shell.input.on((e) => {
      if (e.type !== 'noteon' || m.phase === 'done') return;
      if (m.calibrate(e.note) === 'done') this.shell.remapKeys();
    });

    // Only the wording changes as keys are pressed, so only the wording is
    // rewritten. Rebuilding the panel each frame replaced the button between
    // mousedown and mouseup, and a real click could never complete on it.
    this.live = () => {
      if (this.screen !== 'calibrate') return;
      step.innerHTML = m.phase === 'low'
        ? 'Press the <strong>lowest</strong> key on your controller.'
        : m.phase === 'high'
          ? 'Now press the <strong>highest</strong> key.'
          : `Mapped ${noteLabel(m.low)}&ndash;${noteLabel(m.high)} &middot; ${m.settings.count} keys.`;
      done.textContent = m.phase === 'done' ? 'Done' : 'Cancel';
    };
    this.live();
  }

  // ------------------------------------------------------------ settings ---

  private renderSettings(): void {
    const { input, audio, stage, music } = this.shell;
    const tune = playTuneSettings();
    const midi = input.midi;
    const opts = midi.devices.map((dv) =>
      `<option value="${dv.id}" ${dv.id === midi.selectedId ? 'selected' : ''}>${dv.name}</option>`).join('');
    const curves: CurveName[] = ['soft', 'linear', 'hard', 'gamma', 'fixed'];
    const nowKey = ((music.root % 12) + 12) % 12;
    const keys = NOTE_NAMES
      .map((n, i) => `<option value="${i}" ${i === nowKey ? 'selected' : ''}>${n}</option>`).join('');
    const scales = [`<option value="${RANDOM}" ${music.choice === RANDOM ? 'selected' : ''}>Random each game</option>`]
      .concat(MODES.map((mode) =>
        `<option value="${mode.id}" ${music.choice === mode.id ? 'selected' : ''}>${mode.label}</option>`))
      .join('');

    this.body.innerHTML = `
      <h1>Settings</h1>

      <h2>Controller</h2>
      <div class="row"><label>MIDI device</label>
        <select id="dev">${opts || '<option>None found</option>'}</select></div>
      <div class="row"><label>Mapped range</label>
        <span class="diag" id="range"></span></div>
      <div class="row"><label>Octave</label>
        <span><button id="oct-down">&minus;12</button> <button id="oct-up">+12</button>
        <button id="cal">Calibrate&hellip;</button></span></div>
      <div class="row"><label>Velocity curve</label>
        <select id="curve">${curves.map((c) => `<option value="${c}" ${input.velocity.curve === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <p class="diag">How hard you actually play, over the last few hundred notes:</p>
      <div class="hist" id="hist"></div>

      <h2>Audio</h2>
      <div class="row"><label>Master</label><input type="range" id="vol-master" min="0" max="1" step="0.01" value="${audio.settings.master}"></div>
      <div class="row"><label>Music</label><input type="range" id="vol-music" min="0" max="1" step="0.01" value="${audio.settings.music}"></div>
      <div class="row"><label>Impacts</label><input type="range" id="vol-fx" min="0" max="1" step="0.01" value="${audio.settings.effects}"></div>
      <div class="row"><label>Room</label><input type="range" id="vol-reverb" min="0" max="1" step="0.01" value="${audio.settings.reverb}"></div>
      <div class="row"><label>Key</label>
        <select id="key">${keys}</select></div>
      <div class="row"><label>Scale</label>
        <select id="scale">${scales}</select></div>
      <p class="diag" id="scale-now"></p>
      <div class="row"><label>Backing bed</label>
        <button id="bed">${audio.settings.bed ? 'On' : 'Off'}</button></div>

      <h2>Pinball</h2>
      <div class="row"><label>Snap off-scale notes into the key</label>
        <button id="assist">${audio.settings.assist ? 'On' : 'Off'}</button></div>
      <p class="diag">Pinball only. Freestyle plays exactly what you press, and
        PlayTune takes the chart as the authority on what the note should be.</p>

      <h2>Freestyle</h2>
      <div class="row"><label>Pitch bend range</label>
        <select id="bend-range">
          <option value="2" ${audio.settings.bendRange === 2 ? 'selected' : ''}>&plusmn;2 semitones</option>
          <option value="7" ${audio.settings.bendRange === 7 ? 'selected' : ''}>&plusmn;5th</option>
          <option value="12" ${audio.settings.bendRange === 12 ? 'selected' : ''}>&plusmn;octave</option>
        </select></div>
      <div class="row"><label>Mod wheel moves</label>
        <select id="mod-target">
          <option value="vibrato" ${audio.settings.modTarget === 'vibrato' ? 'selected' : ''}>Vibrato</option>
          <option value="colour" ${audio.settings.modTarget === 'colour' ? 'selected' : ''}>Colour</option>
          <option value="both" ${audio.settings.modTarget === 'both' ? 'selected' : ''}>Both</option>
        </select></div>
      <p class="diag">Without a controller, <kbd>&larr;</kbd> <kbd>&rarr;</kbd> bend and
        <kbd>&uarr;</kbd> <kbd>&darr;</kbd> step the mod wheel.</p>

      <h2>PlayTune</h2>
      <div class="row"><label>Audio offset</label>
        <span><input type="range" id="pt-offset" min="-120" max="120" step="5" value="${tune.offsetMs}">
        <span class="diag" id="pt-offset-now"></span></span></div>
      <p class="diag">Raise this if your hits are judged early &mdash; that is, if you
        are landing late. Lower it if you are landing early. Your device already
        reports ${audio.latencyMs.toFixed(0)} ms of its own.</p>
      <div class="row"><label>Note approach</label>
        <select id="pt-lead">
          ${[3, 4, 6, 8].map((b) => `<option value="${b}" ${tune.leadBeats === b ? 'selected' : ''}>${b} beats</option>`).join('')}
        </select></div>
      <div class="row"><label>Light the key a note is heading for</label>
        <button id="pt-assist">${tune.assist ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Unlocked tunes</label>
        <span><span class="diag" id="pt-unlocked"></span> <button id="pt-reset">Reset&hellip;</button></span></div>

      <h2>Display</h2>
      <div class="row"><label>Bloom</label><button id="q-bloom">${stage.quality.bloom ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Note labels</label><button id="q-labels">${stage.quality.labels ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Reduced motion</label><button id="q-motion">${stage.quality.reducedMotion ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Colour-blind palette</label><button id="q-cb">${stage.quality.colorBlind ? 'On' : 'Off'}</button></div>

      <h2>MIDI monitor</h2>
      <p class="diag">Raw messages from your controller. Use this to see what the octave,
      pitch bend and sustain controls actually send.</p>
      <div class="monitor" id="mon">waiting&hellip;</div>
      <div class="actions">
        <button id="clear-mon">Clear</button>
        <span class="diag" id="diag"></span>
      </div>

      <div class="actions settings-actions">
        <button class="primary" id="close">Back</button>
        <button id="reset-settings">Reset settings</button>
      </div>
    `;

    const $ = <T extends HTMLElement>(sel: string) => this.body.querySelector(sel) as T;

    $('#close').addEventListener('click', () => this.back());
    $('#cal').addEventListener('click', () => this.show('calibrate'));
    $('#oct-down').addEventListener('click', () => { input.mapping.shiftOctave(-1); this.shell.remapKeys(); });
    $('#oct-up').addEventListener('click', () => { input.mapping.shiftOctave(1); this.shell.remapKeys(); });
    $<HTMLSelectElement>('#dev').addEventListener('change', (e) => midi.select((e.target as HTMLSelectElement).value));
    $<HTMLSelectElement>('#curve').addEventListener('change', (e) =>
      input.setVelocitySettings({ curve: (e.target as HTMLSelectElement).value as CurveName }));
    $<HTMLSelectElement>('#scale').addEventListener('change', (e) =>
      music.setChoice((e.target as HTMLSelectElement).value));
    $<HTMLSelectElement>('#key').addEventListener('change', (e) =>
      music.setRoot(Number((e.target as HTMLSelectElement).value)));

    const bindSlider = (sel: string, key: 'master' | 'music' | 'effects' | 'reverb') => {
      const el = $<HTMLInputElement>(sel);
      // The track's fill is painted from this, so it needs setting on the way in
      // as well as on every move.
      const paint = () => el.style.setProperty('--fill', `${Number(el.value) * 100}%`);
      el.addEventListener('input', () => {
        audio.setSettings({ [key]: Number(el.value) });
        paint();
      });
      paint();
    };
    bindSlider('#vol-master', 'master');
    bindSlider('#vol-music', 'music');
    bindSlider('#vol-fx', 'effects');
    bindSlider('#vol-reverb', 'reverb');

    const toggle = (sel: string, get: () => boolean, set: (v: boolean) => void) => {
      const btn = $(sel);
      btn.addEventListener('click', () => { set(!get()); btn.textContent = get() ? 'On' : 'Off'; });
    };
    toggle('#assist', () => audio.settings.assist, (v) => audio.setSettings({ assist: v }));
    toggle('#bed', () => audio.settings.bed, (v) => audio.setSettings({ bed: v }));
    const quality = (sel: string, key: 'bloom' | 'labels' | 'reducedMotion' | 'colorBlind') => {
      // Through setQuality, so the choice is remembered as a *preference* and
      // the adaptive-quality pass knows what to restore to.
      toggle(sel, () => stage.quality[key], (v) => stage.setQuality({ [key]: v }));
    };
    quality('#q-bloom', 'bloom');
    quality('#q-labels', 'labels');
    quality('#q-motion', 'reducedMotion');
    quality('#q-cb', 'colorBlind');
    $<HTMLSelectElement>('#bend-range').addEventListener('change', (e) =>
      audio.setSettings({ bendRange: Number((e.target as HTMLSelectElement).value) }));
    $<HTMLSelectElement>('#mod-target').addEventListener('change', (e) =>
      audio.setSettings({ modTarget: (e.target as HTMLSelectElement).value as ModTarget }));

    const offsetEl = $<HTMLInputElement>('#pt-offset');
    const offsetNow = $('#pt-offset-now');
    const paintOffset = () => {
      const v = Number(offsetEl.value);
      offsetEl.style.setProperty('--fill', `${((v + 120) / 240) * 100}%`);
      offsetNow.textContent = `${v > 0 ? '+' : ''}${v} ms`;
    };
    offsetEl.addEventListener('input', () => {
      setPlayTuneSettings({ offsetMs: Number(offsetEl.value) });
      paintOffset();
    });
    paintOffset();
    $<HTMLSelectElement>('#pt-lead').addEventListener('change', (e) =>
      setPlayTuneSettings({ leadBeats: Number((e.target as HTMLSelectElement).value) }));
    toggle('#pt-assist', () => playTuneSettings().assist, (v) => setPlayTuneSettings({ assist: v }));

    const unlockedEl = $('#pt-unlocked');
    const paintUnlocked = () => {
      const mode = this.shell.playtune;
      const n = mode ? mode.progress.unlocked.length : loadProgress(TUNE_ORDER).unlocked.length;
      unlockedEl.textContent = `${n} of ${TUNE_ORDER.length}`;
    };
    paintUnlocked();
    const resetBtn = $('#pt-reset');
    resetBtn.addEventListener('click', () => {
      // Two presses, because this is the one setting that destroys something.
      if (resetBtn.dataset.armed !== 'yes') {
        resetBtn.dataset.armed = 'yes';
        resetBtn.textContent = 'Really reset?';
        return;
      }
      const fresh = resetProgress(TUNE_ORDER);
      const mode = this.shell.playtune;
      if (mode) mode.progress = fresh;
      resetBtn.dataset.armed = '';
      resetBtn.textContent = 'Reset…';
      paintUnlocked();
    });

    $('#clear-mon').addEventListener('click', () => input.clearMonitor());
    $('#reset-settings').addEventListener('click', () => {
      if (!window.confirm('Reset all settings to their defaults? Your scores and unlocked tunes will be kept.')) return;
      this.shell.resetSettings();
      this.show('settings');
    });

    const mon = $('#mon');
    const hist = $('#hist');
    const diag = $('#diag');
    const rangeEl = $('#range');
    const scaleNow = $('#scale-now');
    const masterEl = $<HTMLInputElement>('#vol-master');
    this.live = () => {
      masterEl.value = String(audio.settings.master);
      // Under Random the picked scale is only knowable at run time, so say it.
      scaleNow.textContent = `Playing ${noteName(music.root)} ${music.label}`
        + (music.choice === RANDOM ? ' — a new one is drawn each game' : '');
      const lines = input.monitor.slice(-14).map((x) => `${x.label}`);
      mon.textContent = lines.length ? lines.join('\n') : 'waiting for messages…';
      const peak = input.histogram.peak;
      hist.innerHTML = input.histogram.bins
        .map((v) => `<span style="height:${Math.round((v / peak) * 100)}%"></span>`).join('');
      diag.textContent = audio.running
        ? `audio ${audio.latencyMs.toFixed(1)} ms · ${input.histogram.count} notes played`
        : 'sound is off — click anywhere to enable it';
      const map = input.mapping;
      rangeEl.textContent = `${noteLabel(map.low)}–${noteLabel(map.high)} · ${map.settings.count} keys`;
    };
    this.live();
  }
}
