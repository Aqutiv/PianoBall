import './styles.css';
import { GameLoop } from './core/loop';
import { Renderer } from './render/renderer';
import { InputHub } from './midi/inputHub';
import { Game } from './game/game';
import { AURORA } from './game/table/tables/aurora';
import { Hud } from './ui/hud';
import { Overlay } from './ui/overlay';
import { AudioDirector } from './audio/director';
import { pitchHue } from './render/palette';
import { noteName } from './midi/notes';
import { clamp } from './core/math';

const canvas = document.getElementById('table') as HTMLCanvasElement;
const hudRoot = document.getElementById('hud') as HTMLElement;
const overlayRoot = document.getElementById('overlay') as HTMLElement;

const renderer = new Renderer(canvas);
const input = new InputHub();
const game = new Game(input, AURORA);
const hud = new Hud(hudRoot);
const audio = new AudioDirector(game, input);
const overlay = new Overlay(overlayRoot, {
  game, input, audio, renderer,
  onStart: () => { void audio.start(); game.newGame(); },
});

// Respect the OS setting rather than waiting to be told.
if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  renderer.quality.reducedMotion = true;
}

// --------------------------------------------------------------- sizing ---

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  renderer.resize(window.innerWidth, window.innerHeight, dpr);
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------- event reactions ---

game.bus.on('impact', (e) => {
  if (e.energy < 60) return;
  const hue = e.note !== null ? pitchHue(e.note) : 205;
  renderer.particles.burst(e.x, e.y, 0, 1, e.energy, hue, 8);
});

game.bus.on('element', (e) => {
  const hue = e.el.note !== null ? pitchHue(e.el.note) : 205;
  renderer.particles.ring(e.el.x, e.el.y, e.el.z + 6, hue, e.el.r || 34, 0.5);
  renderer.particles.burst(e.x, e.y, e.x - e.el.x, e.y - e.el.y, e.impact, hue, 14);
  if (e.el.kind === 'bumper' || e.el.kind === 'sling') renderer.kick(e.energised ? 6 : 3.5);
});

game.bus.on('launch', (ev) => {
  const hue = pitchHue(ev.key.geom.note);
  renderer.particles.ring(ev.x, ev.y, 12, hue, 30 + ev.velocity * 40, 0.4);
  renderer.particles.burst(ev.x, ev.y, ev.dirX, ev.dirY, 120 + ev.velocity * 600, hue, 16);
  renderer.kick(1.5 + ev.velocity * 4);
});

game.bus.on('key', (e) => {
  const g = e.key.geom;
  renderer.particles.spawn('spark', g.cx, g.cy, 20, {
    vz: 120 + e.force * 260, maxLife: 0.3, size: 16 + e.force * 22, hue: pitchHue(g.note),
  });
  const r = game.keybed.range;
  renderer.logNote(e.note, e.force, r.low, r.high);
});

game.bus.on('keyup', (e) => renderer.endNote(e.note));

game.bus.on('drain', (e) => {
  renderer.particles.burst(e.x, e.y + 20, 0, 1, 320, e.saved ? 150 : 0, 22);
  renderer.kick(e.saved ? 3 : 9);
  hud.banner(e.saved ? 'BALL SAVED' : 'DRAIN', 1.2, e.saved ? 'warn' : 'bad');
});

game.bus.on('multiball', (e) => { hud.banner(`MULTIBALL ×${e.count}`, 2.2); renderer.kick(14); });
game.bus.on('objective', (e) => hud.banner(e.label, 1.8));
game.bus.on('chord', (e) => hud.banner(e.name || 'CLUSTER', 1.1));

game.bus.on('state', ({ to }) => {
  if (to === 'serve') hud.banner('PRESS A KEY TO DROP', 2.4, 'warn');
  if (to === 'over') hud.banner('GAME OVER', 4);
});

