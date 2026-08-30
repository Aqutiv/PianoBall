import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_TUNES, TUNE_ORDER, findTune } from '../src/modes/playtune/library';
import { CHORD_CURVE, CHORD_ORDER } from '../src/modes/playtune/library/chordcurve';
import { STUDIES } from '../src/modes/playtune/library/studies';
import type { Tune } from '../src/modes/playtune/chart';
import { fitToRange, fitted, harmonyProblems, noteRange, validate } from '../src/modes/playtune/chart';
import {
  MAX_CHORD_VOICES, chordChart, chordProblems, mergedChords, voicingFor,
  type ChordRole,
} from '../src/modes/playtune/chords';
import { CHORDS_ROLE, MELODY_ROLE, ROLES } from '../src/modes/playtune/role';
import { Judge, WINDOWS, type TargetSpec } from '../src/modes/playtune/judge';
import { Transport } from '../src/modes/playtune/transport';
import { DEFAULT_PLAYTUNE } from '../src/modes/playtune/settings';
import { CHORD_STORE, MELODY_STORE, loadProgress, recordRun, resetProgress } from '../src/modes/playtune/progress';
import { compEvents } from '../src/audio/comp';
import { COMP_PATTERNS } from '../src/audio/comp';
import { SCALES, chordNotes, degreeToNote } from '../src/audio/music';
import { BED_VOICES } from '../src/audio/voices';

/** Distinct beats a chart strikes on, in seconds, in order. */
function onsets(tune: Tune, role: ChordRole): number[] {
  const beat = 60 / tune.bpm;
  return [...new Set(chordChart(tune, role).map((n) => n.beat))]
    .sort((a, b) => a - b)
    .map((b) => b * beat);
}

/** A run that plays every note correctly at the worst timing still called good. */
function playedWell(tune: Tune, role: ChordRole): Judge {
  const t = new Transport();
  t.bpm = tune.bpm;
  t.beatsPerBar = tune.beatsPerBar;
  t.start(0, 0);
  const specs: TargetSpec[] = fitted(chordChart(tune, role), 0).map((n) => ({
    note: n.note, beat: n.beat, len: n.len,
    time: t.timeOf(n.beat), end: t.timeOf(n.beat + n.len),
  }));
  const judge = new Judge(specs);
  const late = WINDOWS.good * 0.999;
  // Pressed and never let go, exactly as the melody chain's own version does:
  // `finish` settles a key still down at the end as having held its whole tail,
  // and re-striking a pitch settles the one before it the same way. Releasing
  // in a second pass would settle by pitch in the wrong order and understate
  // every hold.
  for (const target of judge.targets) judge.press(target.note, target.time + late);
  return judge;
}

/** Storage is a browser thing; the progress stores need somewhere to live. */
class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('the chord curve', () => {
  it('has no chart problems', () => {
    for (const { tune, role } of CHORD_CURVE) {
      const problems = chordProblems(tune, role);
      expect(problems, `${tune.id}: ${problems.join('; ')}`).toEqual([]);
    }
  });

  it('holds the chord studies to the same standard as the library', () => {
    // They are not in `LIBRARY`, so the melody suite never sees them.
    for (const tune of ALL_TUNES) {
      expect(validate(tune), `${tune.id}: ${validate(tune).join('; ')}`).toEqual([]);
      expect(harmonyProblems(tune), tune.id).toEqual([]);
    }
  });

  it('gives every entry a unique id that resolves', () => {
    expect(new Set(CHORD_ORDER).size).toBe(CHORD_ORDER.length);
    for (const id of CHORD_ORDER) expect(findTune(id), id).toBeDefined();
  });

  it('never gets easier as it goes on', () => {
    for (let i = 1; i < CHORD_CURVE.length; i++) {
      expect(CHORD_CURVE[i].role.difficulty, CHORD_CURVE[i].tune.id)
        .toBeGreaterThanOrEqual(CHORD_CURVE[i - 1].role.difficulty);
    }
  });

  it('keeps the studies out of the melody chain', () => {
    for (const study of STUDIES) {
      expect(TUNE_ORDER, study.id).not.toContain(study.id);
      expect(CHORD_ORDER, study.id).toContain(study.id);
    }
  });

  it('asks no human to arpeggiate', () => {
    // `broken` and `arpeggio` roll a chord one tone at a time in a fixed order.
    // That is a single-note line derived from a chord, which is the melody role
    // wearing a hat — and `chordProblems` rejects it, so this is really a check
    // that the five tunes written that way named something else.
    for (const { tune, role } of CHORD_CURVE) {
      expect(role.pattern, tune.id).not.toBe('broken');
      expect(role.pattern, tune.id).not.toBe('arpeggio');
    }
  });
});

