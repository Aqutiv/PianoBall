import { describe, expect, it } from 'vitest';
import { chordChart, chordProblems, mergedChords } from '../src/modes/playtune/chords';
import { CHORD_CURVE, CHORD_ORDER, findChordEntry } from '../src/modes/playtune/library/chordcurve';
import { LIBRARY, ALL_TUNES, findTune } from '../src/modes/playtune/library';
import { fitToRange, lastBeat, validate, harmonyProblems } from '../src/modes/playtune/chart';
import { CHORDS_ROLE, MELODY_ROLE } from '../src/modes/playtune/role';
import { Judge, WINDOWS } from '../src/modes/playtune/judge';
import { compEvents, COMP_PATTERNS } from '../src/audio/comp';
import { chordNotes } from '../src/audio/music';

const notes = (id: string) => CHORDS_ROLE.chart(findTune(id)!);
const on = (id: string, beat: number) => notes(id).filter(n => n.beat === beat);

/** Real key order, including releases before a repeated pitch is struck again. */
function perform(id: string, options: { late?: number; release?: number; omit?: (note: number, beat: number) => boolean; wrong?: boolean } = {}) {
  const tune = findTune(id)!;
  const specs = notes(id).map(n => ({ ...n, time: n.beat * 60 / tune.bpm, end: (n.beat + n.len) * 60 / tune.bpm }));
  const judge = new Judge(specs);
  const late = options.late ?? 0;
  const events = specs.filter(n => !options.omit?.(n.note, n.beat)).flatMap(n => [
    { at: n.time + late, press: true, note: n.note },
    { at: Math.min(n.end, n.time + (n.end - n.time) * (options.release ?? 1)) + late, press: false, note: n.note },
  ]).sort((a, b) => a.at - b.at || Number(a.press) - Number(b.press));
  for (const e of events) {
    if (e.press) judge.press(e.note, e.at);
    else judge.release(e.note, e.at);
  }
  if (options.wrong) judge.press(127, specs[0].time + 0.01);
  judge.finish();
  return judge;
}

describe('Play Backing course', () => {
  it('contains the planned 24 tracks and retains all classics', () => {
    expect(CHORD_ORDER).toEqual(['frere-jacques', 'ode-to-joy', 'chord-ground', 'twinkle', 'chord-march', 'yankee-doodle', 'hopscotch',
      'drunken-sailor', 'canon-in-d', 'amazing-grace', 'scarborough-fair', 'la-bamba', 'le-temps-des-cerises', 'hava-nagila', 'gymnopedie', 'londonderry-air',
      'greensleeves', 'irish-washerwoman', 'can-can', 'blue-danube', 'fur-elise', 'minuet-in-g', 'jesu-joy', 'the-entertainer']);
    expect(LIBRARY).toHaveLength(24);
    for (const t of LIBRARY.filter(t => t.origin === 'classic')) expect(CHORD_ORDER).toContain(t.id);
    expect(LIBRARY.map(t => t.id)).toEqual(expect.arrayContaining(['first-light', 'two-hands', 'hopscotch']));
    expect(ALL_TUNES.map(t => t.id)).not.toContain('chord-three');
  });
  it('uses five ascending levels and the agreed pass marks', () => {
    const levels = CHORD_CURVE.map(e => e.role.difficulty);
    expect(levels).toEqual([...levels].sort());
    for (const { role } of CHORD_CURVE) expect(role.pass).toBe([0, .55, .60, .63, .67, .70][role.difficulty]);
  });
  it.each(CHORD_CURVE)('$tune.id is a valid, playable authored reduction', ({ tune, role }) => {
    expect(chordProblems(tune, role)).toEqual([]);
    expect(validate(tune)).toEqual([]);
    expect(harmonyProblems(tune)).toEqual([]);
    const chart = chordChart(tune, role);
    for (const [low, high] of [[48,72], [48,79], [36,84], [21,108]]) expect(fitToRange(chart, low, high)).not.toBeNull();
    expect(Math.max(...chart.map(n => n.beat + n.len))).toBeGreaterThanOrEqual(lastBeat(tune) - tune.beatsPerBar);
    const times = [...new Set(chart.map(n => n.beat * 60 / tune.bpm))];
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i-1]).toBeGreaterThanOrEqual(2 * WINDOWS.good - 1e-6);
    chart[0].note = 0;
    expect(chordChart(tune, role)[0].note).not.toBe(0);
  });
  it('rejects unreachable small ranges', () => expect(fitToRange(notes('canon-in-d'), 60, 64)).toBeNull());
  it('validates malformed charts instead of repairing or dropping notes', () => {
    const e = CHORD_CURVE[0];
    for (const bad of [
      [{ beat: NaN, len: 1, note: 48 }], [{ beat: 0, len: Infinity, note: 48 }],
      [{ beat: 0, len: 1, note: 48.5 }], [{ beat: 0, len: -1, note: 48 }],
      [{ beat: lastBeat(e.tune), len: 1, note: 48 }],
      [{ beat: 0, len: 2, note: 48 }, { beat: 1, len: 1, note: 48 }],
      [{ beat: 0, len: 1, note: 48 }, { beat: 0, len: 1, note: 48 }],
      [48, 52, 55, 59].map(note => ({ beat: 0, len: 1, note })),
      [48, 61].map(note => ({ beat: 0, len: 1, note })),
      [{ beat: 0, len: 1, note: 36 }, { beat: 1, len: 1, note: 73 }],
    ]) expect(chordProblems(e.tune, { ...e.role, notes: bad }).length).toBeGreaterThan(0);
    expect(chordProblems(e.tune, { ...e.role, keysVoiceId: 'missing' }).length).toBeGreaterThan(0);
    expect(chordProblems(e.tune, { ...e.role, pass: NaN }).length).toBeGreaterThan(0);
  });
});