let tiltAnnounced = false;
game.bus.on('tilt', (e) => {
  if (e.tilted && !tiltAnnounced) { hud.banner('TILT', 2, 'bad'); tiltAnnounced = true; }
  if (!e.tilted) tiltAnnounced = false;
});

game.bus.on('state', ({ to }) => {
  if (to === 'over') window.setTimeout(() => overlay.show('gameover'), 1400);
});

/**
 * The table's key, wherever it is shown. The playfield needs rebaking as well
 * as the subtitle: note names and per-pitch hues are painted into the static
 * layer, so a retune is invisible until that layer is thrown away.
 */
function showMusic(m: { label: string; root: number }): void {
  hud.setSubtitle(`${game.def.name} · ${noteName(m.root)} ${m.label}`);
  renderer.invalidate();
}
game.bus.on('music', showMusic);
showMusic(game.music);

// -------------------------------------------------------- pointer input ---

const activePointers = new Map<number, number>();   // pointerId -> note

function noteAt(clientX: number, clientY: number): { note: number; force: number } | null {
  const rect = canvas.getBoundingClientRect();
  const t = renderer.cam.unproject(clientX - rect.left, clientY - rect.top, 26);
  const key = game.keybed.pick(t.x, t.y);
  if (!key) return null;
  // Striking nearer the front lip counts as a harder hit, like a drum pad.
  const g = key.geom;
  const depth = (t.x - g.cx) * g.nx + (t.y - g.cy) * g.ny;
  const force = clamp(0.42 + (depth + g.depth * 0.35) / (g.depth * 0.9), 0.18, 1);
  return { note: g.note, force };
}

canvas.addEventListener('pointerdown', (e) => {
  const hit = noteAt(e.clientX, e.clientY);
  if (!hit) return;
  canvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, hit.note);
  input.press(hit.note, hit.force, 'pointer');
  e.preventDefault();
});

const releasePointer = (e: PointerEvent) => {
  const note = activePointers.get(e.pointerId);
  if (note === undefined) return;
  activePointers.delete(e.pointerId);
  input.release(note, 'pointer');
};
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);

input.keyboard.attach(window);

// ------------------------------------------------------------- the loop ---

/**
 * Adaptive quality.
 *
 * Rather than guessing what the machine can do, watch what it actually
 * manages and shed the expensive effects only when the frame budget is
 * genuinely under pressure.
 */
let frameAvg = 8;
let qualityHeld = 0;
function adaptQuality(dt: number): void {
  frameAvg += ((loop.stats.stepMs + loop.stats.drawMs) - frameAvg) * Math.min(1, dt * 4);
  qualityHeld -= dt;
  if (qualityHeld > 0) return;
  if (frameAvg > 13 && renderer.quality.bloom) {
    renderer.quality.bloom = false;
    renderer.particles.budget = 500;
    qualityHeld = 3;
  } else if (frameAvg > 13 && renderer.quality.shadows) {
    renderer.quality.shadows = false;
    qualityHeld = 3;
  } else if (frameAvg < 7 && !renderer.quality.bloom) {
    renderer.quality.bloom = true;
    renderer.quality.shadows = true;
    renderer.particles.budget = 1400;
    qualityHeld = 6;
  }
}

const loop = new GameLoop({
  hz: 240,
  step: (dt) => game.step(dt),
  draw: (alpha, frameDt) => {
    loop.timeScale = game.timeScale;
    adaptQuality(frameDt);
    renderer.render(game, alpha, frameDt);
    hud.update(game, input, {
      fps: loop.stats.fps,
      stepMs: loop.stats.stepMs,
      drawMs: loop.stats.drawMs,
      particles: renderer.particles.liveCount,
    });
    if (overlay.visible) overlay.update();
    // Typing in the settings panel must not play the piano.
    input.keyboard.enabled = !overlay.visible;
  },
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { hud.showFps = !hud.showFps; e.preventDefault(); }
  if (e.code === 'Escape') { overlay.toggle(); e.preventDefault(); }
  // Any key on the start screen begins play, and doubles as the gesture the
  // audio context needs before it will make a sound.
  if (overlay.screen === 'start' && e.code !== 'Escape') {
    overlay.hide();
    void audio.start();
    game.newGame();
  }
});

