import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordBed } from '../src/audio/bed';
import { writtenNoteEvent } from '../src/audio/written';
import { compileCatalog } from '../src/content/export';
import { lastBeat, soundingEndBeat, validate, type Tune } from '../src/modes/playtune/chart';
import { CHORDS_ROLE, MELODY_ROLE, type TuneRole } from '../src/modes/playtune/role';

const fixture = (): Tune => ({
  id: 'performance-fixture', title: 'Performance fixture', composer: 'Test', origin: 'original',
  difficulty: 1, teaches: '', bpm: 120, beatsPerBar: 4, root: 60, scaleId: 'ionian', pass: .55,
  accompaniment: 'broken', voiceId: 'felt-piano', bedVoiceId: 'bed-felt-piano',
  melody: [{ beat: 0, len: 1, note: 72, gain: .08, attack: .01, soundingLen: 1.2 }],
  chords: [{ beat: 0, len: 4, degree: 0, quality: 'maj' }],
  backingNotes: [
    { beat: 0, len: 1, note: 36, gain: .025, attack: .01, soundingLen: 2 },
    { beat: .5, len: .5, note: 36, gain: .04, soundingLen: .7 },
    { beat: 3, len: 1, note: 48, gain: .02, soundingLen: 3 },
  ],
});
const courses = (tune: Tune): TuneRole[] => [
  { ...MELODY_ROLE, tunes: [tune], order: [tune.id] },
  { ...CHORDS_ROLE, tunes: [tune], order: [tune.id], chart: () => [{ beat: 0, len: 4, note: 48 }] },
];
afterEach(() => vi.useRealTimers());

describe('independent authored performances', () => {
  it('plays exact automatic accompaniment with independent repeated-pitch tails and no generic wash', () => {
    const tune = fixture();
    expect(validate(tune)).toEqual([]);
    expect(MELODY_ROLE.backing(tune)).toEqual({ chords: [], pattern: 'sustain', parts: [], notes: tune.backingNotes });
    expect(CHORDS_ROLE.backing(tune)).toEqual({ chords: [], pattern: 'sustain', parts: [], notes: tune.melody });
    expect(MELODY_ROLE.chart(tune)).toBe(tune.melody);
    expect(lastBeat(tune)).toBe(4);
    expect(soundingEndBeat(tune)).toBe(6);
    expect(tune.melody[0].len).toBe(1);
  });

  it('preserves musical expression in browser scheduling and existing v1 events while stripping it from player targets', () => {
    const tune = fixture();
    const [melody, backing] = compileCatalog(undefined, courses(tune)).entries;
    expect(melody.playerNotes).toEqual([{ beat: 0, len: 1, note: 72 }]);
    expect(melody.backingEvents.map(e => e.part)).toEqual(['chord', 'chord', 'chord']);
    expect(backing.playerNotes).toEqual([{ beat: 0, len: 4, note: 48 }]);
    expect(backing.backingEvents).toEqual([{ beat: 0, len: 1.2, notes: [72], gain: .08, attack: .01, part: 'melody' }]);
    vi.useFakeTimers();
    const pad = vi.fn();
    const engine = { running: true, now: 0, bedVoice: 'bed-felt-piano', pad, setBedAudible: vi.fn() };
    const clock = { running: true, beatSeconds: .5, beatsPerBar: 4, timeOf: (b: number) => b * .5 };
    const bed = new ChordBed(engine as never, { bpm: 120, bus: { on: vi.fn() } } as never);
    bed.setTrack([], clock);
    bed.setNoteTrack(tune.backingNotes!, clock);
    bed.start();
    vi.advanceTimersByTime(40);
    engine.now = .25; vi.advanceTimersByTime(40);
    engine.now = 1.5; vi.advanceTimersByTime(40);
    expect(pad.mock.calls.map(([notes, len, gain, at, attack, written]) => ({
      beat: at / .5, len: len / .5, notes, gain, attack: attack / .5, part: 'chord', written,
    }))).toEqual(melody.backingEvents.map(e => ({ ...e, written: true })));
    bed.stop();
  });

  it.each([
    { gain: NaN }, { gain: 1.1 }, { gain: -1 }, { attack: Infinity }, { attack: -1 },
    { attack: 3 }, { soundingLen: 0 }, { soundingLen: Infinity }, { soundingLen: 1025 },
  ])('rejects malformed automatic annotations: %j', patch => {
    const tune = fixture();
    Object.assign(tune.backingNotes![0], patch);
    expect(validate(tune).length).toBeGreaterThan(0);
    expect(() => compileCatalog(undefined, courses(tune))).toThrow();
  });

  it('retains explicit silence and zero gain, and defaults old unannotated notes consistently', () => {
    const tune = fixture();
    tune.backingNotes = [];
    expect(MELODY_ROLE.backing(tune).notes).toEqual([]);
    expect(MELODY_ROLE.backing(tune).chords).toEqual([]);
    expect(writtenNoteEvent({ note: 60, len: 1, gain: 0, attack: 0 })).toMatchObject({ gain: 0, attack: 0 });
    expect(writtenNoteEvent({ note: 60, len: 1 })).toMatchObject({ gain: .05, attack: .02, len: 1 });
  });
});