describe('authored musical phrases', () => {
  it('opens with bass notes rather than full chords', () => {
    expect(notes('frere-jacques').slice(0, 2)).toEqual([{ beat: 0, len: 4, note: 48 }, { beat: 4, len: 4, note: 48 }]);
    expect(notes('chord-ground').slice(0, 2)).toEqual([{ beat: 0, len: 2, note: 48 }, { beat: 2, len: 2, note: 55 }]);
    expect(notes('ode-to-joy').map(n => n.beat)).toEqual(findTune('ode-to-joy')!.chords.map(c => c.beat));
  });
  it('lands on Frère Jacques’s final tonic after the dominant', () => {
    for (const beat of [30, 62]) expect(on('frere-jacques', beat)).toEqual([{ beat, len: 2, note: 48 }]);
  });
  it('retains the waltz bass inversions instead of changing the chord identity', () => {
    expect(on('blue-danube', 0)).toEqual([]);
    expect(on('blue-danube', 51)[0].note).toBe(54); // D/F#
    expect(on('blue-danube', 75)[0].note).toBe(52); // A7/E
    expect(findTune('blue-danube')!.chords.find(c => c.beat === 51)).toMatchObject({ degree: 0, quality: 'maj' });
  });
  it('alternates bass and chord answers in a march', () => {
    expect([0,1,2,3].map(b => on('chord-march', b).length)).toEqual([1,2,1,2]);
    expect(on('chord-march', 0)[0].note).toBe(48);
    expect(on('chord-march', 1).map(n => n.note)).toEqual([64,67]);
  });
  it('holds Gymnopedie’s written upper chord through beat three', () => {
    expect(on('gymnopedie', 0)).toEqual([{ beat: 0, len: .9, note: 55 }]);
    expect(on('gymnopedie', 1).map(n => n.note)).toEqual([59,62,66]);
    expect(on('gymnopedie', 1).every(n => n.len === 2)).toBe(true);
    expect(on('gymnopedie', 2)).toEqual([]);
  });
  it('anchors both compound groups after the Greensleeves pickup', () => {
    expect(on('greensleeves', 1)[0].note).toBe(57);
    expect(on('greensleeves', 4)[0].note).toBe(48);
    expect([1,2,3,4,5,6].map(b => on('greensleeves', b).length)).toEqual([1,1,1,1,1,1]);
  });
  it('leaves phrase rests in Fur Elise and breathing room in Londonderry Air', () => {
    expect(notes('fur-elise').filter(n => n.beat < 4 || (n.beat >= 13 && n.beat < 16))).toEqual([]);
    expect(on('fur-elise', 4).length).toBe(1);
    const cadence = findTune('londonderry-air')!.chords.at(-1)!.beat;
    expect(notes('londonderry-air').filter(n => n.beat >= cadence - 1 && n.beat < cadence)).toEqual([]);
  });
  it('keeps ragtime accompaniment steady beneath the melody pickup and ties', () => {
    expect([1,2,3,4].map(b => on('the-entertainer', b).length)).toEqual([1,3,1,3]);
    expect(on('the-entertainer', 1)[0].note).toBe(48);
    expect(on('the-entertainer', 3)[0].note).toBe(55);
  });
  it('keeps Bach’s tonic arpeggiation and the source D under Em7', () => {
    expect(on('jesu-joy', 51)[0].note).toBe(50);
    expect(findTune('jesu-joy')!.chords.find(c => c.beat === 51)).toMatchObject({ degree: 5, quality: 'min7' });
    for (const beat of [63, 66, 69]) expect(findTune('jesu-joy')!.chords.find(c => c.beat === beat)).toMatchObject({ degree: 0, quality: 'maj' });
    expect(notes('jesu-joy').filter(n => n.beat >= 63).every(n => [7, 11, 2].includes(n.note % 12))).toBe(true);
  });
  it('retains seventh color and a bass foundation in Hopscotch', () => {
    const seventh = findTune('hopscotch')!.chords.find(c => c.quality === 'min7')!;
    expect(on('hopscotch', seventh.beat).map(n => n.note)).toEqual([50]);

  });
});

