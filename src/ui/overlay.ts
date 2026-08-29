import type { Game } from '../game/game';
import type { InputHub } from '../midi/inputHub';
import type { AudioDirector } from '../audio/director';
import type { Renderer } from '../render/renderer';
import { noteLabel, noteName } from '../midi/notes';
import { MODES } from '../audio/music';
import { load, save } from '../core/storage';
import type { CurveName } from '../midi/velocityCurve';

export type Screen = 'start' | 'settings' | 'gameover' | 'calibrate' | null;

interface Deps {
  game: Game;
  input: InputHub;
  audio: AudioDirector;
  renderer: Renderer;
  onStart: () => void;
}

/**
 * Menus, settings and the MIDI monitor.
 *
 * The monitor matters more than it looks: controllers differ in what their
 * octave, bend and sustain controls actually transmit, and this is where that
 * gets discovered rather than assumed.
 */
export class Overlay {
  screen: Screen = 'start';
  private root: HTMLElement;
  private d: Deps;
  private body!: HTMLElement;
  private live: (() => void) | null = null;

  constructor(root: HTMLElement, deps: Deps) {
    this.root = root;
    this.d = deps;
    root.innerHTML = '<div class="panel" id="panel"></div>';
    this.body = root.querySelector('#panel')!;
    this.show('start');

    // Any key or click on the start screen begins the game, which is also the
    // user gesture the audio context needs.
    root.addEventListener('click', (e) => {
      if (e.target === root && this.screen !== 'start') this.hide();
    });
  }

  get visible(): boolean { return this.screen !== null; }

  show(screen: Screen): void {
    this.screen = screen;
    this.live = null;
    if (!screen) { this.root.classList.remove('show'); return; }
    this.root.classList.add('show');
    if (screen === 'start') this.renderStart();
    else if (screen === 'settings') this.renderSettings();
    else if (screen === 'gameover') this.renderGameOver();
    else if (screen === 'calibrate') this.renderCalibrate();
  }

  hide(): void { this.show(null); }

  toggle(): void { this.show(this.screen ? null : 'settings'); }

  /** Refresh the live parts of the current screen. */
  update(): void { this.live?.(); }

  private deviceLine(): string {
    const midi = this.d.input.midi;
    const dev = midi.devices.find((x) => x.id === midi.selectedId);
    if (midi.status === 'ready' && dev) {
      return `<span class="pill" style="border-color:rgba(69,226,160,.5)">${dev.name}</span> connected`;
    }
    if (midi.status === 'unsupported') return 'This browser has no Web MIDI — Chrome or Edge do.';
    if (midi.status === 'denied') return 'MIDI access was declined.';
    return 'No MIDI device found.';
  }

  private renderStart(): void {
    const range = this.d.game.keybed.range;
    this.body.innerHTML = `
      <h1>PianoBall</h1>
      <p class="lede">Pinball with thirty-two flippers. Every key is a paddle; how hard you
      press decides how far the ball flies, and where on the key you hit it decides where it goes.</p>

      <h2>Controller</h2>
      <p>${this.deviceLine()}</p>
      <p class="diag">Mapped ${noteLabel(range.low)}&ndash;${noteLabel(range.high)} across the keybed.</p>

      <h2>Controls</h2>
      <p><kbd>Z</kbd>&ndash;<kbd>M</kbd> and <kbd>Q</kbd>&ndash;<kbd>P</kbd> play without a MIDI keyboard &middot;
      <kbd>Shift</kbd> hits harder, <kbd>Alt</kbd> softer</p>
      <p>Pitch bend (or <kbd>&larr;</kbd> <kbd>&rarr;</kbd>) tilts the table &middot;
      sustain (or <kbd>Space</kbd>) slows time</p>
      <p><kbd>Esc</kbd> settings &middot; <kbd>F3</kbd> performance</p>

      <div class="actions">
        <button class="primary" id="btn-play">Play</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;
    this.body.querySelector('#btn-play')!.addEventListener('click', () => {
      this.hide();
      this.d.onStart();
    });
    this.body.querySelector('#btn-settings')!.addEventListener('click', () => this.show('settings'));
  }

  private renderGameOver(): void {
    const s = this.d.game.scoring;
    const best = Math.max(s.score, load<number>('best', 0));
    save('best', best);
    this.body.innerHTML = `
      <h1>Game over</h1>
      <p class="lede">${s.score.toLocaleString()} points &middot; best combo ${s.comboBest}</p>
      <h2>Best</h2>
      <p>${best.toLocaleString()}</p>
      <div class="actions">
        <button class="primary" id="btn-again">Play again</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;
    this.body.querySelector('#btn-again')!.addEventListener('click', () => {
      this.hide();
      this.d.onStart();
    });
    this.body.querySelector('#btn-settings')!.addEventListener('click', () => this.show('settings'));
  }

