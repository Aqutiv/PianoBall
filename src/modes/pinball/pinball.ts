import { ModeBase, type GameMode, type GameModeId, type ModeContext } from '../../app/mode';
import { Game } from '../../game/game';
import { AURORA } from '../../game/table/tables/aurora';
import { PinballRenderer } from '../../render/renderer';
import { PinballAudio } from './audio';
import { PinballHud } from './hud';
import { pitchHue } from '../../render/palette';
import { clamp } from '../../core/math';
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
  private tiltAnnounced = false;
  private overTimer = 0;

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
    const { stage, music } = this.ctx;
    const game = this.game;

    stage.palette = game.def.palette;
    stage.cam.configure({ width: game.def.width, height: game.def.height });
    stage.resize(stage.cssW, stage.cssH, stage.dpr);

    game.active = true;
    this.panel.mount();
    this.audio.attach();
    this.wire();

    // The scale is chosen outside the mode now, so the playfield has to be
    // carried across whenever it changes underneath us.
    this.track(music.bus.on('change', () => game.retune()));
    game.retune();

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

  draw(alpha: number, frameDt: number): void {
    this.renderer.draw(this.game, alpha, frameDt);
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
    this.game.newGame();
  }

  pointerDown(x: number, y: number): number | null {
    const key = this.game.keybed.pick(x, y);
    if (!key) return null;
    // Striking nearer the front lip counts as a harder hit, like a drum pad.
    const g = key.geom;
    const depth = (x - g.cx) * g.nx + (y - g.cy) * g.ny;
    const force = clamp(0.42 + (depth + g.depth * 0.35) / (g.depth * 0.9), 0.18, 1);
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

    this.track(bus.on('tilt', (e) => {
      if (e.tilted && !this.tiltAnnounced) { hud.banner('TILT', 2, 'bad'); this.tiltAnnounced = true; }
      if (!e.tilted) this.tiltAnnounced = false;
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