describe('performance and ownership', () => {
  it.each(CHORD_CURVE)('$tune.id passes with accurate chronological key presses and releases', ({ tune, role }) => {
    const perfect = perform(tune.id);
    expect(perfect.accuracy).toBeCloseTo(1);
    const good = perform(tune.id, { late: WINDOWS.good * .99 });
    expect(good.tally.miss + good.tally.wrong).toBe(0);
    expect(good.accuracy).toBeGreaterThan(role.pass);
  });
  it('grades missing bass, incomplete chords, short holds, and wrong notes', () => {
    expect(perform('chord-march', { omit: (_n, b) => b % 2 === 0 }).accuracy).toBeLessThan(1);
    expect(perform('chord-march', { omit: n => n === 67 }).accuracy).toBeLessThan(1);
    expect(perform('hopscotch', { release: .1 }).accuracy).toBeLessThan(.8);
    expect(perform('gymnopedie', { release: .1 }).accuracy).toBeLessThan(1);
    expect(perform('frere-jacques', { wrong: true }).tally.wrong).toBe(1);
    expect(perform('frere-jacques', { omit: () => true }).accuracy).toBe(0);
  });
  it.each(CHORD_CURVE)('$tune.id leaves the entire accompaniment to the player', ({ tune }) => {
    expect(CHORDS_ROLE.backing(tune)).toEqual({ chords: [], pattern: 'sustain', parts: [], notes: tune.melody });
    expect(CHORDS_ROLE.voices(tune).keyVoicing).toBe(findChordEntry(tune.id)!.role.keyVoicing);
    expect(CHORDS_ROLE.voices(tune).keys).toBe(findChordEntry(tune.id)!.role.keysVoiceId);
    expect(CHORDS_ROLE.voices(tune).backing).toBe(findChordEntry(tune.id)!.role.melodyVoiceId);
    expect(MELODY_ROLE.chart(tune)).toEqual(tune.melody);
    expect(MELODY_ROLE.backing(tune)).toEqual({ chords: [], pattern: 'sustain', parts: [], notes: tune.backingNotes });

  });
  it('keeps the wire identity while presenting the musical role', () => {
    expect(CHORDS_ROLE.id).toBe('chords');
    expect(CHORDS_ROLE.title).toBe('Play Backing');
    expect(CHORDS_ROLE.label).toBe('Backing');
  });
  it('merges repeated harmony labels without changing their written data', () => {
    const chords = [{ beat: 0, len: 1, degree: 0, quality: 'min' as const }, { beat: 1, len: 3, degree: 0, quality: 'min' as const }];
    expect(mergedChords(chords)).toEqual([{ beat: 0, len: 4, degree: 0, quality: 'min' }]);
    expect(chords[0].len).toBe(1);
  });
});
describe('accompaniment parts', () => {
  it('tags every event as chord, bass or wash', () => {
    const voiced = chordNotes(60, 'maj');
    for (const pattern of COMP_PATTERNS) {
      const events = compEvents(pattern, voiced, 60, 4, 4, 0);
      expect(events.length, pattern).toBeGreaterThan(0);
      for (const ev of events) {
        expect(['chord', 'bass', 'wash'], `${pattern} ${JSON.stringify(ev.notes)}`).toContain(ev.part);
      }
      // Every pattern says the harmony and grounds it, whatever else it does.
      expect(events.some((e) => e.part === 'chord'), pattern).toBe(true);
      expect(events.some((e) => e.part === 'bass'), pattern).toBe(true);
    }
  });

  it('calls a block chord a chord and not a wash', () => {
    // `sustain` is what the chord role means by a block chord, so its one long
    // swell has to be the part the player is handed.
    const events = compEvents('sustain', chordNotes(60, 'maj'), 60, 4, 4, 0);
    const chord = events.filter((e) => e.part === 'chord');
    expect(chord).toHaveLength(1);
    expect(chord[0].notes).toEqual(chordNotes(60, 'maj'));
    expect(chord[0].offset).toBe(0);
  });

  it('puts only the root in the bass', () => {
    for (const pattern of COMP_PATTERNS) {
      for (const ev of compEvents(pattern, chordNotes(60, 'maj'), 60, 4, 4, 0)) {
        if (ev.part !== 'bass') continue;
        expect(ev.notes, pattern).toEqual([48]);
      }
    }
  });
});
