import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { Game } from '../../game/game';
import { AURORA } from '../../game/table/tables/aurora';
import { PinballRenderer, type DrawHints } from '../../render/renderer';
import { predictLanding, type Landing } from '../../game/predict';
import { PinballAudio } from './audio';
import { PinballHud } from './hud';
import { pitchHue } from '../../render/palette';
import { clamp01 } from '../../core/math';
import { load, save } from '../../core/storage';

export interface Scores { pinball: number }

const SCORES_KEY = 'scores';
/** Older builds kept a bare number here, before there was more than one mode. */
const LEGACY_BEST_KEY = 'best';

/** Best score per mode, honouring what a pre-modes build left behind. */
export function loadScores(): Scores {
  const stored = load<Scores>(SCORES_KEY, { pinball: 0 });
  return { pinball: Math.max(stored.pinball || 0, load<number>(LEGACY_BEST_KEY, 0) || 0) };
}

export function saveBest(score: number): number {
  const best = Math.max(score, loadScores().pinball);
  save(SCORES_KEY, { pinball: best });
  return best;
}

/**
 * The original game: musical pinball, thirty-two flippers.
 *
 * The table itself is built once and kept, so leaving and coming back does not
 * rebuild the world or re-add every paddle. Only the subscriptions come and go.
 */
export class PinballMode extends ModeBase implements GameMode {
  readonly id: GameModeId = 'pinball';
  readonly game: Game;

  private readonly renderer: PinballRenderer;
  private readonly audio: PinballAudio;
  private readonly panel: PinballHud;
  private readonly ctx: ModeContext;
  private overTimer = 0;

  /** Where each live ball is coming down, refreshed once per drawn frame. */
  private readonly landings: Landing[] = [];
  /** Extra light per note, keyed off those landings. */
  private readonly lit = new Map<number, number>();
  private readonly hints: DrawHints = {
    highlight: (note) => this.lit.get(note) ?? 0,
    landings: this.landings,
  };

  constructor(ctx: ModeContext) {
    super();
    this.ctx = ctx;
    this.game = new Game(ctx.input, AURORA, ctx.music);
    this.renderer = new PinballRenderer(ctx.stage);
    this.audio = new PinballAudio(ctx.audio, ctx.bed, this.game);
    this.panel = new PinballHud(ctx.hud, this.game);
  }

  get timeScale(): number { return this.game.timeScale; }

