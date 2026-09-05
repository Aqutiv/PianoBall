import { noteLabel, noteName, NOTE_NAMES } from '../midi/notes';
import { MODES } from '../audio/music';
import { RANDOM, toKeyChoice } from '../audio/musicState';
import type { CurveName } from '../midi/velocityCurve';
import type { Shell } from '../app/shell';
import type { GameModeId } from '../app/mode';
import { pinballSettings, setPinballSettings } from '../modes/pinball/settings';
import { scoreboard, type Frames } from './board';
import { REVEAL_SECONDS, type ModeResult } from './scoreboard';
import type { ModTarget } from '../audio/engine';
import { LEAD_BEAT_CHOICES, playTuneSettings, setPlayTuneSettings } from '../modes/playtune/settings';
import { APPROACH_BPM_CAP } from '../modes/playtune/transport';
import { loadProgress, passesNeeded, resetProgress } from '../modes/playtune/progress';
import { CHORDS_ROLE, MELODY_ROLE, type RoleId, type TuneRole } from '../modes/playtune/role';
import type { PlayTuneMode } from '../modes/playtune/playtune';
import type { Tune } from '../modes/playtune/chart';
import { findBedVoice, findLeadVoice } from '../audio/voices';
import { THEMES } from '../render/theme';
import { TABLE_SIZE } from '../render/stage';
import { themeSettings } from '../render/themeSettings';
import type { GraphicsPreset, SoundPreset } from '../render/perfSettings';
import { buildLine } from '../app/build';
import { updates } from '../app/updates';

export type Screen =
  | 'home'
  | 'settings'
  | 'calibrate'
  | 'about'
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
/** The graphics presets, in the order they are offered. */
const GRAPHICS_PRESETS: readonly (readonly [string, string])[] = [
  ['auto', 'Auto'],
  ['high', 'High'],
  ['balanced', 'Balanced'],
  ['low', 'Low'],
];

const SOUND_PRESETS: readonly (readonly [string, string])[] = [
  ['auto', 'Auto'],
  ['full', 'Full'],
  ['lite', 'Lite'],
];

export class Overlay {
  screen: Screen = 'home';
  private body!: HTMLElement;
  private live: ((dt: number) => void) | null = null;
  /** Drops whatever input subscription the current screen took out. */
  private offInput: (() => void) | null = null;
  /** Index of the highlighted mode card on the home screen. */
  private cursor = 0;
  /**
   * Where Back should go from settings, calibration or About.
   *
   * Settings can be opened from the menu, from a pause, or from the song list,
   * and it has to return to whichever it was — inferring it from "is a mode
   * loaded" was wrong, because one is always loaded to sit behind the menu.
   */
  private returnTo: Screen = 'home';
  /** The scoreboard on screen, while one is. Only the debug scrub reads it. */
  private board: Frames | null = null;

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

