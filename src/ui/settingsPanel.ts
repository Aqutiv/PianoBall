import './settings.css';
import type { Shell } from '../app/shell';
import type { GameModeId } from '../app/mode';
import { NOTE_NAMES, noteLabel, noteName } from '../midi/notes';
import type { CurveName } from '../midi/velocityCurve';
import { MODES } from '../audio/music';
import { RANDOM, toKeyChoice } from '../audio/musicState';
import type { ModTarget } from '../audio/engine';
import { pinballSettings, setPinballSettings } from '../modes/pinball/settings';
import { LEAD_BEAT_CHOICES, playTuneSettings, setPlayTuneSettings } from '../modes/playtune/settings';
import { APPROACH_BPM_CAP } from '../modes/playtune/transport';
import { loadProgress, resetProgress } from '../modes/playtune/progress';
import { CHORDS_ROLE, MELODY_ROLE, type TuneRole } from '../modes/playtune/role';
import { THEMES } from '../render/theme';
import { themeSettings } from '../render/themeSettings';
import { TABLE_SIZE } from '../render/stage';
import type { GraphicsPreset, SoundPreset } from '../render/perfSettings';
import { SETTINGS_CATEGORIES, SettingsNavigation, type SettingsCategory } from './settingsNavigation';

type Choice = readonly [string | number, string];
type Follower = { element: HTMLElement; update: () => void };

/** Dynamic text includes MIDI device names, which must never become markup. */
const escape = (value: string | number) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[c]!);

/** DOM settings surface; all values still belong to their existing models. */
export class SettingsPanel {
  private readonly narrow = window.matchMedia('(max-width: 759px)');
  private bindings: (() => void)[] = [];
  private followers: Follower[] = [];
  private elapsed = 0;
  private mounted = false;
  private readonly resize = () => {
    this.remember();
    this.render();
  };

  constructor(
    private readonly body: HTMLElement,
    private readonly shell: Shell,
    private readonly navigation: SettingsNavigation,
    private readonly goBack: () => void,
    private readonly calibrate: () => void,
  ) {}

  mount(fresh: boolean, fromCalibration: boolean): void {
    if (fresh) this.navigation.enter(this.narrow.matches, this.shell.modeId ?? this.shell.lastMode);
    if (fromCalibration) this.navigation.returnFromCalibration();
    this.mounted = true;
    this.body.classList.add('settings-panel');
    this.narrow.addEventListener('change', this.resize);
    this.render();
  }

  openSound(): void {
    this.navigation.select('sound');
    this.navigation.expanded.add('sound-mix');
    this.navigation.focusId = 'bed';
    this.render();
  }

  dispose(): void {
    this.remember();
    this.narrow.removeEventListener('change', this.resize);
    this.followers = [];
    this.bindings = [];
    this.mounted = false;
    this.body.classList.remove('settings-panel');
  }