  enter(): void {
    const { stage, music, audio } = this.ctx;
    const game = this.game;

    stage.cam.configure({ width: game.def.width, height: game.def.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

    game.active = true;
    this.panel.mount();
    this.audio.attach();
    this.wire();

    // The scale is chosen outside the mode now, so the playfield has to be
    // carried across whenever it changes underneath us. The delay is locked to
    // the tempo, so it follows the same changes — and is put right on the way
    // in, rather than left at whatever the last mode was playing at.
    this.track(music.bus.on('change', (m) => { game.retune(); audio.setTempo(m.bpm); }));
    this.track(music.bus.on('tempo', (bpm) => audio.setTempo(bpm)));
    game.retune();
    audio.setTempo(music.bpm);

    this.ctx.bed.start();
  }

  exit(): void {
    this.game.active = false;
    this.release();
    this.audio.detach();
    this.game.keybed.allOff();
    if (this.overTimer) { clearTimeout(this.overTimer); this.overTimer = 0; }
    this.ctx.hud.clearPanels();
  }

  step(dt: number): void {
    this.game.step(dt);
  }

  remap(): void {
    this.game.remapKeybed();
  }

  /**
   * The shell stops stepping us; this drops what the hands were holding, so a
   * key held when the menu opened is not still down when play resumes.
   */
  pause(): void {
    this.game.active = false;
    this.game.keybed.allOff();
    this.audio.pause();
  }

  resume(): void {
    this.game.active = true;
    this.audio.resume();
  }

  draw(alpha: number, frameDt: number): void {
    this.predict();
    this.renderer.draw(this.game, alpha, frameDt, this.hints);
  }

  /**
   * Work out which key each falling ball is heading for.
   *
   * Once per drawn frame, not once per simulation step: this is an affordance
   * rather than physics, and sixty a second is as often as anyone can read it.
   */
  private predict(): void {
    const L = this.landings;
    L.length = 0;
    this.lit.clear();
    // Not while serving. The held ball is pinned, so it would predict a landing
    // for a drop that has not happened — and pointing at one key would be a
    // lie, because at the serve *any* key drops the ball and the one chosen is
    // what aims it.
    if (this.game.state !== 'play') return;

    for (const ball of this.game.balls) {
      const landing = predictLanding(ball, this.game.world, this.game.keybed);
      if (!landing) continue;
      L.push(landing);
      // Full brightness as it arrives, with a floor so the key is visible from
      // far enough out to actually move a hand there.
      const s = clamp01((1.4 - landing.t) / 1.1) * 0.75 + 0.25;
      this.lit.set(landing.note, Math.max(this.lit.get(landing.note) ?? 0, s));
    }
  }

  hud(): void {
    this.panel.update();
  }

  debugLines(): string {
    return `balls ${this.game.balls.length}  parts ${this.ctx.stage.particles.liveCount}\n`
      + `held ${this.ctx.input.held.size}  bend ${this.ctx.input.bend.toFixed(2)}`;
  }

  /** Start a fresh run. The shell calls this when the mode is chosen. */
  newGame(): void {
    // A run can be restarted inside the pause between GAME OVER and the
    // results screen. Left pending, that timer would drop the screen over the
    // run that has just begun — and opening a screen does not stop the
    // simulation, so the new ball would play on unattended behind it.
    if (this.overTimer) { clearTimeout(this.overTimer); this.overTimer = 0; }
    // Asked for from behind a menu as often as not — the pause panel's
    // Restart, or the home screen with this table already the one behind it.
    // Those paths suspended the mode without ever resuming it, and a new game
    // with the keys still switched off is a ball that cannot be dropped.
    this.game.active = true;
    this.game.newGame();
  }

  /**
   * Backspace: this run again, from ball one. Only while a run is actually in
   * front of the player — behind a menu the key belongs to whatever has focus.
   */
  restart(): boolean {
    if (!this.game.active) return false;
    this.newGame();
    return true;
  }

  /**
   * Preferences moved under a running table. The keybed's mapped range and the
   * playfield's scale are both read once on the way in, so both have to be
   * re-read here; the static layer holds the painted note names, so it goes too.
   */
  applySettings(): void {
    this.game.remapKeybed();
    this.game.retune();
    this.panel.showMusic();
    this.ctx.stage.invalidate();
    // The drums preference is read whenever a rung is applied, so applying the
    // current one is what makes a change heard now rather than at the next
    // rally. Not behind a menu, though: a paused table stays quiet.
    if (this.game.active) this.audio.resume();
  }

  pointerDown(x: number, y: number): number | null {
    const key = this.game.keybed.pick(x, y);
    if (!key) return null;
    const g = key.geom;
    const force = this.game.keybed.strikeForce(key, x, y);
    this.ctx.input.press(g.note, force, 'pointer');
    return g.note;
  }

  pointerUp(note: number): void {
    this.ctx.input.release(note, 'pointer');
  }

  // ------------------------------------------------------------- wiring ---

  private wire(): void {
    const { stage, hud } = this.ctx;
    const bus = this.game.bus;
    const game = this.game;

    this.track(bus.on('impact', (e) => {
      if (e.energy < 60) return;
      const hue = e.note !== null ? pitchHue(e.note) : 205;
      stage.particles.burst(e.x, e.y, 0, 1, e.energy, hue, 8);
    }));

    this.track(bus.on('element', (e) => {
      const hue = e.el.note !== null ? pitchHue(e.el.note) : 205;
      stage.particles.ring(e.el.x, e.el.y, e.el.z + 6, hue, e.el.r || 34, 0.5);
      stage.particles.burst(e.x, e.y, e.x - e.el.x, e.y - e.el.y, e.impact, hue, 14);
      if (e.el.kind === 'bumper' || e.el.kind === 'sling') stage.kick(e.energised ? 6 : 3.5);
    }));

    this.track(bus.on('launch', (ev) => {
      const hue = pitchHue(ev.key.geom.note);
      stage.particles.ring(ev.x, ev.y, 12, hue, 30 + ev.velocity * 40, 0.4);
      stage.particles.burst(ev.x, ev.y, ev.dirX, ev.dirY, 120 + ev.velocity * 600, hue, 16);
      stage.kick(1.5 + ev.velocity * 4);
    }));

    this.track(bus.on('key', (e) => {
      const g = e.key.geom;
      stage.particles.spawn('spark', g.cx, g.cy, 20, {
        vz: 120 + e.force * 260, maxLife: 0.3, size: 16 + e.force * 22, hue: pitchHue(g.note),
      });
      const r = game.keybed.range;
      stage.logNote(e.note, e.force, r.low, r.high);
    }));

    this.track(bus.on('keyup', (e) => stage.endNote(e.note)));

    this.track(bus.on('drain', (e) => {
      stage.particles.burst(e.x, e.y + 20, 0, 1, 320, e.saved ? 150 : 0, 22);
      stage.kick(e.saved ? 3 : 9);
      hud.banner(e.saved ? 'BALL SAVED' : 'DRAIN', 1.2, e.saved ? 'warn' : 'bad');
    }));

    this.track(bus.on('multiball', (e) => { hud.banner(`MULTIBALL ×${e.count}`, 2.2); stage.kick(14); }));
    this.track(bus.on('objective', (e) => hud.banner(e.label, 1.8)));
    this.track(bus.on('chord', (e) => hud.banner(e.name || 'CLUSTER', 1.1)));

    // `tilt` is an edge, so this fires exactly once per tilt-out.
    this.track(bus.on('tilt', (e) => {
      if (e.tilted) hud.banner('TILT', 2, 'bad');
    }));

    this.track(bus.on('state', ({ to }) => {
      if (to === 'serve') hud.banner('PRESS A KEY TO DROP', 2.4, 'warn');
      if (to === 'over') {
        hud.banner('GAME OVER', 4);
        saveBest(game.scoring.score);
        this.ctx.setResult({
          title: 'Game over',
          lines: [
            { label: 'Score', value: game.scoring.score.toLocaleString() },
            { label: 'Best combo', value: String(game.scoring.comboBest) },
          ],
        });
        this.overTimer = window.setTimeout(() => this.ctx.openScreen('gameover'), 1400);
      }
    }));

    // The playfield's note names and per-pitch hues are painted into the static
    // layer, so a retune is invisible until that layer is thrown away.
    this.track(bus.on('music', () => {
      this.panel.showMusic();
      stage.invalidate();
    }));
  }
}
