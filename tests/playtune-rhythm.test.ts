import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, type DrumTrack } from '../src/audio/engine';
import type { DrumVoice } from '../src/audio/drums';
import { MusicState } from '../src/audio/musicState';
import { STEP_LEVELS } from '../src/audio/patterns';
import type { ChordBed } from '../src/audio/bed';
import type { ModeContext } from '../src/app/mode';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import type { TuneRhythm } from '../src/modes/playtune/chart';
import { lastBeat, validate } from '../src/modes/playtune/chart';
import { HOPSCOTCH } from '../src/modes/playtune/library/hopscotch';
import { PlayTuneMode } from '../src/modes/playtune/playtune';
import { rhythmEvents, rhythmProblems, TuneDrums } from '../src/modes/playtune/rhythm';
import { resetPlayTuneSettings } from '../src/modes/playtune/settings';
import { Transport } from '../src/modes/playtune/transport';
import type { Stage } from '../src/render/stage';
import type { Hud } from '../src/ui/hud';

const ROCK: TuneRhythm = { sections: [{ beat: 0, len: 8, patternId: 'rock', gain: 0.4 }] };

class Sink {
  now = 7.137;
  running = true;
  tracks: (DrumTrack & { cancel: ReturnType<typeof vi.fn> })[] = [];
  createDrumTrack(): DrumTrack {
    const track = {
      drum: (voice: DrumVoice, gain: number, at: number) => this.drum(voice, gain, at),
      tailSeconds: 2.463,
      cancel: vi.fn(),
    };
    this.tracks.push(track);
    return track;
  }
  hits: { voice: DrumVoice; gain: number; at: number; cancel: ReturnType<typeof vi.fn> }[] = [];
  drum(voice: DrumVoice, gain: number, at: number) {
    const hit = { voice, gain, at, cancel: vi.fn() };
    this.hits.push(hit);
    return hit;
  }
}

function run(sink: { now: number }, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.01) {
    sink.now += 0.01;
    vi.advanceTimersByTime(10);
  }
}