  private renderCalibrate(): void {
    const m = this.d.input.mapping;
    m.beginCalibration();
    const draw = () => {
      const step = m.phase === 'low'
        ? 'Press the <strong>lowest</strong> key on your controller.'
        : m.phase === 'high'
          ? 'Now press the <strong>highest</strong> key.'
          : `Mapped ${noteLabel(m.low)}&ndash;${noteLabel(m.high)} &middot; ${m.settings.count} keys.`;
      this.body.innerHTML = `
        <h1>Calibrate</h1>
        <p class="lede">${step}</p>
        <p class="diag">Works with any controller from 25 to 88 keys.</p>
        <div class="actions">
          <button id="btn-done">${m.phase === 'done' ? 'Done' : 'Cancel'}</button>
        </div>
      `;
      this.body.querySelector('#btn-done')!.addEventListener('click', () => {
        m.cancelCalibration();
        this.show('settings');
      });
    };
    draw();
    this.live = () => { if (this.screen === 'calibrate') draw(); };
  }

  private renderSettings(): void {
    const { game, input, audio, renderer } = this.d;
    const midi = input.midi;
    const opts = midi.devices.map((dv) =>
      `<option value="${dv.id}" ${dv.id === midi.selectedId ? 'selected' : ''}>${dv.name}</option>`).join('');
    const curves: CurveName[] = ['soft', 'linear', 'hard', 'gamma', 'fixed'];
    const root = noteName(game.music.root);
    const modes = [`<option value="random" ${game.modeChoice === 'random' ? 'selected' : ''}>Random each game</option>`]
      .concat(MODES.map((m) =>
        `<option value="${m.id}" ${game.modeChoice === m.id ? 'selected' : ''}>${root} ${m.label}</option>`))
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
      <div class="row"><label>Master</label><input type="range" id="vol-master" min="0" max="1" step="0.01" value="${audio.engine.settings.master}"></div>
      <div class="row"><label>Music</label><input type="range" id="vol-music" min="0" max="1" step="0.01" value="${audio.engine.settings.music}"></div>
      <div class="row"><label>Impacts</label><input type="range" id="vol-fx" min="0" max="1" step="0.01" value="${audio.engine.settings.effects}"></div>
      <div class="row"><label>Scale</label>
        <select id="mode">${modes}</select></div>
      <p class="diag" id="mode-now"></p>
      <div class="row"><label>Snap off-scale notes into the table's key</label>
        <button id="assist">${audio.engine.settings.assist ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Backing bed</label>
        <button id="bed">${audio.engine.settings.bed ? 'On' : 'Off'}</button></div>

      <h2>Display</h2>
      <div class="row"><label>Bloom</label><button id="q-bloom">${renderer.quality.bloom ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Note labels</label><button id="q-labels">${renderer.quality.labels ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Reduced motion</label><button id="q-motion">${renderer.quality.reducedMotion ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Colour-blind palette</label><button id="q-cb">${renderer.quality.colorBlind ? 'On' : 'Off'}</button></div>

      <h2>MIDI monitor</h2>
      <p class="diag">Raw messages from your controller. Use this to see what the octave,
      pitch bend and sustain controls actually send.</p>
      <div class="monitor" id="mon">waiting&hellip;</div>
      <div class="actions">
        <button id="clear-mon">Clear</button>
        <span class="diag" id="diag"></span>
      </div>

      <div class="actions"><button class="primary" id="close">Back to the table</button></div>
    `;

    const $ = <T extends HTMLElement>(sel: string) => this.body.querySelector(sel) as T;

    $('#close').addEventListener('click', () => this.hide());
    $('#cal').addEventListener('click', () => this.show('calibrate'));
    $('#oct-down').addEventListener('click', () => { input.mapping.shiftOctave(-1); this.d.game.remapKeybed(); });
    $('#oct-up').addEventListener('click', () => { input.mapping.shiftOctave(1); this.d.game.remapKeybed(); });
    $<HTMLSelectElement>('#dev').addEventListener('change', (e) => midi.select((e.target as HTMLSelectElement).value));
    $<HTMLSelectElement>('#curve').addEventListener('change', (e) =>
      input.setVelocitySettings({ curve: (e.target as HTMLSelectElement).value as CurveName }));
    $<HTMLSelectElement>('#mode').addEventListener('change', (e) =>
      game.setModeChoice((e.target as HTMLSelectElement).value));

    const bindSlider = (sel: string, key: 'master' | 'music' | 'effects') => {
      const el = $<HTMLInputElement>(sel);
      // The track's fill is painted from this, so it needs setting on the way in
      // as well as on every move.
      const paint = () => el.style.setProperty('--fill', `${Number(el.value) * 100}%`);
      el.addEventListener('input', () => {
        audio.engine.setSettings({ [key]: Number(el.value) });
        paint();
      });
      paint();
    };
    bindSlider('#vol-master', 'master');
    bindSlider('#vol-music', 'music');
    bindSlider('#vol-fx', 'effects');

    const toggle = (sel: string, get: () => boolean, set: (v: boolean) => void) => {
      const btn = $(sel);
      btn.addEventListener('click', () => { set(!get()); btn.textContent = get() ? 'On' : 'Off'; });
    };
    toggle('#assist', () => audio.engine.settings.assist, (v) => audio.engine.setSettings({ assist: v }));
    toggle('#bed', () => audio.engine.settings.bed, (v) => audio.engine.setSettings({ bed: v }));
    toggle('#q-bloom', () => renderer.quality.bloom, (v) => { renderer.quality.bloom = v; });
    toggle('#q-labels', () => renderer.quality.labels, (v) => { renderer.quality.labels = v; renderer.invalidate(); });
    toggle('#q-motion', () => renderer.quality.reducedMotion, (v) => { renderer.quality.reducedMotion = v; });
    toggle('#q-cb', () => renderer.quality.colorBlind, (v) => { renderer.quality.colorBlind = v; renderer.invalidate(); });
    $('#clear-mon').addEventListener('click', () => input.clearMonitor());

    const mon = $('#mon');
    const hist = $('#hist');
    const diag = $('#diag');
    const rangeEl = $('#range');
    const modeNow = $('#mode-now');
    this.live = () => {
      // Under Random the picked scale is only knowable at run time, so say it.
      modeNow.textContent = `Playing ${noteName(game.music.root)} ${game.music.label}`
        + (game.modeChoice === 'random' ? ' — a new one is drawn each game' : '');
      const lines = input.monitor.slice(-14).map((m) => `${m.label}`);
      mon.textContent = lines.length ? lines.join('\n') : 'waiting for messages…';
      const peak = input.histogram.peak;
      hist.innerHTML = input.histogram.bins
        .map((v) => `<span style="height:${Math.round((v / peak) * 100)}%"></span>`).join('');
      diag.textContent = audio.ready
        ? `audio ${audio.engine.latencyMs.toFixed(1)} ms · ${input.histogram.count} notes played`
        : 'audio not started';
      const m = input.mapping;
      rangeEl.textContent = `${noteLabel(m.low)}–${noteLabel(m.high)} · ${m.settings.count} keys`;
    };
    this.live();
  }
}