  back(): boolean {
    this.remember();
    if (!this.navigation.back(this.narrow.matches)) return false;
    this.render();
    return true;
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (dt > 0 && this.elapsed < 0.12) return;
    this.elapsed = 0;
    if (this.narrow.matches && this.navigation.index) return;
    for (const { element, update } of this.followers) {
      if (!element.closest('details:not([open])')) update();
    }
  }

  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.body.querySelector<T>(`#${id}`)!;
  }

  private remember(): void {
    if (!this.mounted) return;
    const content = this.body.querySelector<HTMLElement>('.settings-content');
    if (content && !content.hidden) this.navigation.scroll.set(this.navigation.pageKey, content.scrollTop);
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.body.contains(active)) this.navigation.focusId = active.id;
    // Read the DOM directly: a details toggle event can still be queued when a
    // controller connection or a theme change asks the overlay to refresh.
    this.body.querySelectorAll<HTMLDetailsElement>('details[id]').forEach((details) => {
      if (details.open) this.navigation.expanded.add(details.id);
      else this.navigation.expanded.delete(details.id);
    });
  }

  private refresh(): void {
    this.remember();
    this.render();
  }

  private render(): void {
    const state = this.navigation;
    const index = this.narrow.matches && state.index;
    const category = SETTINGS_CATEGORIES.find((c) => c.id === state.category)!;
    this.bindings = [];
    this.followers = [];
    const content = index ? '' : this.categoryContent(state.category);
    this.body.innerHTML = `
      <header class="settings-header">
        <div><h1>Settings</h1><p class="lede">Changes save automatically</p></div>
        <button id="settings-back" aria-label="${this.narrow.matches && !index ? 'Back to settings categories' : 'Back to previous screen'}">
          <span aria-hidden="true">&larr;</span> Back
        </button>
      </header>
      <div class="settings-layout${index ? ' settings-index' : ''}">
        <nav class="settings-nav" aria-label="Settings categories" ${this.narrow.matches && !index ? 'hidden' : ''}>
          ${SETTINGS_CATEGORIES.map((c) => `
            <button id="settings-nav-${c.id}" data-category="${c.id}" ${!index && c.id === state.category ? 'aria-current="page"' : ''}>
              <span>${c.label}</span><small>${c.description}</small><b aria-hidden="true">&rsaquo;</b>
            </button>`).join('')}
        </nav>
        <section class="settings-content" aria-labelledby="settings-heading" ${index ? 'hidden' : ''}>
          <h2 id="settings-heading" tabindex="-1">${category.label}</h2>
          <p class="settings-intro">${category.description}</p>
          ${content}
        </section>
      </div>`;
    this.element('settings-back').addEventListener('click', this.goBack);
    this.body.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
      button.addEventListener('click', () => {
        if (!index && state.category === button.dataset.category) return;
        this.remember();
        state.select(button.dataset.category as SettingsCategory);
        this.render();
      });
    });
    for (const bind of this.bindings) bind();
    this.body.querySelectorAll<HTMLDetailsElement>('details[id]').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (!details.isConnected) return;
        if (details.open) state.expanded.add(details.id);
        else state.expanded.delete(details.id);
        this.update(0);
      });
    });
    this.update(0);
    const focus = state.focusId ? this.body.querySelector<HTMLElement>(`#${state.focusId}`) : null;
    const visibleFocus = focus && !focus.closest('[hidden]')
      && (!focus.closest('details:not([open])') || focus.tagName === 'SUMMARY');
    (visibleFocus ? focus : this.element(index ? `settings-nav-${state.category}` : 'settings-heading'))
      .focus({ preventScroll: true });
    this.element('settings-heading').parentElement!.scrollTop = state.scroll.get(state.pageKey) ?? 0;
  }

  private on(id: string, event: string, action: () => void): void {
    this.bindings.push(() => this.element(id).addEventListener(event, action));
  }

  private follow(id: string, update: () => void): void {
    this.bindings.push(() => {
      this.followers.push({ element: this.element(id), update });
      update();
    });
  }

  private row(id: string, label: string, control: string, help = ''): string {
    return `<div class="setting-row">
      <div class="setting-copy"><label id="${id}-label" for="${id}">${label}</label>
      ${help ? `<p id="${id}-help">${help}</p>` : ''}</div>
      <div class="setting-control">${control}</div>
    </div>`;
  }

  private attrs(id: string, help: string): string {
    return `id="${id}" aria-labelledby="${id}-label"${help ? ` aria-describedby="${id}-help"` : ''}`;
  }

  private slider(
    id: string, label: string, get: () => number, set: (value: number) => void,
    help = '', min = 0, max = 1, step = 0.01,
    format: (value: number) => string = (v) => `${Math.round(v * 100)}%`,
  ): string {
    const paint = () => {
      const el = this.element<HTMLInputElement>(id);
      const text = format(Number(el.value));
      el.style.setProperty('--fill', `${(Number(el.value) - min) / (max - min) * 100}%`);
      el.setAttribute('aria-valuetext', text);
      this.element(`${id}-value`).textContent = text;
    };
    this.on(id, 'input', () => { set(Number(this.element<HTMLInputElement>(id).value)); paint(); });
    this.follow(id, () => {
      const el = this.element<HTMLInputElement>(id);
      const value = Math.round((get() - min) / step) * step + min;
      if (Math.abs(Number(el.value) - value) > step / 10) el.value = String(value);
      paint();
    });
    return this.row(id, label, `<div class="setting-slider">
      <input type="range" ${this.attrs(id, help)} min="${min}" max="${max}" step="${step}" value="${get()}">
      <output id="${id}-value" for="${id}" aria-live="off">${format(get())}</output></div>`, help);
  }

  private select(id: string, label: string, choices: readonly Choice[], get: () => string | number,
    set: (value: string) => void, help = '', disabled = false): string {
    this.on(id, 'change', () => set(this.element<HTMLSelectElement>(id).value));
    this.follow(id, () => {
      const el = this.element<HTMLSelectElement>(id);
      if (el.value !== String(get())) el.value = String(get());
    });
    return this.row(id, label, `<select ${this.attrs(id, help)} ${disabled ? 'disabled' : ''}>
      ${choices.map(([value, text]) => `<option value="${escape(value)}" ${String(value) === String(get()) ? 'selected' : ''}>${escape(text)}</option>`).join('')}
    </select>`, help);
  }

  private toggle(id: string, label: string, get: () => boolean, set: (value: boolean) => void, help = ''): string {
    const paint = () => {
      const button = this.element(id);
      button.setAttribute('aria-checked', String(get()));
      button.textContent = get() ? 'On' : 'Off';
    };
    this.on(id, 'click', () => { set(!get()); paint(); });
    this.follow(id, paint);
    return this.row(id, label, `<button class="setting-switch" role="switch" aria-checked="${get()}" ${this.attrs(id, help)}>${get() ? 'On' : 'Off'}</button>`, help);
  }

  private details(id: string, label: string, content: string, hint: string): string {
    return `<details class="settings-details" id="${id}" ${this.navigation.expanded.has(id) ? 'open' : ''}>
      <summary id="${id}-summary"><span>${label}<small>${hint}</small></span></summary>
      <div class="settings-detail-body">${content}</div></details>`;
  }

  private categoryContent(category: SettingsCategory): string {
    switch (category) {
      case 'sound': return this.sound();
      case 'controls': return this.controls();
      case 'appearance': return this.appearance();
      case 'accessibility': return this.accessibility();
      case 'modes': return this.modes();
      case 'data': return this.data();
    }
  }

  private sound(): string {
    const { audio, music } = this.shell;
    const volume = (id: string, label: string, key: 'master' | 'music' | 'effects' | 'reverb' | 'leadLevel' | 'bedLevel', help = '') =>
      this.slider(id, label, () => audio.settings[key], (v) => audio.setSettings({ [key]: v }), help);
    this.follow('scale-now', () => {
      const random = music.choice === RANDOM || music.keyChoice === RANDOM;
      this.element('scale-now').textContent = `Current key: ${noteName(music.root)} ${music.label}${random ? ' · chosen again each game' : ''}`;
    });
    return volume('vol-master', 'Overall volume', 'master', 'Adjust every sound together.')
      + volume('vol-music', 'Music volume', 'music', 'Your instrument and the backing together.')
      + volume('vol-fx', 'Impact sounds', 'effects', 'Ball collisions and game effects.')
      + volume('vol-reverb', 'Reverb', 'reverb', 'Add the echo and space of a room.')
      + this.details('sound-mix', 'Instrument & backing',
        volume('vol-lead', 'Instrument volume', 'leadLevel')
        + volume('vol-bed', 'Backing volume', 'bedLevel')
        + this.toggle('bed', 'Allow backing chords', () => audio.settings.bed, (v) => audio.setSettings({ bed: v }),
          'Allow backing chords across modes. In Freestyle, also turn on Backing during play.'),
        'Balance what you play with what plays along')
      + this.details('sound-key', 'Pinball key & scale',
        '<p class="settings-note">Applies to Pinball. Freestyle has its own key and scale under Auto Backing. PlayTune follows the song’s key.</p>'
        + this.select('key', 'Musical key', [[RANDOM, 'Random each game'], ...NOTE_NAMES.map((n, i): Choice => [i, n])],
          () => music.keyChoice, (v) => music.setKey(toKeyChoice(v)))
        + this.select('scale', 'Scale', [[RANDOM, 'Random each game'], ...MODES.map((m): Choice => [m.id, m.label])],
          () => music.choice, (v) => music.setChoice(v))
        + '<p class="settings-note" id="scale-now"></p>', 'Choose a musical key or let each game choose')
      + this.details('sound-quality', 'Sound quality',
        this.select('q-sound', 'Sound quality', [['auto', 'Auto'], ['full', 'Full'], ['lite', 'Lite']],
          () => this.shell.soundPreset, (v) => this.shell.setSoundPreset(v as SoundPreset),
          'Auto reduces sound detail only when graphics have already been reduced.')
        + '<p class="settings-note">Lite uses shorter reverb, fewer layered voices and fewer simultaneous sounds. Full keeps every detail.</p>',
        'Advanced options for slower devices');
  }

  private controls(): string {
    const { input, audio } = this.shell;
    const midi = input.midi;
    const status = midi.status === 'unsupported' ? 'This browser has no MIDI support. You can still use the computer keyboard or touch.'
      : midi.status === 'denied' ? 'MIDI access was declined. Allow it in your browser to connect a keyboard.'
      : midi.devices.length ? 'Choose the keyboard you want to play.' : 'No MIDI keyboard found. You can still use the computer keyboard or touch.';
    this.on('oct-down', 'click', () => { input.mapping.shiftOctave(-1); this.shell.remapKeys(); this.update(0); });
    this.on('oct-up', 'click', () => { input.mapping.shiftOctave(1); this.shell.remapKeys(); this.update(0); });
    this.on('cal', 'click', this.calibrate);
    this.on('clear-mon', 'click', () => { input.clearMonitor(); this.update(0); });
    this.follow('range', () => {
      const map = input.mapping;
      this.element('range').textContent = `${noteLabel(map.low)}–${noteLabel(map.high)} · ${map.settings.count} keys`;
    });
    let lastNotes = -1;
    this.follow('mon', () => {
      const text = input.monitor.slice(-14).map((x) => x.label).join('\n') || 'Waiting for messages…';
      if (this.element('mon').textContent !== text) this.element('mon').textContent = text;
      if (lastNotes !== input.histogram.count) {
        lastNotes = input.histogram.count;
        const peak = input.histogram.peak;
        this.element('hist').innerHTML = input.histogram.bins.map((v) => `<span style="height:${Math.round(v / peak * 100)}%"></span>`).join('');
      }
      this.element('diag').textContent = audio.running
        ? `Audio latency: ${audio.latencyMs.toFixed(1)} ms · ${input.histogram.count} notes played`
        : 'Sound is off. Click or tap to enable it.';
    });
    return this.select('dev', 'MIDI keyboard', midi.devices.length ? midi.devices.map((d): Choice => [d.id, d.name]) : [['', 'None found']],
      () => midi.devices.length ? midi.selectedId ?? '' : '', (v) => midi.select(v), status, !midi.devices.length)
      + `<div class="setting-section"><h3>Your key range</h3><p id="range" class="settings-note"></p>
        <div class="settings-inline-actions"><button id="oct-down">Octave down</button><button id="oct-up">Octave up</button>
        <button id="cal">Calibrate keyboard…</button></div><p class="settings-note">Calibrate by playing your lowest and highest keys.</p></div>`
      + this.select('curve', 'Touch response', [['soft', 'Soft touch'], ['linear', 'Linear'], ['hard', 'Firm touch'], ['gamma', 'Gamma curve'], ['fixed', 'Fixed volume']],
        () => input.velocity.curve, (v) => input.setVelocitySettings({ curve: v as CurveName }),
        'How key pressure changes the sound. Soft touch boosts gentle playing; fixed volume ignores pressure.')
      + this.details('controls-test', 'Test your keyboard',
        '<p class="settings-note">How hard you play:</p><div class="hist" id="hist" role="img" aria-label="Distribution of key pressure"></div>'
        + '<p class="settings-note">Raw MIDI messages help you check octave buttons, pitch bend and sustain.</p>'
        + '<pre class="monitor" id="mon" tabindex="0" aria-label="MIDI messages"></pre>'
        + '<div class="settings-inline-actions"><button id="clear-mon">Clear messages</button></div><p class="settings-note" id="diag"></p>',
        'Live key pressure and MIDI messages');
  }

  private qualityToggle(id: string, label: string, key: 'bloom' | 'pools' | 'labels' | 'reducedMotion' | 'colorBlind', help = ''): string {
    const stage = this.shell.stage;
    return this.toggle(id, label, () => stage.preferredQuality[key], (v) => stage.setQuality({ [key]: v }), help);
  }

  private appearance(): string {
    const { stage } = this.shell;
    const cards = THEMES.map((theme) => {
      const id = `settings-theme-${theme.id}`;
      this.on(id, 'click', () => {
        if (theme.id === themeSettings().id) return;
        this.shell.setTheme(theme);
        this.refresh();
      });
      return `<button id="${id}" class="theme-card${theme.id === themeSettings().id ? ' on' : ''}" aria-pressed="${theme.id === themeSettings().id}">
        <span class="theme-swatch" aria-hidden="true">${[theme.palette.void, theme.palette.neon, theme.palette.neon2, theme.palette.accent, theme.palette.ink]
          .map((colour) => `<i style="background:${colour}"></i>`).join('')}</span>
        <span class="theme-name">${escape(theme.name)}</span><span class="theme-blurb">${escape(theme.blurb)}</span></button>`;
    }).join('');
    this.follow('q-now', () => {
      const summary = this.shell.qualitySummary;
      this.element('q-now').textContent = summary === 'full' ? 'Current performance: no effects reduced.' : `Currently reduced: ${summary}.`;
    });
    return `<div class="setting-section"><h3>Theme</h3><div class="theme-grid" aria-label="Theme">${cards}</div></div>`
      + this.slider('q-size', 'Table size', () => stage.preferredQuality.tableSize, (v) => stage.setQuality({ tableSize: v }),
        'Make the playfield larger while keeping the keyboard in view.', TABLE_SIZE.min, TABLE_SIZE.max, TABLE_SIZE.step)
      + this.select('q-preset', 'Graphics quality', [['auto', 'Auto'], ['high', 'High'], ['balanced', 'Balanced'], ['low', 'Low']],
        () => this.shell.graphicsPreset, (v) => this.shell.setGraphicsPreset(v as GraphicsPreset),
        'Auto adjusts effects to keep play smooth. Other presets stay at a fixed quality.')
      + this.details('appearance-effects', 'Visual effects',
        this.qualityToggle('q-bloom', 'Bloom', 'bloom', 'A soft glow around bright notes and objects.')
        + this.qualityToggle('q-pools', 'Playfield lighting', 'pools', 'Pools of light across the table.')
        + '<p class="settings-note">These switches remember your preferences. Auto may temporarily reduce an enabled effect, then restore it when performance improves.</p><p class="settings-note" id="q-now"></p>',
        'Choose which effects you want to see');
  }

  private accessibility(): string {
    return this.qualityToggle('q-motion', 'Reduced motion', 'reducedMotion', 'Reduce decorative movement and screen effects.')
      + this.qualityToggle('q-cb', 'Colour-blind palette', 'colorBlind', 'Use an alternative palette to distinguish notes more easily.')
      + this.qualityToggle('q-labels', 'Keyboard & table note labels', 'labels',
        'Show octave markers on the keyboard and note names on bumpers, targets and falling balls.')
      + '<p class="settings-note">For names on PlayTune’s falling notes, use Game modes → PlayTune.</p>';
  }

  private modes(): string {
    const { audio } = this.shell;
    const state = this.navigation;
    // Mode selection only changes this page. It never starts or switches a game.
    const selector = this.select('settings-mode', 'Game mode', [['pinball', 'Pinball'], ['freestyle', 'Freestyle'], ['playtune', 'PlayTune']],
      () => state.mode ?? 'pinball', (v) => {
        this.remember();
        state.mode = v as GameModeId;
        state.focusId = 'settings-mode';
        this.render();
      });
    if (state.mode === 'pinball') return selector
      + this.toggle('assist', 'Keep notes in key', () => audio.settings.assist, (v) => audio.setSettings({ assist: v }),
        'Correct off-scale notes in Pinball. Freestyle always plays exactly what you press.')
      + this.toggle('pb-drums', 'Rally drums', () => pinballSettings().drums, (v) => {
        setPinballSettings({ drums: v }); this.shell.applyModeSettings();
      }, 'Let drums join as a rally builds. The backing chords build either way.');
    if (state.mode === 'freestyle') return selector
      + this.select('bend-range', 'Pitch-bend range', [[2, '±2 semitones'], [7, '±7 semitones (fifth)'], [12, '±12 semitones (octave)']],
        () => audio.settings.bendRange, (v) => audio.setSettings({ bendRange: Number(v) }))
      + this.select('mod-target', 'Modulation wheel', [['vibrato', 'Vibrato'], ['colour', 'Tone colour'], ['both', 'Both']],
        () => audio.settings.modTarget, (v) => audio.setSettings({ modTarget: v as ModTarget }),
        'Vibrato varies the pitch; tone colour changes the brightness.')
      + '<p class="settings-note">Without a controller, ← → bend the pitch and ↑ ↓ adjust modulation.</p>'
      + '<p class="settings-note">Choose instruments, rhythm and Backing (Auto or Manual chord keys) on the Freestyle screen during play.</p>';
    const tune = () => playTuneSettings();
    return selector
      + this.select('pt-lead', 'Note preview time', LEAD_BEAT_CHOICES.map((b): Choice => [b, `${b} beats`]),
        () => tune().leadBeats, (v) => setPlayTuneSettings({ leadBeats: Number(v) }),
        `More beats gives you more warning. Above ${APPROACH_BPM_CAP} bpm, the preview stops getting shorter.`)
      + this.toggle('pt-assist', 'Highlight destination keys', () => tune().assist, (v) => setPlayTuneSettings({ assist: v }),
        'Light the key each falling note is heading for.')
      + this.toggle('pt-names', 'Falling-note names', () => tune().noteNames, (v) => setPlayTuneSettings({ noteNames: v }),
        'Write note names on falling notes, using the song’s key.')
      + this.details('modes-timing', 'Timing adjustment',
        this.slider('pt-offset', 'Audio offset', () => tune().offsetMs, (v) => setPlayTuneSettings({ offsetMs: v }),
          'Raise this if your hits are judged early (you land late). Lower it if you land early.', -120, 120, 5,
          (v) => `${v > 0 ? '+' : ''}${v} ms`)
        + `<p class="settings-note">Your device already reports ${audio.latencyMs.toFixed(0)} ms of latency. This adjustment is added to it.</p>`,
        'Correct a mismatch between what you hear and when you play');
  }

  private data(): string {
    this.on('reset-settings', 'click', () => {
      if (!window.confirm('Restore all settings to their defaults? Your scores and unlocked tunes will be kept.')) return;
      this.shell.resetSettings();
      this.refresh();
    });
    const progress = (role: TuneRole, id: string, label: string) => {
      this.follow(`${id}-count`, () => {
        const mode = this.shell.playtune;
        const live = mode?.role.id === role.id ? mode.progress : null;
        const count = (live ?? loadProgress(role.storageKey, role.order)).unlocked.length;
        this.element(`${id}-count`).textContent = `${count} of ${role.order.length} unlocked`;
      });
      this.on(id, 'click', () => {
        const button = this.element(id);
        if (button.dataset.armed !== 'yes') {
          button.dataset.armed = 'yes';
          button.textContent = `Confirm reset ${label.toLowerCase()}`;
          this.element(`${id}-status`).textContent = 'Press again to erase this progress, or choose Cancel.';
          this.element(`${id}-cancel`).hidden = false;
          return;
        }
        const fresh = resetProgress(role.storageKey, role.order);
        const mode = this.shell.playtune;
        if (mode?.role.id === role.id) mode.progress = fresh;
        this.refresh();
        this.element(`${id}-status`).textContent = `${label} progress reset.`;
      });
      this.on(`${id}-cancel`, 'click', () => { this.remember(); this.navigation.focusId = id; this.render(); });
      return `<div class="setting-section settings-reset"><h3>${label} progress</h3>
        <p class="settings-note" id="${id}-count"></p><p class="settings-note">Erase ${label.toLowerCase()} unlocks and records. The other track and your settings are kept.</p>
        <div class="settings-inline-actions"><button class="settings-danger" id="${id}">Reset ${label.toLowerCase()} progress…</button>
        <button id="${id}-cancel" hidden>Cancel</button></div><p class="settings-note" id="${id}-status" role="status"></p></div>`;
    };
    return `<div class="setting-section"><h3>Restore default settings</h3>
      <p class="settings-note">Restore sound, controls, appearance and every mode’s settings. Keep all scores and unlocked tunes.</p>
      <div class="settings-inline-actions"><button id="reset-settings">Restore settings…</button></div></div>`
      + progress(MELODY_ROLE, 'pt-reset', 'Melody') + progress(CHORDS_ROLE, 'pc-reset', 'Chord');
  }
}