beforeEach(() => { vi.useFakeTimers(); resetPlayTuneSettings(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetPlayTuneSettings(); });

describe('authored drum arrangements', () => {
  it('reuses Freestyle accents and keeps phrase gaps and the ending silent', () => {
    const events = rhythmEvents({
      sections: [{ beat: 0, len: 4, patternId: 'rock', gain: 0.4 }],
      hits: [{ beat: 6, voice: 'tomLo', gain: 0.2 }, { beat: 8, voice: 'kick', gain: 0.5 }],
    });
    expect(events.filter(h => h.voice === 'kick').map(h => h.beat)).toEqual([0, 2, 8]);
    expect(events.filter(h => h.voice === 'snare').map(h => h.beat)).toEqual([1, 3]);
    expect(events.find(h => h.voice === 'hat')?.gain).toBeCloseTo(0.4 * STEP_LEVELS.x);
    expect(events.filter(h => h.beat >= 4)).toEqual([
      { beat: 6, voice: 'tomLo', gain: 0.2 }, { beat: 8, voice: 'kick', gain: 0.5 },
    ]);
  });

  it('lets a fill replace or mute a pattern hit without doubling it', () => {
    const events = rhythmEvents({
      ...ROCK,
      hits: [{ beat: 1, voice: 'snare', gain: 0.8 }, { beat: 3, voice: 'snare', gain: 0 }],
    });
    expect(events.filter(h => h.voice === 'snare' && h.beat === 1)).toEqual([
      { beat: 1, voice: 'snare', gain: 0.8 },
    ]);
    expect(events.some(h => h.voice === 'snare' && h.beat === 3)).toBe(false);
  });

  it('keeps the tune bar phase through pickups and a mid-bar section change', () => {
    const events = rhythmEvents({ sections: [
      { beat: 0, len: 3, patternId: 'rock', gain: 0.4 },
      { beat: 3, len: 4, patternId: 'offbeat', gain: 0.4 },
    ] }, 1);
    expect(events.filter(h => h.voice === 'kick').map(h => h.beat)).toEqual([1, 3, 5]);
    expect(events.filter(h => h.voice === 'openhat').map(h => h.beat)).toEqual([3.5, 4.5, 5.5, 6.5]);
  });

  it('preserves written swing without shifting triplets', () => {
    const swing = rhythmEvents({ sections: [{ beat: 0, len: 4, patternId: 'boom-bap', gain: 1 }] });
    expect(swing.find(h => h.voice === 'kick' && h.beat > 0)?.beat).toBeCloseTo(2.25 + 0.2 * 0.25 * 0.66);
    const triplets = rhythmEvents({ sections: [{ beat: 0, len: 4, patternId: 'jazz-ride', gain: 1 }] });
    for (const hit of triplets) expect(hit.beat * 3).toBeCloseTo(Math.round(hit.beat * 3));
  });

  it('rejects malformed sections, unknown patterns, mismatched meters, and out-of-chart hits', () => {
    expect(rhythmProblems(ROCK, 4, 8)).toEqual([]);
    expect(rhythmProblems({ sections: [
      { beat: 0, len: 4, patternId: 'missing', gain: 2 },
      { beat: 3, len: 8, patternId: 'waltz', gain: 0.4 },
    ], hits: [{ beat: 8, voice: 'kick', gain: NaN }] }, 4, 8)).toEqual(expect.arrayContaining([
      'unknown rhythm pattern "missing"',
      'rhythm section at beat 0 has an invalid gain',
      'rhythm pattern "waltz" does not match 4 beats per bar',
      'rhythm section at beat 3 has an invalid length',
      'rhythm sections overlap or are unsorted at beat 3',
      'rhythm hit at beat 8 is outside the chart',
      'rhythm hit at beat 8 has an invalid gain',
    ]));
    expect(rhythmProblems({ sections: [], hits: [
      { beat: 2, voice: 'kick', gain: 0.4 },
      { beat: 1, voice: 'snare', gain: 0.4 },
      { beat: 1, voice: 'snare', gain: 0.4 },
    ] }, 4, 8)).toEqual([
      'rhythm hits are not sorted at beat 1', 'duplicate rhythm hit snare@1',
    ]);
  });

  it('includes authored backing in the score duration and validates its notes', () => {
    const tune = { ...HOPSCOTCH, rhythm: undefined, backingNotes: [{ beat: 64, len: 4, note: 50 }] };
    expect(lastBeat(tune)).toBe(68);
    expect(validate(tune)).toEqual([]);
    expect(validate({ ...tune, backingNotes: [{ beat: -1, len: 0, note: 128 }] })).toEqual(expect.arrayContaining([
      'backing note at beat -1 is outside the chart',
      'backing note at beat -1 has no length',
      'backing note 128 is outside MIDI',
    ]));
  });
});

describe('tune drum transport', () => {
  function rig(bpm = 84) {
    const sink = new Sink();
    const clock = new Transport();
    clock.bpm = bpm;
    clock.start(sink.now, 4);
    return { sink, clock, drums: new TuneDrums(sink) };
  }

  it.each([63, 84, 126])('locks every hit to beat zero after the count-in at %i BPM', bpm => {
    const { sink, clock, drums } = rig(bpm);
    drums.start(ROCK, clock);
    run(sink, 4 * clock.beatSeconds - 0.2);
    expect(sink.hits).toHaveLength(0);
    run(sink, 9 * clock.beatSeconds);
    const expected = rhythmEvents(ROCK);
    expect(sink.hits).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(sink.hits[i].at).toBeCloseTo(clock.timeOf(expected[i].beat), 9);
      expect(sink.hits[i].voice).toBe(expected[i].voice);
      expect(sink.hits[i].gain).toBe(expected[i].gain);
    }
    drums.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels both ringing hits and the lookahead on stop', () => {
    const { sink, clock, drums } = rig();
    drums.start(ROCK, clock);
    run(sink, 4 * clock.beatSeconds - 0.1);
    expect(sink.hits.length).toBeGreaterThan(0);
    expect(sink.hits.every(h => h.at > sink.now)).toBe(true);
    drums.stop();
    expect(sink.hits.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    const count = sink.hits.length;
    run(sink, 5);
    expect(sink.hits).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts against a new count-in and releases the former arrangement', () => {
    const { sink, clock, drums } = rig();
    drums.start(ROCK, clock);
    run(sink, 4 * clock.beatSeconds);
    const before = sink.hits.length;
    const previous = sink.hits.slice();
    clock.start(sink.now, 4);
    drums.start(ROCK, clock);
    expect(previous.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    expect(sink.tracks[0].cancel).toHaveBeenCalledOnce();
    run(sink, 4 * clock.beatSeconds - 0.2);
    expect(sink.hits).toHaveLength(before);
    run(sink, 0.2);
    expect(sink.hits[before].at).toBeCloseTo(clock.timeOf(0));
    drums.stop();
  });

  it('skips missed beats after a stall and never catches up in a burst', () => {
    const { sink, clock, drums } = rig();
    drums.start(ROCK, clock);
    sink.now = clock.timeOf(6) + 0.01;
    vi.advanceTimersByTime(40);
    expect(sink.hits).toHaveLength(0);
    run(sink, 1);
    expect(sink.hits.length).toBeGreaterThan(0);
    expect(sink.hits.every(h => h.at > clock.timeOf(6))).toBe(true);
    drums.stop();
  });

  it('does not schedule against a suspended context and stops when the transport stops', () => {
    const { sink, clock, drums } = rig();
    sink.running = false;
    drums.start(ROCK, clock);
    run(sink, 3);
    expect(sink.hits).toHaveLength(0);
    sink.running = true;
    run(sink, 0.5);
    expect(sink.hits.length).toBeGreaterThan(0);
    clock.stop();
    vi.advanceTimersByTime(40);
    expect(sink.hits.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('creates no route before the audio context runs and owns the full wet decay', () => {
    const { sink, clock, drums } = rig();
    sink.running = false;
    drums.start({ sections: [], hits: [{ beat: 0, voice: 'kick', gain: 0.4 }] }, clock);
    vi.advanceTimersByTime(200);
    expect(sink.tracks).toHaveLength(0);
    sink.running = true;
    run(sink, 4 * clock.beatSeconds + 2.1);
    expect(sink.tracks).toHaveLength(1);
    expect(sink.tracks[0].cancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    // The source's conservative lifetime has passed, but its room still lives.
    drums.stop();
    expect(sink.tracks[0].cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the timer after its authored ending and stays absent on ordinary tunes', () => {
    const { sink, clock, drums } = rig();
    drums.start(undefined, clock);
    expect(vi.getTimerCount()).toBe(0);
    drums.start({ sections: [], hits: [{ beat: 0, voice: 'kick', gain: 0.4 }] }, clock);
    run(sink, 12);
    expect(sink.hits).toHaveLength(1);
    expect(sink.hits[0].cancel).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function modeRig() {
  const sink = new Sink();
  const engine = new AudioEngine();
  vi.spyOn(engine, 'now', 'get').mockImplementation(() => sink.now);
  vi.spyOn(engine, 'running', 'get').mockImplementation(() => sink.running);
  vi.spyOn(engine, 'drum').mockImplementation((voice, gain = 1, at = 0) => sink.drum(voice, gain, at));
  vi.spyOn(engine, 'createDrumTrack').mockImplementation(() => sink.createDrumTrack());
  const panel = () => ({ innerHTML: '', querySelector: () => ({ textContent: '', innerHTML: '', style: {} }), classList: { toggle: vi.fn() } });
  const hud = { left: panel(), right: panel(), banner: vi.fn(), clearPanels: vi.fn() } as unknown as Hud;
  const bed = { clearTracks: vi.fn(), stop: vi.fn(), setTrack: vi.fn(), setNoteTrack: vi.fn(), start: vi.fn() } as unknown as ChordBed;
  const stage = {
    cam: { configure: vi.fn() }, resize: vi.fn(), cssW: 800, cssH: 600, dpr: 1,
    particles: { shatter: vi.fn() }, kick: vi.fn(), hue: () => 0,
  } as unknown as Stage;
  const ctx: ModeContext = {
    stage, input: new InputHub(), audio: engine, bed,
    music: new MusicState({ ...AURORA.music }), hud,
    openScreen: vi.fn(), setResult: vi.fn(),
  };
  const mode = new PlayTuneMode(ctx);
  mode.enter();
  return { mode, sink, bed };
}

describe('Hopscotch drum lifecycle in both play roles', () => {
  it.each(['melody', 'chords'] as const)('plays the same rhythm in the %s role and restarts after a pause', role => {
    const { mode, sink } = modeRig();
    mode.setRole(role);
    expect(mode.start(HOPSCOTCH.id)).toBe(true);
    const countSeconds = new Transport();
    countSeconds.bpm = HOPSCOTCH.bpm;
    const countIn = countSeconds.countInBeats(4) * countSeconds.beatSeconds;
    run(sink, countIn - 0.1);
    expect(sink.hits.length).toBeGreaterThan(0);
    const before = sink.hits.length;
    mode.pause();
    expect(vi.getTimerCount()).toBe(0);
    expect(sink.hits.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    run(sink, 1);
    expect(sink.hits).toHaveLength(before);
    const resumedAt = sink.now;
    mode.resume();
    run(sink, countIn);
    expect(sink.hits[before].at).toBeCloseTo(resumedAt + countIn);
    mode.exit();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['restart', 'song-list', 'selection', 'role', 'exit'] as const)('cancels the previous drums on %s', action => {
    const { mode, sink } = modeRig();
    expect(mode.start(HOPSCOTCH.id)).toBe(true);
    run(sink, 4 * 60 / HOPSCOTCH.bpm - 0.1);
    const previous = sink.hits.slice();
    expect(previous.length).toBeGreaterThan(0);
    if (action === 'restart') mode.restart();
    else if (action === 'song-list') mode.newGame();
    else if (action === 'selection') mode.start('first-light');
    else if (action === 'role') mode.setRole('chords');
    else mode.exit();
    expect(previous.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    expect(sink.tracks[0].cancel).toHaveBeenCalledOnce();
    if (action !== 'restart') expect(vi.getTimerCount()).toBe(0);
    mode.exit();
  });

  it('finishes a full performance with exactly the authored drums and no looping tail', () => {
    const { mode, sink } = modeRig();
    mode.start(HOPSCOTCH.id);
    run(sink, (lastBeat(HOPSCOTCH) + 8) * 60 / HOPSCOTCH.bpm + 0.1);
    expect(sink.hits).toHaveLength(rhythmEvents(HOPSCOTCH.rhythm).length);
    expect(vi.getTimerCount()).toBe(0);
    mode.step(0.01);
    expect(mode.phase).toBe('finished');
    expect(vi.getTimerCount()).toBe(0);
    mode.exit();
  });

  it('stops its drum timer when the audio clock is lost during a run', () => {
    const { mode, sink } = modeRig();
    mode.start(HOPSCOTCH.id);
    mode.step(0.01);
    run(sink, 4 * 60 / HOPSCOTCH.bpm - 0.1);
    sink.running = false;
    mode.step(0.01);
    expect(mode.phase).toBe('finished');
    expect(sink.hits.every(h => h.cancel.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    mode.exit();
  });
});