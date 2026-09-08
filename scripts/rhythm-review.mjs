/**
 * Offline audition files using the real engine and the published score.
 * On an isolated Vite page: await import('/scripts/rhythm-review.mjs').
 * render(id, role) returns a WAV and metering, with ideal player key presses.
 * It does not change the app's settings or play through its speakers.
 */
import { AudioEngine, DEFAULT_AUDIO } from '/src/audio/engine.ts';
import { compilePublishedCatalog } from '/src/content/export.ts';

const RATE = 48000;
const START = 0.2;
const QUANTUM = 128 / RATE;

function wav(buffer) {
  const channels = buffer.numberOfChannels;
  const bytes = new Uint8Array(44 + buffer.length * channels * 2);
  const view = new DataView(bytes.buffer);
  const text = (at, value) => { for (let i = 0; i < value.length; i++) bytes[at+i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  let at = 44, sum = 0, peak = 0, clipped = 0;
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const value = buffer.getChannelData(c)[i];
    sum += value * value; peak = Math.max(peak, Math.abs(value));
    if (Math.abs(value) >= 1) clipped++;
    view.setInt16(at, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true); at += 2;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  let tailSum = 0, tailCount = 0;
  for (let c = 0; c < channels; c++) for (let i = buffer.length - RATE * 2; i < buffer.length; i++) {
    tailSum += buffer.getChannelData(c)[i] ** 2; tailCount++;
  }
  return { base64: btoa(binary), peak, rms: Math.sqrt(sum / (buffer.length * channels)),
    tailRms: Math.sqrt(tailSum / tailCount), clipped };
}

export function entries() {
  return compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries
    .filter(e => e.drumEvents?.length).map(e => ({ id: e.id, role: e.role, title: e.title }));
}

export async function render(id, role = 'melody', stem = 'mix') {
  const entry = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries
    .find(e => e.id === id && e.role === role);
  if (!entry) throw Error('Unknown course ' + role + ':' + id);
  const beat = 60 / entry.bpm;
  const endBeat = Math.max(...entry.playerNotes.map(n => n.beat + n.len), ...entry.backingEvents.map(n => n.beat + n.len));
  const duration = START + endBeat * beat + 6;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * RATE), RATE);
  const engine = new AudioEngine();
  engine.settings = { ...DEFAULT_AUDIO };
  engine.ctx = ctx; engine.ready = true; engine.lite = false;
  Object.defineProperty(engine, 'running', { get: () => true });
  engine.build(ctx);
  engine.setTempo(entry.bpm);
  engine.setKeyVoicing(entry.voices.keyVoicing);
  if (entry.voices.keyVoicing === 'bed') engine.setKeyBedVoice(entry.voices.keys);
  else engine.setLeadVoice(entry.voices.keys);
  engine.setBedVoice(entry.voices.backing);

  if (stem === 'mix' || stem === 'backing') for (const event of entry.backingEvents) {
    engine.pad(event.notes, event.len * beat, event.gain, START + event.beat * beat, event.attack * beat);
  }
  if (stem === 'mix' || stem === 'drums') {
    const track = engine.createDrumTrack();
    for (const hit of entry.drumEvents ?? []) track.drum(hit.voice, hit.gain, START + hit.beat * beat);
  }

  const groups = new Map();
  function place(time, action) {
    const quantum = Math.floor(time / QUANTUM);
    const group = groups.get(quantum) ?? []; group.push(action); groups.set(quantum, group);
  }
  if (stem === 'mix' || stem === 'player') for (const note of entry.playerNotes) {
    place(START + note.beat * beat, { note: note.note, on: true });
    place(START + (note.beat + note.len) * beat, { note: note.note, on: false });
  }
  const pauses = [...groups.entries()].sort((a,b) => a[0]-b[0])
    .map(([q, actions]) => ({ promise: ctx.suspend(q * QUANTUM), actions }));
  const rendering = ctx.startRendering();
  for (const pause of pauses) {
    await pause.promise;
    for (const action of pause.actions.filter(a => !a.on)) engine.noteOff(action.note);
    for (const action of pause.actions.filter(a => a.on)) engine.noteOn(action.note, .72, 0);
    await ctx.resume();
  }
  const buffer = await rendering;
  const result = wav(buffer);
  return {
    id, role, title: entry.title, stem, bpm: entry.bpm, duration, scoreSeconds: endBeat * beat,
    playerNotes: entry.playerNotes.length, backingEvents: entry.backingEvents.length,
    drumEvents: entry.drumEvents?.length ?? 0, ...result,
  };
}