// --------------------------------------------------------------- start ---

async function boot(): Promise<void> {
  const status = await input.midi.init().catch(() => 'denied' as const);
  refreshStatus(status);
  input.midi.onDevicesChanged = () => { refreshStatus(input.midi.status); if (overlay.visible) overlay.show(overlay.screen); };
  // The table plays itself behind the menu until the player starts.
  loop.start();
}

function refreshStatus(status: string): void {
  const dev = input.midi.devices.find((d) => d.id === input.midi.selectedId);
  if (status === 'ready' && dev) {
    hud.setStatus(`${dev.name} · ${game.keybed.keys.length} keys`, 'ok');
  } else if (status === 'ready') {
    hud.setStatus('No MIDI device — use the computer keyboard (Z–M, Q–P)', 'warn');
  } else if (status === 'unsupported') {
    hud.setStatus('No Web MIDI in this browser — computer keyboard active', 'warn');
  } else {
    hud.setStatus('MIDI unavailable — computer keyboard active', 'err');
  }
}

boot();

// ------------------------------------------------ scripted control hook ---

/**
 * Everything the game can be driven by, without hardware. This is how the
 * whole thing is tested in a browser that has no MIDI device attached.
 */
const debugApi = {
  game, input, renderer, loop, hud, audio, overlay,
  startAudio: () => audio.start(),
  noteOn: (note: number, velocity = 100) => input.dispatch({
    type: 'noteon', note, velocity, raw: velocity, time: performance.now(), source: 'debug',
  }),
  noteOff: (note: number) => input.dispatch({ type: 'noteoff', note, time: performance.now(), source: 'debug' }),
  bend: (v: number) => input.dispatch({ type: 'bend', value: v, time: performance.now(), source: 'debug' }),
  cc: (controller: number, value: number) => input.dispatch({
    type: 'cc', controller, value, time: performance.now(), source: 'debug',
  }),
  spawnBall: (x = 512, y = 900, vx = 0, vy = 0) => game.spawnBall(x, y, vx, vy),
  multiball: () => game.startMultiball(),
  newGame: () => game.newGame(),
  /** Advance the simulation without waiting on the display refresh. */
  tick: (steps = 60) => { for (let i = 0; i < steps; i++) game.step(1 / 240); },
  /** Simulate and render `frames` display frames, ignoring requestAnimationFrame. */
  frame: (frames = 1, dt = 1 / 60) => {
    for (let f = 0; f < frames; f++) {
      const steps = Math.round(dt * 240);
      for (let i = 0; i < steps; i++) game.step(1 / 240);
      renderer.render(game, 0, dt);
    }
  },
  /** Render a frame and post the PNG to the dev server so it lands on disk. */
  shot: async (name = 'frame') => {
    renderer.render(game, 0, 1 / 60);
    const data = canvas.toDataURL('image/png');
    const res = await fetch('/__shot', { method: 'POST', body: JSON.stringify({ name, data }) });
    return res.json();
  },
  resizeTo: (w: number, h: number, dpr = 1) => renderer.resize(w, h, dpr),
  state: () => ({
    state: game.state,
    score: game.scoring.score,
    balls: game.balls.map((b) => ({ id: b.id, x: Math.round(b.p.x), y: Math.round(b.p.y), vx: Math.round(b.v.x), vy: Math.round(b.v.y) })),
    ballsLeft: game.ballsLeft,
    fps: Math.round(loop.stats.fps),
    keys: game.keybed.keys.length,
    base: input.mapping.settings.baseNote,
  }),
};
(window as unknown as Record<string, unknown>).__pianoball = debugApi;