describe('turning a chord track into keys', () => {
  it('never asks for more than four notes at once', () => {
    for (const { tune, role } of CHORD_CURVE) {
      const perBeat = new Map<number, number>();
      for (const n of chordChart(tune, role)) perBeat.set(n.beat, (perBeat.get(n.beat) ?? 0) + 1);
      for (const [beat, count] of perBeat) {
        expect(count, `${tune.id} at beat ${beat}`).toBeLessThanOrEqual(MAX_CHORD_VOICES);
      }
    }
  });

  it('plays the chords that were authored', () => {
    // The test that catches a voicing bug turning G maj7 into G6: the pitch
    // classes under the hand must be the chord's own, no more and no fewer.
    for (const { tune, role } of CHORD_CURVE) {
      const scale = SCALES[tune.scaleId];
      const chart = chordChart(tune, role);
      for (const c of mergedChords(tune.chords)) {
        const root = degreeToNote(c.degree, tune.root, scale);
        const want = new Set(voicingFor(root, c.quality, role.voicing ?? 'full', 0)
          .map((n) => ((n % 12) + 12) % 12));
        const got = new Set(chart
          .filter((n) => n.beat >= c.beat && n.beat < c.beat + c.len)
          .map((n) => ((n.note % 12) + 12) % 12));
        expect([...got].sort(), `${tune.id} at beat ${c.beat}`).toEqual([...want].sort());
      }
    }
  });

  it('is the same chart every time it is asked for', () => {
    // The invariant that says "root position, not `voiceLead`". A chart derived
    // from the chord before it would depend on where the run started, and the
    // octave fit would move with it.
    for (const { tune, role } of CHORD_CURVE) {
      expect(chordChart(tune, role), tune.id).toEqual(chordChart(tune, role));
    }
  });

  it('runs a repeated chord together instead of asking for it twice', () => {
    // Greensleeves writes its pickup and its bar as two entries, and Amazing
    // Grace repeats a chord outright. Un-merged those read as a chord change
    // where nothing has changed.
    const merged = mergedChords([
      { beat: 0, len: 1, degree: 0, quality: 'min' },
      { beat: 1, len: 3, degree: 0, quality: 'min' },
      { beat: 4, len: 3, degree: 2, quality: 'maj' },
    ]);
    expect(merged).toEqual([
      { beat: 0, len: 4, degree: 0, quality: 'min' },
      { beat: 4, len: 3, degree: 2, quality: 'maj' },
    ]);
  });

  it('drops the fifth and nothing else from a shell seventh', () => {
    const full = chordNotes(62, 'min7');
    expect(voicingFor(62, 'min7', 'full', 62)).toEqual(full);
    expect(voicingFor(62, 'min7', 'shell', 62)).toEqual([full[0], full[1], full[3]]);
    // A triad has no fifth worth dropping: two notes is not a chord.
    expect(voicingFor(62, 'min', 'shell', 62)).toEqual(chordNotes(62, 'min'));
  });

  it('sits below the tune the game is playing', () => {
    // Both parts are on the keyboard at once. If the chords reached up into the
    // melody's octave the player could not tell which sound was theirs.
    for (const { tune, role } of CHORD_CURVE) {
      const chords = noteRange(chordChart(tune, role));
      const melody = noteRange(tune.melody);
      expect(chords.low, tune.id).toBeLessThan(melody.low);
    }
  });

  it('stays inside two octaves', () => {
    for (const { tune, role } of CHORD_CURVE) {
      const r = noteRange(chordChart(tune, role));
      expect(r.high - r.low, tune.id).toBeLessThanOrEqual(24);
    }
  });

  it('fits a 49- and 61-key range', () => {
    for (const [name, low, high] of [['49 keys', 36, 84], ['61 keys', 36, 96]] as const) {
      for (const { tune, role } of CHORD_CURVE) {
        const chart = chordChart(tune, role);
        const shift = fitToRange(chart, low, high);
        expect(shift, `${tune.id} on ${name}`).not.toBeNull();
        for (const n of fitted(chart, shift!)) {
          expect(n.note, `${tune.id} on ${name}`).toBeGreaterThanOrEqual(low);
          expect(n.note, `${tune.id} on ${name}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });
});

describe('the chord curve as a curve', () => {
  it('never strikes closer than the judge calls being in time', () => {
    // The same floor the melody chain keeps: notes closer together than the
    // good window ask for a press finer than the judge will ever reward.
    const floor = 2 * WINDOWS.good;
    for (const { tune, role } of CHORD_CURVE) {
      const at = onsets(tune, role);
      for (let i = 1; i < at.length; i++) {
        expect(at[i] - at[i - 1], `${tune.id} at ${at[i].toFixed(2)}s`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('opens slowly', () => {
    // A floor on the first three rather than a monotone curve over all
    // seventeen: the curve deliberately climbs two ladders that cross, and
    // asserting one number always rises would forbid that.
    for (const { tune, role } of CHORD_CURVE.slice(0, 3)) {
      const at = onsets(tune, role);
      let worst = Infinity;
      for (let i = 1; i < at.length; i++) worst = Math.min(worst, at[i] - at[i - 1]);
      expect(worst, tune.id).toBeGreaterThanOrEqual(1.4);
    }
  });

  it('never draws more than the eye can take', () => {
    // A chord is several auras but one decision, so this counts both: the
    // onsets are the reading load and the notes are the picture.
    const t = new Transport();
    for (const { tune, role } of CHORD_CURVE) {
      t.bpm = tune.bpm;
      const lead = t.approachSeconds(DEFAULT_PLAYTUNE.leadBeats);
      const chart = chordChart(tune, role);
      const at = onsets(tune, role);
      const beat = 60 / tune.bpm;
      for (const start of at) {
        const shown = at.filter((o) => o >= start && o < start + lead);
        expect(shown.length, `${tune.id} onsets from ${start.toFixed(2)}s`).toBeLessThanOrEqual(8);
        const notes = chart.filter((n) => n.beat * beat >= start && n.beat * beat < start + lead);
        expect(notes.length, `${tune.id} auras from ${start.toFixed(2)}s`).toBeLessThanOrEqual(16);
      }
    }
  });

  it('clears every pass mark for a run that is right but never perfect', () => {
    // The pass marks cannot be copied from the melody chain: a chord is several
    // targets on one beat, so the accuracy arithmetic is not the same one.
    for (const { tune, role } of CHORD_CURVE) {
      const judge = playedWell(tune, role);
      judge.finish();
      expect(judge.tally.good, tune.id).toBe(judge.total);
      expect(judge.tally.miss + judge.tally.wrong, tune.id).toBe(0);
      expect(judge.accuracy, `${tune.id} needs ${role.pass}`).toBeGreaterThan(role.pass);
    }
  });

  it('keeps the game playing something under the whole part', () => {
    for (const { tune, role } of CHORD_CURVE) {
      const chart = chordChart(tune, role);
      const chartEnd = chart.reduce((e, n) => Math.max(e, n.beat + n.len), 0);
      const melodyEnd = tune.melody.reduce((e, n) => Math.max(e, n.beat + n.len), 0);
      expect(chartEnd, tune.id).toBeGreaterThanOrEqual(melodyEnd - tune.beatsPerBar);
      expect(chartEnd, tune.id).toBeLessThanOrEqual(melodyEnd + tune.beatsPerBar);
    }
  });
});

describe('the two roles', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });

  it('gives each role its own chart, backing and curve', () => {
    const tune = findTune('twinkle')!;
    expect(MELODY_ROLE.chart(tune)).toEqual(tune.melody);
    expect(CHORDS_ROLE.chart(tune)).not.toEqual(tune.melody);
    // The game plays whichever half the player does not.
    expect(MELODY_ROLE.backing(tune).notes).toBeNull();
    expect(CHORDS_ROLE.backing(tune).notes).toEqual(tune.melody);
    expect(MELODY_ROLE.backing(tune).parts).toContain('chord');
    expect(CHORDS_ROLE.backing(tune).parts).toEqual(['bass']);
  });

  it('describes the part being played rather than the piece', () => {
    // Canon in D is the hardest melody in the game and one of the easiest
    // progressions there is, and the card has to say so.
    const canon = findTune('canon-in-d')!;
    expect(MELODY_ROLE.card(canon).difficulty).toBe(5);
    expect(CHORDS_ROLE.card(canon).difficulty).toBeLessThan(5);
    expect(CHORDS_ROLE.card(canon).teaches).not.toBe(canon.teaches);
  });

  it('voices the player as the bed, and the two parts apart', () => {
    for (const { tune } of CHORD_CURVE) {
      const v = CHORDS_ROLE.voices(tune);
      // The whole point of the role: a key is the backing layer, not a note.
      expect(v.keyVoicing, tune.id).toBe('bed');
      // Both halves come from the bed bank, so only the pairing tells them
      // apart. The same voice twice would be one indistinguishable wash.
      expect(BED_VOICES.map((b) => b.id), tune.id).toContain(v.keys);
      expect(BED_VOICES.map((b) => b.id), tune.id).toContain(v.backing);
      expect(v.keys, tune.id).not.toBe(v.backing);
    }
    // The melody role is unchanged: keys are an instrument there.
    expect(MELODY_ROLE.voices(findTune('twinkle')!).keyVoicing).toBe('lead');
  });

  it('never puts a plucked voice under the player', () => {
    // A harp is over within a second of being struck, held key or not, and this
    // role asks for chords to be held. `chordProblems` already refuses one; this
    // says so where the reason is readable.
    for (const { tune } of CHORD_CURVE) {
      const id = CHORDS_ROLE.voices(tune).keys;
      expect(BED_VOICES.find((b) => b.id === id)?.spec.pluck, `${tune.id} on ${id}`)
        .toBeUndefined();
    }
  });

  it('refuses a role that is not one of the two', async () => {
    // `load` checks the shape of what came out of storage and nothing about
    // what the values mean, so a stale or hand-edited settings blob can hold
    // any string. Unnormalised it reaches `ROLES[...]` as undefined and throws
    // while PlayTune is being built — which stops the app starting when
    // PlayTune is the mode it is trying to resume.
    localStorage.setItem('pianoball.playtuneSettings', JSON.stringify({ role: 'harmonica' }));
    vi.resetModules();
    const { playTuneSettings: fresh } = await import('../src/modes/playtune/settings');
    expect(fresh().role).toBe('melody');
    expect(ROLES[fresh().role]).toBeDefined();
  });

  it('keeps the two chains of unlocks apart', () => {
    resetProgress(MELODY_STORE, TUNE_ORDER);
    const chords = resetProgress(CHORD_STORE, CHORD_ORDER);
    recordRun(CHORD_STORE, chords, CHORD_ORDER[0], CHORD_ORDER,
      { accuracy: 0.95, score: 1, grade: 'A', passed: true });

    expect(loadProgress(CHORD_STORE, CHORD_ORDER).unlocked).toHaveLength(2);
    expect(loadProgress(MELODY_STORE, TUNE_ORDER).unlocked).toEqual([TUNE_ORDER[0]]);
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