    // An update can arrive at any moment, and the two screens that say so are
    // both static once drawn. Redrawing whichever is up is enough: it costs
    // nothing per frame, and re-showing About over About keeps `returnTo`.
    updates.onChange(() => {
      if (this.screen === 'home' || this.screen === 'about') this.show(this.screen);
    });
  }

  get visible(): boolean { return this.screen !== null; }

  show(screen: Screen): void {
    // The sub screens are the ones that came from somewhere and owe it a way
    // back. Note what that rules out: a sub screen may not offer a button to
    // another sub screen, because `wasSub` would then keep the older return
    // address and Back would skip a step. Settings and Calibrate already work
    // around it by hardcoding where Cancel goes; About sidesteps it by being
    // reachable only from home, and offering only Back.
    const sub = screen === 'settings' || screen === 'calibrate' || screen === 'about';
    const wasSub = this.screen === 'settings' || this.screen === 'calibrate'
      || this.screen === 'about';
    if (sub && !wasSub) this.returnTo = this.screen ?? (this.shell.playing ? 'paused' : 'home');
    this.screen = screen;
    // Controls behind a menu must not remain in the keyboard/VoiceOver order.
    this.shell.hud.root.inert = screen !== null;
    this.live = null;
    this.board = null;
    this.offInput?.();
    this.offInput = null;
    if (!screen) {
      this.root.classList.remove('show');
      // The single place the board comes back out from behind a panel, so
      // every way of closing one resumes the mode rather than only the two
      // that remembered to.
      this.shell.unsuspend();
      return;
    }
    this.root.classList.add('show');
    this.body.scrollTop = 0;
    if (screen === 'home') this.renderHome();
    else if (screen === 'settings') this.renderSettings();
    else if (screen === 'calibrate') this.renderCalibrate();
    else if (screen === 'about') this.renderAbout();
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
  update(dt: number): void { this.live?.(dt); }

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
      // Enter and Space are how a focused button is pressed, so while one has
      // the keyboard they belong to it rather than to the mode cards. Without
      // this, tabbing to Settings or About and pressing Enter started the
      // highlighted mode first and opened the panel over the run — and Back
      // from there led to a pause screen for a game nobody asked to play. A
      // focused mode card is the same bug quietly: it would start whichever
      // mode the cursor was on rather than the one under the finger.
      //
      // Only these two keys. The arrows and digits below are not how a button
      // is activated, so they stay shortcuts wherever the focus happens to be.
      if (this.hasControlFocus()) return;
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

  /**
   * True while a control in the panel has the keyboard.
   *
   * The same claim `Shell.hudHasFocus` makes for the HUD, on the other piece
   * of chrome that can hold focus.
   */
  private hasControlFocus(): boolean {
    const el = document.activeElement;
    return el !== null && el !== document.body && this.body.contains(el);
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
        <button id="btn-about">About${updates.state === 'ready'
          ? '<span class="dot" title="An update is ready"></span>' : ''}</button>
        <span class="diag"><kbd>&larr;</kbd> <kbd>&rarr;</kbd> to choose &middot; <kbd>Enter</kbd> to play</span>
      </div>
    `;

    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('.mode-card'))) {
      el.addEventListener('click', () => this.shell.play(el.dataset.mode as GameModeId));
    }
    this.body.querySelector('#btn-settings')!.addEventListener('click', () => this.show('settings'));
    this.body.querySelector('#btn-about')!.addEventListener('click', () => this.show('about'));
  }

  // --------------------------------------------------------------- about ---

  /**
   * What this is, and which copy of it you are running.
   *
   * The build rows are not vanity. This installs as a PWA, so what you are
   * running is whatever the service worker last cached — and a worker still
   * handing out an old bundle looks exactly like a bug that was never fixed.
   * These are the lines to quote when something looks wrong, and the button
   * beneath them is how you get out of it without clearing site data.
   *
   * Nothing here is live. Every value is read once as the panel is built, the
   * way home and pause are; when an update lands, `updates.onChange` in the
   * constructor redraws the whole screen rather than this keeping a ticker.
   */
  private renderAbout(): void {
    const repo = 'https://github.com/Aqutiv/PianoBall';

    // Four states, four different things worth saying. `unsupported` is the
    // honest answer under `npm run dev`, where no service worker is built at
    // all, and on any browser that has none — better than a button that would
    // quietly do nothing.
    const update = {
      unsupported: '<span class="diag">Not available here</span>',
      idle: '<span class="diag">You\'re on the latest build</span> <button id="btn-check">Check</button>',
      checking: '<span class="diag">Checking&hellip;</span>',
      ready: '<span class="diag">An update is ready</span> <button class="primary" id="btn-update">Update now</button>',
    }[updates.state];

    this.body.innerHTML = `
      <h1>PianoBall</h1>
      <p class="lede">Your MIDI keyboard, three ways.</p>

      <p>PianoBall started from a small complaint: a piano keyboard is one of the
        most expressive input devices ever mass-produced, and almost nothing
        outside of music software does anything with it. If every key can tell how
        hard you hit it and where, what else could a key be?</p>
      <p>A flipper, it turns out. The answer needed a pinball table with
        thirty-two of them, a synthesiser with no recordings in it, and a collision
        solver that cannot tunnel by construction rather than by tuning. The first
        commit was on 29 August 2026.</p>
      <p><strong>Nothing is sampled.</strong> The rooms are impulse responses
        written from a handful of numbers at start-up, a plucked string is a
        Karplus&ndash;Strong loop rendered the first time you ask for that note,
        and a piano is three strings a few cents apart over a rendered soundboard.
        It is more work than a folder of samples, and it is why no two notes come
        out quite the same.</p>
      <p><strong>One shell, three modes</strong> &mdash; the same canvas, the same
        audio graph, the same thirty-two keys along the near edge of the same raked
        table. What changes is what the keys are for.</p>

      <h2>This build</h2>
      <div class="row"><label>Build</label><span class="diag">${buildLine()}</span></div>
      <div class="row"><label>Updates</label><span>${update}</span></div>
      <div class="row"><label>Source</label>
        <span><a href="${repo}" target="_blank" rel="noopener noreferrer">GitHub</a></span></div>
      <p class="diag">A new build installs itself quietly and waits &mdash; nothing
        is ever taken while you are playing. Closing the app takes it too.</p>

      <h2>Credits</h2>
      <p class="lede">Typefaces: Archivo, Cormorant Garamond, Jost and Fredoka,
        used under the SIL Open Font License 1.1. The classic melodies are public
        domain; the originals are the author's.</p>
      <p class="lede">Settings, scores and unlocked tunes are kept in this browser
        and are never sent anywhere.</p>
      <p class="colophon">&copy; 2026 Idan Robbins</p>

      <div class="actions">
        <button class="primary" id="btn-back">Back</button>
      </div>
    `;

    const on = (sel: string, fn: () => void) =>
      this.body.querySelector(sel)?.addEventListener('click', fn);
    on('#btn-back', () => this.back());
    on('#btn-check', () => void updates.check());
    on('#btn-update', () => void updates.applyNow());
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
    // Through the shell rather than straight to the screen: this leaves the
    // pause panel, and the bed the panel silenced has to come back with it.
    on('#btn-home', () => this.shell.goHome());
    on('#btn-settings', () => this.show('settings'));
  }

  // ------------------------------------------------------------ game over ---

  /**
   * The scoreboard, and whatever the screen offers to do next.
   *
   * Both end screens are this. What differed between them was never the way a
   * run should be shown — it was three buttons and a title, and keeping two
   * copies of the presentation for that is how one of them ends up with a row
   * the other never got.
   *
   * The board's markup is written here, once, and the closure handed to `live`
   * only ever sets attributes on what is already there. Rebuilding it per frame
   * is the bug recorded further down this file: it swaps the button out between
   * mousedown and mouseup, and a real click can never land.
   */
  private renderBoard(fallback: string, actions: string): void {
    const result: ModeResult | null = this.shell.lastResult;
    const board = result ? scoreboard(result) : null;
    this.body.innerHTML = `
      <h1>${result?.title ?? fallback}</h1>
      ${result?.subtitle ? `<p class="lede">${result.subtitle}</p>` : ''}
      ${board ? board.html : ''}
      <div class="actions">${actions}</div>
    `;
    if (!board) return;
    const frames = board.bind(this.body);
    this.board = frames;
    // The stored preference rather than the media query: the toggle under
    // Display exists so a player can disagree with what their system says, and
    // `defaultQuality` has already seeded it from the system for everyone who
    // has not. Reduced motion is the reveal at its end — everything present,
    // nothing having moved to get there.
    if (this.shell.stage.quality.reducedMotion) frames.seek(REVEAL_SECONDS);
    else frames.tick(0);
    this.live = (dt) => frames.tick(dt);
  }

  /**
   * Put the scoreboard's reveal at `seconds`, for a screenshot of a moment.
   *
   * Reached through the debug API rather than by anything the game does: an
   * animation checked with a stopwatch is an animation that gets checked once.
   */
  scrub(seconds: number): void { this.board?.seek(seconds); }

  private renderGameOver(): void {
    this.renderBoard('Game over', `
      <button class="primary" id="btn-again">Play again</button>
      <button id="btn-home">Change mode</button>
      <button id="btn-settings">Settings</button>
    `);
    const on = (sel: string, fn: () => void) =>
      this.body.querySelector(sel)!.addEventListener('click', fn);
    on('#btn-again', () => { this.hide(); this.shell.restartMode(); });
    on('#btn-home', () => this.show('home'));
    on('#btn-settings', () => this.show('settings'));
  }

  // ------------------------------------------------------------ playtune ---

  /**
   * The instruments a tune brings with it, as one line.
   *
   * Resolved rather than read, so a tune that names no instrument still says
   * what it will sound like rather than going quiet where every other card
   * answers. Collapsed to a single name when keys and bed are the same thing: a
   * solo piano work *is* a felt piano, and saying it twice reads as a fault
   * rather than as an arrangement.
   */
  private voiceLine(tune: Tune, mode: PlayTuneMode): string {
    // Through the role, because the chord role puts the player on the
    // accompaniment's timbre and the game's tune on the other one — so the two
    // halves of this line change places between the tabs.
    const v = mode.role.voices(tune);
    const keys = v.keyVoicing === 'bed' ? findBedVoice(v.keys).name : findLeadVoice(v.keys).name;
    const backing = findBedVoice(v.backing).name;
    return keys === backing ? keys : `${keys} over ${backing}`;
  }

  private renderSongs(): void {
    const mode = this.shell.playtune;
    if (!mode) { this.show('home'); return; }
    const progress = mode.progress;
    const role = mode.role;

    const cards = mode.tunes.map((tune) => {
      const unlocked = progress.unlocked.includes(tune.id);
      const best = progress.best[tune.id];
      const fits = mode.fitFor(tune) !== null;
      // The card describes the part being played, not the piece: Canon in D is
      // five pips of melody and three of chords, and says so.
      const card = role.card(tune);
      const pips = Array.from({ length: 5 }, (_, d) =>
        `<i class="${d < card.difficulty ? 'on' : ''}"></i>`).join('');

      // No single tune gates any other now — the curve opens several at a time
      // and each first pass opens one more — so the card counts the passes
      // between here and there rather than naming a predecessor it has not got.
      const need = passesNeeded(progress, role.order, tune.id);
      const state = !unlocked
        ? `<span class="song-locked">Pass ${need} more tune${need === 1 ? '' : 's'} to unlock</span>`
        : !fits
          ? '<span class="song-locked">Needs more keys than your controller has</span>'
          : best
            // A pass with no letter is the ordinary case now that every pass
            // mark sits at or below C, and a dash there reads as "nothing
            // recorded" on a tune the player has actually cleared.
            ? `<span class="song-best">${best.grade ?? (best.passed ? 'passed' : '—')} · ${Math.round(best.accuracy * 100)}%</span>`
            : '<span class="song-best song-new">new</span>';

      return `
        <button class="song-card${unlocked && fits ? '' : ' locked'}" data-tune="${tune.id}"
          ${unlocked && fits ? '' : 'disabled'}>
          <span class="song-name">${tune.title}</span>
          <span class="pips">${pips}</span>
          <span class="song-by">${tune.composer} <i>${this.voiceLine(tune, mode)}</i></span>
          <span class="song-teaches">${card.teaches}</span>
          ${state}
        </button>`;
    }).join('');

    // The record's own flag, not a letter: the pass marks all sit at or below
    // C, so counting graded tunes under-reports what has actually been passed.
    const done = mode.tunes.filter((t) => progress.best[t.id]?.passed).length;
    const tab = (id: RoleId, label: string) =>
      `<button class="role${role.id === id ? ' on' : ''}" data-role="${id}">${label}</button>`;
    this.body.innerHTML = `
      <h1>${role.title}</h1>
      <div class="role-switch">${tab('melody', 'Melody')}${tab('chords', 'Chords')}</div>
      <p class="lede">${role.lede}</p>
      <p class="diag">${progress.unlocked.length} of ${mode.tunes.length} unlocked &middot; ${done} passed</p>
      <div class="song-list">${cards}</div>
      <div class="actions">
        <button id="btn-home">Change mode</button>
        <button id="btn-settings">Settings</button>
      </div>
    `;

    for (const el of Array.from(this.body.querySelectorAll<HTMLElement>('.role'))) {
      el.addEventListener('click', () => {
        // `setRole` abandons any run, saves the choice and reloads that role's
        // unlocks; redrawing the screen is all that is left to do.
        mode.setRole(el.dataset.role as RoleId);
        this.show('songs');
      });
    }
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
    const mode = this.shell.playtune;
    const tune = mode?.tune ?? null;
    const order = mode?.tunes ?? [];
    const at = tune ? order.findIndex((t) => t.id === tune.id) : -1;
    const next = at >= 0 ? order[at + 1] : undefined;
    const nextOpen = next && mode?.progress.unlocked.includes(next.id);

    this.renderBoard('Finished', `
      <button class="primary" id="btn-again">Play again</button>
      ${nextOpen ? `<button id="btn-next">Next: ${next!.title}</button>` : ''}
      <button id="btn-list">Song list</button>
    `);
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
    this.live(0);
  }

  // ------------------------------------------------------------ settings ---

  private renderSettings(): void {
    const { input, audio, stage, music } = this.shell;
    const tune = playTuneSettings();
    const midi = input.midi;
    // Everything in Display shows what was *asked for*. What is actually on
    // screen is that minus whatever the ladder has shed, and the panel is not
    // the place to conflate the two.
    const want = stage.preferredQuality;
    const opts = midi.devices.map((dv) =>
      `<option value="${dv.id}" ${dv.id === midi.selectedId ? 'selected' : ''}>${dv.name}</option>`).join('');
    const curves: CurveName[] = ['soft', 'linear', 'hard', 'gamma', 'fixed'];
    // The preference, not what it resolved to — a player on random who saw a
    // named key here would have no way to tell, or to get back.
    const nowKey = music.keyChoice;
    const keys = [`<option value="${RANDOM}" ${nowKey === RANDOM ? 'selected' : ''}>? &mdash; random each game</option>`]
      .concat(NOTE_NAMES.map((n, i) =>
        `<option value="${i}" ${i === nowKey ? 'selected' : ''}>${n}</option>`))
      .join('');
    const scales = [`<option value="${RANDOM}" ${music.choice === RANDOM ? 'selected' : ''}>Random each game</option>`]
      .concat(MODES.map((mode) =>
        `<option value="${mode.id}" ${music.choice === mode.id ? 'selected' : ''}>${mode.label}</option>`))
      .join('');

    // Swatches rather than a dropdown: a theme is a thing you look at, and a
    // list of names tells you nothing about what you are choosing between.
    const nowTheme = themeSettings().id;
    const themeCards = THEMES.map((t) => `
      <button class="theme-card${t.id === nowTheme ? ' on' : ''}" data-theme-id="${t.id}"
              aria-pressed="${t.id === nowTheme}">
        <span class="theme-swatch" aria-hidden="true">
          <i style="background:${t.palette.void}"></i><i style="background:${t.palette.neon}"></i>
          <i style="background:${t.palette.neon2}"></i><i style="background:${t.palette.accent}"></i>
          <i style="background:${t.palette.ink}"></i>
        </span>
        <span class="theme-name">${t.name}</span>
        <span class="theme-blurb">${t.blurb}</span>
      </button>`).join('');

    this.body.innerHTML = `
      <h1>Settings</h1>

      <h2>Theme</h2>
      <div class="theme-grid" id="themes">${themeCards}</div>

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
      <div class="row"><label>Instrument</label><input type="range" id="vol-lead" min="0" max="1" step="0.01" value="${audio.settings.leadLevel}"></div>
      <div class="row"><label>Backing bed</label>
        <span class="pair"><button id="bed">${audio.settings.bed ? 'On' : 'Off'}</button>
        <input type="range" id="vol-bed" min="0" max="1" step="0.01" value="${audio.settings.bedLevel}"></span></div>
      <div class="row"><label>Impacts</label><input type="range" id="vol-fx" min="0" max="1" step="0.01" value="${audio.settings.effects}"></div>
      <div class="row"><label>Room</label><input type="range" id="vol-reverb" min="0" max="1" step="0.01" value="${audio.settings.reverb}"></div>
      <div class="row"><label>Key</label>
        <select id="key">${keys}</select></div>
      <div class="row"><label>Scale</label>
        <select id="scale">${scales}</select></div>
      <p class="diag" id="scale-now"></p>

      <h2>Pinball</h2>
      <div class="row"><label>Snap off-scale notes into the key</label>
        <button id="assist">${audio.settings.assist ? 'On' : 'Off'}</button></div>
      <p class="diag">Pinball only. Freestyle plays exactly what you press, and
        PlayTune takes the chart as the authority on what the note should be.</p>
      <div class="row"><label>Drums under a rally</label>
        <button id="pb-drums">${pinballSettings().drums ? 'On' : 'Off'}</button></div>
      <p class="diag">The bed builds with a rally either way; this is whether the
        rhythm box joins it.</p>

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
          ${LEAD_BEAT_CHOICES.map((b) => `<option value="${b}" ${tune.leadBeats === b ? 'selected' : ''}>${b} beats</option>`).join('')}
        </select></div>
      <p class="diag">Beats of lane, so a longer note still shows a longer tail.
        Past ${APPROACH_BPM_CAP} bpm the approach stops shrinking &mdash; a quick tune
        gives you the same seconds of warning as a slower one rather than the same
        count of beats.</p>
      <div class="row"><label>Light the key a note is heading for</label>
        <button id="pt-assist">${tune.assist ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Note names on the auras</label>
        <button id="pt-names">${tune.noteNames ? 'On' : 'Off'}</button></div>
      <p class="diag">Spelled the way the tune's key writes them, so an aura and the
        chord readout above it agree. Off leaves the board to hue and shape alone.</p>
      <div class="row"><label>Unlocked tunes</label>
        <span><span class="diag" id="pt-unlocked"></span> <button id="pt-reset">Reset&hellip;</button></span></div>
      <div class="row"><label>Unlocked chord parts</label>
        <span><span class="diag" id="pc-unlocked"></span> <button id="pc-reset">Reset&hellip;</button></span></div>
      <p class="diag">Two chains, because they are two different things to learn.
        Resetting one leaves the other where it is.</p>

      <h2>Display</h2>
      <div class="row"><label>Graphics</label>
        <select id="q-preset">
          ${GRAPHICS_PRESETS.map(([id, label]) =>
            `<option value="${id}" ${this.shell.graphicsPreset === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select></div>
      <p class="diag">Auto watches how long each frame actually takes and gives up
        the most expensive effects, one at a time, only on a machine that cannot
        keep up &mdash; then takes them back when it can. The others hold a fixed
        level whatever the frame is doing. Right now: <span id="q-now"></span>.</p>
      <div class="row"><label>Sound quality</label>
        <select id="q-sound">
          ${SOUND_PRESETS.map(([id, label]) =>
            `<option value="${id}" ${this.shell.soundPreset === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select></div>
      <p class="diag">Lite shortens the hall, drops the unison voices and allows
        fewer sounds at once. Auto follows the graphics: the sound only gives
        anything up once the picture already has.</p>
      <div class="row"><label>Bloom</label><button id="q-bloom">${want.bloom ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Playfield light</label><button id="q-pools">${want.pools ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Note labels</label><button id="q-labels">${want.labels ? 'On' : 'Off'}</button></div>
      <p class="diag">The C marked on each octave of the keys, the note names on a
        table's bumpers and targets, and the key a falling ball is named for.
        PlayTune's falling auras carry their own names, switched separately
        under PlayTune.</p>
      <div class="row"><label>Reduced motion</label><button id="q-motion">${want.reducedMotion ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Colour-blind palette</label><button id="q-cb">${want.colorBlind ? 'On' : 'Off'}</button></div>
      <div class="row"><label>Table size</label>
        <span><input type="range" id="q-size" min="${TABLE_SIZE.min}" max="${TABLE_SIZE.max}" step="${TABLE_SIZE.step}" value="${want.tableSize}">
        <span class="diag" id="q-size-now"></span></span></div>
      <p class="diag">How much of the screen the playfield takes. A landscape display
        leaves the table plenty of room sideways and none at all lengthways, so a
        larger setting buys the size by raking the table a little further towards you
        rather than by cropping the keyboard off the bottom.</p>

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

    // Switching redraws this very panel, so the handler is attached to the
    // container rather than to cards that are about to be replaced.
    $('#themes').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-id]');
      if (!card) return;
      const picked = THEMES.find((t) => t.id === card.dataset.themeId);
      if (!picked || picked.id === themeSettings().id) return;
      this.shell.setTheme(picked);
      this.show('settings');
    });

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
      music.setKey(toKeyChoice((e.target as HTMLSelectElement).value)));

    type Level = 'master' | 'music' | 'leadLevel' | 'bedLevel' | 'effects' | 'reverb';
    const bindSlider = (sel: string, key: Level) => {
      const el = $<HTMLInputElement>(sel);
      // The track's fill is painted from this, so it needs setting on the way in
      // as well as on every move.
      const paint = () => el.style.setProperty('--fill', `${Number(el.value) * 100}%`);
      el.addEventListener('input', () => {
        audio.setSettings({ [key]: Number(el.value) });
        paint();
      });
      paint();
      // Something else can move this while the panel is open — a controller's
      // volume knob on master, most of all. Pushing the value in without
      // repainting was exactly that bug: the thumb moved and the fill stayed
      // where it was. Compared against the *stepped* value, because that is
      // what the input snaps whatever it is handed to.
      return () => {
        const stepped = Math.round(audio.settings[key] * 100) / 100;
        if (Number(el.value) === stepped) return;
        el.value = String(stepped);
        paint();
      };
    };
    const levels = [
      bindSlider('#vol-master', 'master'),
      bindSlider('#vol-music', 'music'),
      bindSlider('#vol-lead', 'leadLevel'),
      bindSlider('#vol-bed', 'bedLevel'),
      bindSlider('#vol-fx', 'effects'),
      bindSlider('#vol-reverb', 'reverb'),
    ];

    const toggle = (sel: string, get: () => boolean, set: (v: boolean) => void) => {
      const btn = $(sel);
      btn.addEventListener('click', () => { set(!get()); btn.textContent = get() ? 'On' : 'Off'; });
    };
    toggle('#assist', () => audio.settings.assist, (v) => audio.setSettings({ assist: v }));
    toggle('#bed', () => audio.settings.bed, (v) => audio.setSettings({ bed: v }));
    toggle('#pb-drums', () => pinballSettings().drums, (v) => {
      setPinballSettings({ drums: v });
      this.shell.applyModeSettings();
    });
    const quality = (sel: string, key: 'bloom' | 'pools' | 'labels' | 'reducedMotion' | 'colorBlind') => {
      // Read and written against the *preference*, never against what is on
      // screen this second. The ladder derives the running quality from the
      // preference and a rung, so an effect the machine has shed would
      // otherwise show here as one the player had switched off -- and the next
      // click would then "turn on" something that was already on.
      toggle(sel, () => stage.preferredQuality[key], (v) => stage.setQuality({ [key]: v }));
    };
    const presetEl = $<HTMLSelectElement>('#q-preset');
    const nowEl = $('#q-now');
    const showNow = () => {
      const auto = this.shell.graphicsPreset === 'auto';
      const giving = this.shell.qualitySummary;
      nowEl.textContent = giving === 'full'
        ? (auto ? 'everything on' : 'everything on, held there')
        : `${auto ? 'shedding' : 'holding'} ${giving}`;
    };
    showNow();
    presetEl.addEventListener('change', () => {
      this.shell.setGraphicsPreset(presetEl.value as GraphicsPreset);
      showNow();
    });
    const soundEl = $<HTMLSelectElement>('#q-sound');
    soundEl.addEventListener('change', () => {
      this.shell.setSoundPreset(soundEl.value as SoundPreset);
    });

    quality('#q-bloom', 'bloom');
    quality('#q-pools', 'pools');
    quality('#q-labels', 'labels');
    quality('#q-motion', 'reducedMotion');
    quality('#q-cb', 'colorBlind');

    const sizeEl = $<HTMLInputElement>('#q-size');
    const sizeNow = $('#q-size-now');
    const paintSize = () => {
      const v = Number(sizeEl.value);
      const t = (v - TABLE_SIZE.min) / (TABLE_SIZE.max - TABLE_SIZE.min);
      sizeEl.style.setProperty('--fill', `${t * 100}%`);
      sizeNow.textContent = `${Math.round(v * 100)}%`;
    };
    sizeEl.addEventListener('input', () => {
      stage.setQuality({ tableSize: Number(sizeEl.value) });
      paintSize();
    });
    paintSize();
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
    toggle('#pt-names', () => playTuneSettings().noteNames, (v) => setPlayTuneSettings({ noteNames: v }));

    // One chain per role, wired the same way. The live mode only takes the
    // fresh progress if it is the role that was just wiped — the other one is
    // still holding its own, and handing it this would blank it on screen.
    const bindReset = (countSel: string, btnSel: string, role: TuneRole) => {
      const countEl = $(countSel);
      const paint = () => {
        const mode = this.shell.playtune;
        const live = mode && mode.role.id === role.id ? mode.progress : null;
        const n = (live ?? loadProgress(role.storageKey, role.order)).unlocked.length;
        countEl.textContent = `${n} of ${role.order.length}`;
      };
      paint();
      const btn = $(btnSel);
      btn.addEventListener('click', () => {
        // Two presses, because this is the one setting that destroys something.
        if (btn.dataset.armed !== 'yes') {
          btn.dataset.armed = 'yes';
          btn.textContent = 'Really reset?';
          return;
        }
        const fresh = resetProgress(role.storageKey, role.order);
        const mode = this.shell.playtune;
        if (mode && mode.role.id === role.id) mode.progress = fresh;
        btn.dataset.armed = '';
        btn.textContent = 'Reset…';
        paint();
      });
    };
    bindReset('#pt-unlocked', '#pt-reset', MELODY_ROLE);
    bindReset('#pc-unlocked', '#pc-reset', CHORDS_ROLE);

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
    this.live = () => {
      for (const follow of levels) follow();
      // Under Random the key and scale are only knowable at run time, so say
      // them. This line is the only place a `?` player learns what they landed
      // in, so either preference being random has to reach it.
      const drawn = music.choice === RANDOM || music.keyChoice === RANDOM;
      scaleNow.textContent = `Playing ${noteName(music.root)} ${music.label}`
        + (drawn ? ' — a new one is drawn each game' : '');
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
    this.live(0);
  }
}
