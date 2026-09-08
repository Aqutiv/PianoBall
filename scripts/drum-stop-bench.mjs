/**
 * Real Chromium/Web Audio regression for PR #49's drum reverb cancellation.
 * Run on a Vite dev page:
 *   await (await import('/scripts/drum-stop-bench.mjs')).run()
 * Uses the actual synthesis, impulse responses, convolution, and output mix.
 * It never plays through speakers or changes the app's audio/preferences.
 */
import { AudioEngine, DEFAULT_AUDIO } from '/src/audio/engine.ts';

const RATE = 48000;
const STOP = 0.2;
const DURATION = 3;

function energy(buffer, from, to) {
  let sum = 0, peak = 0, count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const samples = buffer.getChannelData(c);
    for (let i = Math.ceil(from * RATE); i < Math.floor(to * RATE); i++) {
      const value = samples[i];
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
      count++;
    }
  }
  return { rms: Math.sqrt(sum / count), peak };
}

function difference(a, b, from, to) {
  let sum = 0, count = 0;
  for (let c = 0; c < a.numberOfChannels; c++) {
    const left = a.getChannelData(c), right = b.getChannelData(c);
    for (let i = Math.ceil(from * RATE); i < Math.floor(to * RATE); i++) {
      sum += (left[i] - right[i]) ** 2;
      count++;
    }
  }
  return Math.sqrt(sum / count);
}

async function render({ isolated = true, cancel = true, future = false, restart = false,
  shared = false, sharedOnly = false, wetOnly = true, lite = false } = {}) {
  const ctx = new OfflineAudioContext(2, RATE * DURATION, RATE);
  const engine = new AudioEngine();
  engine.settings = { ...DEFAULT_AUDIO, reverb: 1 };
  engine.ctx = ctx;
  engine.ready = true;
  engine.lite = lite;
  // Offline contexts are suspended while we construct/schedule their graph.
  Object.defineProperty(engine, 'running', { get: () => true });
  let seed = 0x7c49;
  const random = Math.random;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  let track, hit;
  try {
    engine.build(ctx);
    // Isolate the effect return: silence the shared dry music bus only.
    if (wetOnly) engine.musicBus.gain.value = 0;
    // Construct this first so paired renders have identical shared audio.
    if (shared || sharedOnly) engine.drum('snare', 1, .05);
    if (!sharedOnly) {
      if (isolated) track = engine.createDrumTrack();
      hit = (track ?? engine).drum('snare', 1, .05);
      if (future) (track ?? engine).drum('crash', 1, .8);
    }
  } finally {
    Math.random = random;
  }
  const suspended = cancel && !sharedOnly ? ctx.suspend(STOP) : null;
  const rendering = ctx.startRendering();
  if (suspended) {
    await suspended;
    if (track) track.cancel();
    else hit.cancel(); // Control: the old, source-only cancellation behavior.
    if (restart) {
      const fresh = engine.createDrumTrack();
      fresh.drum('kick', 1, 1.2);
    }
    await ctx.resume();
  }
  return rendering;
}

const assert = (ok, message) => { if (!ok) throw new Error(message); };

export async function run() {
  const metrics = {};
  // Positive control: this must expose the bug, not accidentally measure silence.
  const old = await render({ isolated: false });
  metrics.legacyWetTail = energy(old, .3, 1);
  assert(metrics.legacyWetTail.rms > .001, 'Control did not reproduce the shared reverb tail');

  for (const lite of [false, true]) {
    const mode = lite ? 'lite' : 'full';
    const stopped = await render({ lite });
    metrics[mode + 'StoppedWetTail'] = energy(stopped, .3, 1);
    assert(metrics[mode + 'StoppedWetTail'].rms < 1e-6, mode + ': cancelled reverb is still audible');
    assert(energy(stopped, .06, .18).rms > .001, mode + ': drum was silent before cancellation');
  }

  const uninterrupted = await render({ cancel: false });
  const sharedUninterrupted = await render({ isolated: false, cancel: false });
  metrics.uninterruptedDifference = difference(uninterrupted, sharedUninterrupted, .04, 2.8);
  assert(metrics.uninterruptedDifference < 1e-6, 'Isolation changed the uninterrupted drum sound');

  const future = await render({ future: true, wetOnly: false });
  metrics.cancelledFutureHit = energy(future, .7, 1.15);
  assert(metrics.cancelledFutureHit.rms < 1e-6, 'A future hit escaped the cancelled arrangement');
  const restarted = await render({ future: true, restart: true, wetOnly: false });
  metrics.restartCountIn = energy(restarted, .7, 1.15);
  metrics.restartedHit = energy(restarted, 1.2, 1.5);
  assert(metrics.restartCountIn.rms < 1e-6, 'Starting a new arrangement revived an old source or effect tail');
  assert(metrics.restartedHit.rms > .001, 'Cancelling the old arrangement muted the new arrangement');

  const shared = await render({ sharedOnly: true, cancel: false });
  const mixed = await render({ shared: true });
  metrics.otherAudioDifference = difference(shared, mixed, .3, 1);
  assert(energy(shared, .3, 1).rms > .001, 'Other-audio control is silent');
  assert(metrics.otherAudioDifference < 1e-6, 'Stopping tune drums changed the shared effect return');
  return { passed: true, sampleRate: RATE, stopAt: STOP, metrics };
}
