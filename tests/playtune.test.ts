import { describe, expect, it } from 'vitest';
import { LIBRARY, TUNE_ORDER, findTune } from '../src/modes/playtune/library';
import { FUR_ELISE } from '../src/modes/playtune/library/classics';
import type { Tune } from '../src/modes/playtune/chart';
import {
  fitToRange, fitted, harmonyProblems, lastBeat, noteRange,
  slowestChordChange, validate,
} from '../src/modes/playtune/chart';
import {
  HOLD_FLOOR, HOLD_GRACE, Judge, WINDOWS, WORTH, grade, type TargetSpec,
} from '../src/modes/playtune/judge';
import { noteShape } from '../src/modes/playtune/render';
import { APPROACH_BPM_CAP, Transport } from '../src/modes/playtune/transport';
import { DEFAULT_PLAYTUNE, LEAD_BEAT_CHOICES } from '../src/modes/playtune/settings';
import { loadProgress, recordRun, resetProgress, unlockedBy } from '../src/modes/playtune/progress';
import { SCALES, degreeToNote, inScale } from '../src/audio/music';
import {
  BED_VOICES, DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE, LEAD_VOICES,
} from '../src/audio/voices';

/**
 * A run of `tune` that hits every note on the worst timing still called good.
 *
 * `release: true` lets go of each key the instant it goes down, which is what
 * playing a melody detached does to a note long enough to be hold-judged.
 */
function playedWell(tune: Tune, opts: { release?: boolean } = {}): Judge {
  const t = new Transport();
  t.bpm = tune.bpm;
  t.beatsPerBar = tune.beatsPerBar;
  t.start(0, 0);
  const specs: TargetSpec[] = fitted(tune.melody, 0).map((n) => ({
    note: n.note, beat: n.beat, len: n.len,
    time: t.timeOf(n.beat), end: t.timeOf(n.beat + n.len),
  }));
  const judge = new Judge(specs);
  const late = WINDOWS.good * 0.999;
  for (const target of judge.targets) {
    judge.press(target.note, target.time + late);
    if (opts.release) judge.release(target.note, target.time + late);
  }
  return judge;
}

describe('the tune library', () => {
  it('has no chart problems', () => {
    for (const tune of LIBRARY) {
      expect(validate(tune), `${tune.id}: ${validate(tune).join('; ')}`).toEqual([]);
    }
  });

  it('gives every tune a unique id and an entry in the order', () => {
    const ids = new Set(LIBRARY.map((t) => t.id));
    expect(ids.size).toBe(LIBRARY.length);
    expect(TUNE_ORDER).toHaveLength(LIBRARY.length);
    for (const id of TUNE_ORDER) expect(findTune(id)).toBeDefined();
  });

  it('never gets easier as it goes on', () => {
    for (let i = 1; i < LIBRARY.length; i++) {
      expect(LIBRARY[i].difficulty).toBeGreaterThanOrEqual(LIBRARY[i - 1].difficulty);
    }
  });

  it('never asks for two notes closer than the judge calls being in time', () => {
    // The difficulty field says a tune is harder; it does not make it so, and
    // the two came apart. Greensleeves wrote its dotted figure as 1.5 and 0.5
    // beats in a six-eight whose beat is already the eighth, which put two
    // onsets 179ms apart in the seventh tune of the chain — tighter than
    // anything in the Canon or the Bach, at difficulty 3.
    //
    // The floor is the good window's own width, because that is the game's
    // statement of what counts as in time: notes closer together than that ask
    // the player to place a press finer than the judge will ever reward them
    // for. Minuet in G sits 7ms above it, which is the real edge of the
    // library — a tune that wants to be quicker than that needs a slower bpm
    // and more beats, not shorter note values.
    const floor = 2 * WINDOWS.good;
    for (const tune of LIBRARY) {
      const beatSeconds = 60 / tune.bpm;
      // By onset, not by note: a chord is several notes on one beat, and the
      // gap that matters is the one to the next thing the player has to move to.
      const onsets = [...new Set(tune.melody.map((n) => n.beat))].sort((a, b) => a - b);
      for (let i = 1; i < onsets.length; i++) {
        const gap = (onsets[i] - onsets[i - 1]) * beatSeconds;
        expect(gap, `${tune.id} at beat ${onsets[i]}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it('never puts more notes on screen at once than the busiest chart already did', () => {
    // More approach on a quick tune means more notes in the air at once; the
    // two trade directly, and this is the side of the trade that has no other
    // guard. Eight is not a taste judgement — it is Canon in D's own worst
    // screen at 100 bpm, the busiest picture the library shipped before the
    // approach floor existed. A future tune, or a lower APPROACH_BPM_CAP, that
    // draws more than the hardest chart in the game fails here: at a cap of
    // 100, Minuet in G reaches ten.
    const t = new Transport();
    for (const tune of LIBRARY) {
      t.bpm = tune.bpm;
      const lead = t.approachSeconds(DEFAULT_PLAYTUNE.leadBeats);
      const onsets = [...new Set(tune.melody.map((n) => n.beat))]
        .sort((a, b) => a - b)
        .map((b) => b * t.beatSeconds);
      for (const start of onsets) {
        const shown = onsets.filter((o) => o >= start && o < start + lead).length;
        expect(shown, `${tune.id} from ${start.toFixed(2)}s`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('clears every pass mark for a run that is right but never perfect', () => {
    // What a player who has learned the melody does: every note, correct key,
    // held for its length, landing at the edge of the good window rather than
    // dead centre. Strictly above the mark, not equal to it: good was 0.75 and
    // Canon in D and Jesu, Joy ask for exactly 0.75, so a competent run passed
    // those two on the last bit of a float rather than on merit.
    //
    // Timed just inside WINDOWS.good, the worst press still called good, so
    // this is the floor of a competent run and not a fair sample of one. Just
    // inside rather than exactly on it: `time + WINDOWS.good` lands a float's
    // breadth outside for some onsets and is judged ok, which would be testing
    // arithmetic rather than the mode.
    for (const tune of LIBRARY) {
      const judge = playedWell(tune);
      judge.finish();

      expect(judge.tally.good, tune.id).toBe(judge.total);
      expect(judge.tally.perfect + judge.tally.ok + judge.tally.miss, tune.id).toBe(0);
      expect(judge.accuracy, `${tune.id} needs ${tune.pass}`).toBeGreaterThan(tune.pass);
    }
  });

  it('does not fail Greensleeves for playing it correctly but detached', () => {
    // The run this came from: every key right, nothing missed, 71%. Ten of the
    // tune's thirty-seven notes are longer than a beat, so letting go of each
    // as the next arrived took them all to the hold floor, and 0.75 of that
    // was 68.9% against a 70% mark. Playing detached is a style, not an error,
    // and Greensleeves is not a tune about holding — unlike Drift, which is,
    // and which should still fail a run that holds nothing.
    const tune = findTune('greensleeves')!;
    const judge = playedWell(tune, { release: true });
    judge.finish();

    expect(judge.tally.good).toBe(judge.total);
    // Not zero: a tail is credited from where the note was due, so letting go
    // straight after a late press still banks the time spent being late.
    expect(judge.holdAccuracy).toBeLessThan(0.2);
    expect(judge.accuracy).toBeGreaterThan(tune.pass);
  });

  it('resolves every chord degree inside its own scale', () => {
    for (const tune of LIBRARY) {
      const scale = SCALES[tune.scaleId];
      for (const c of tune.chords) {
        const root = degreeToNote(c.degree, tune.root, scale);
        expect(inScale(root, tune.root, scale), `${tune.id} degree ${c.degree}`).toBe(true);
      }
    }
  });

  it('plays no chord tone the tune has not accounted for', () => {
    // The root being in the scale says nothing about the third and the seventh
    // that come with it, which is how a B major triad once ended up under a
    // tune in D minor. Deliberate borrowing is fine, and has to be declared.
    for (const tune of LIBRARY) {
      expect(harmonyProblems(tune), tune.id).toEqual([]);
    }
  });

  it('never lets the harmony stand still for longer than it takes to notice', () => {
    for (const tune of LIBRARY) {
      // Four beats, or the bar, whichever is shorter: a bar of six or nine held
      // on one chord is a drone rather than an accompaniment.
      const most = Math.min(tune.beatsPerBar, 4);
      expect(slowestChordChange(tune), tune.id).toBeLessThanOrEqual(most);
    }
  });

  it('gives every tune an accompaniment and a sane pickup', () => {
    for (const tune of LIBRARY) {
      expect(tune.accompaniment, tune.id).toBeTruthy();
      const pickup = tune.pickup ?? 0;
      expect(pickup, tune.id).toBeGreaterThanOrEqual(0);
      expect(pickup, tune.id).toBeLessThan(tune.beatsPerBar);
      // A pickup only means anything if the tune really does start off the bar.
      if (pickup) expect(tune.melody[0].beat, tune.id).toBe(0);
    }
  });

  it('bars the two runs in Für Elise the same way', () => {
    // The tune plays one six-note figure twice, and used to bar it two
    // different ways. The upbeat it opens on was never declared, and the A the
    // opening run lands on was struck twice — once to end the run and again to
    // hold it — which padded the missing beat back and left the opening run
    // sitting a beat off the bar line the closing one sits on. The broken chord
    // then put its bass under a different note of the figure each time, which
    // is what a listener hears as the tune being out.
    const run = [76, 75, 76, 71, 74, 72];       // E5 D sharp 5 E5 B4 D5 C5
    const at = FUR_ELISE.melody
      .map((_, i) => i)
      .filter((i) => run.every((note, k) => FUR_ELISE.melody[i + k]?.note === note));
    expect(at).toHaveLength(2);
    for (const i of at) {
      const start = FUR_ELISE.melody[i];
      const bar = (start.beat - (FUR_ELISE.pickup ?? 0)) % FUR_ELISE.beatsPerBar;
      expect(bar, `run at beat ${start.beat}`).toBe(0);
      // And each run lands on one A, held, rather than on an A struck twice.
      const landing = FUR_ELISE.melody[i + run.length];
      expect(landing.note, `landing of the run at beat ${start.beat}`).toBe(69);
      expect(landing.len, `landing of the run at beat ${start.beat}`).toBe(3);
    }
  });

  it('names only instruments that are in the bank', () => {
    // `validate` already reports this and the first test would catch it, but a
    // typo in a voice id is a silent fault everywhere else in the app — the
    // lookups fall back to the default on purpose — so it gets said out loud.
    for (const tune of LIBRARY) {
      if (tune.voiceId !== undefined) {
        expect(LEAD_VOICES.map((v) => v.id), tune.id).toContain(tune.voiceId);
      }
      if (tune.bedVoiceId !== undefined) {
        expect(BED_VOICES.map((b) => b.id), tune.id).toContain(tune.bedVoiceId);
      }
    }
  });

  it('leaves the app its own sound on the tunes that name no instrument', () => {
    // The rule the library is written to: a tune sounds like something else
    // only when the piece itself names it. The two that name nothing are the
    // originals with no performance tradition to answer to, and they are what
    // stops the library reading as a costume box.
    const plain = LIBRARY.filter((t) => !t.voiceId && !t.bedVoiceId);
    expect(plain.map((t) => t.id)).toEqual(['first-light', 'two-hands']);
    expect(DEFAULT_LEAD_VOICE).toBe('signature');
    expect(DEFAULT_BED_VOICE).toBe('warm');
  });

  it('keeps the chord bed running under the whole melody', () => {
    for (const tune of LIBRARY) {
      const chordEnd = tune.chords.reduce((e, c) => Math.max(e, c.beat + c.len), 0);
      const melodyEnd = tune.melody.reduce((e, n) => Math.max(e, n.beat + n.len), 0);
      // Within a bar is close enough: the bed may stop on the final downbeat.
      expect(chordEnd, tune.id).toBeGreaterThanOrEqual(melodyEnd - tune.beatsPerBar);
      // And it must not outlast it either, or the run ends with the player
      // sitting through an outro they cannot play.
      expect(chordEnd, tune.id).toBeLessThanOrEqual(melodyEnd + tune.beatsPerBar);
    }
  });

  it('is long enough to be worth playing', () => {
    for (const tune of LIBRARY) {
      expect(lastBeat(tune), tune.id).toBeGreaterThanOrEqual(16);
      expect(tune.melody.length, tune.id).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('fitting a chart to a keyboard', () => {
  // The three keybed sizes the app claims to support.
  const KEYBOARDS: [string, number, number][] = [
    ['25 keys', 48, 72],
    ['49 keys', 36, 84],
    ['61 keys', 36, 96],
  ];

  it('places every tune inside a 49- and 61-key range', () => {
    for (const [name, low, high] of KEYBOARDS.slice(1)) {
      for (const tune of LIBRARY) {
        const shift = fitToRange(tune.melody, low, high);
        expect(shift, `${tune.id} on ${name}`).not.toBeNull();
        const moved = fitted(tune.melody, shift!);
        for (const n of moved) {
          expect(n.note, `${tune.id} on ${name}`).toBeGreaterThanOrEqual(low);
          expect(n.note, `${tune.id} on ${name}`).toBeLessThanOrEqual(high);
        }
      }
    }
  });

  it('reports honestly when a melody is wider than the keyboard', () => {
    const wide = LIBRARY.find((t) => {
      const r = noteRange(t.melody);
      return r.high - r.low > 24;
    });
    if (wide) expect(fitToRange(wide.melody, 60, 60 + 12)).toBeNull();
    // A tune that does fit still fits on the smallest board when narrow enough.
    const narrow = LIBRARY[0];
    expect(fitToRange(narrow.melody, 48, 72)).not.toBeNull();
  });

  it('only ever moves a chart by whole octaves', () => {
    for (const tune of LIBRARY) {
      const shift = fitToRange(tune.melody, 36, 96);
      expect(Math.abs(shift! % 12), tune.id).toBe(0);
    }
  });

  it('leaves the melody sorted after fitting', () => {
    for (const tune of LIBRARY) {
      const moved = fitted(tune.melody, 0);
      for (let i = 1; i < moved.length; i++) {
        expect(moved[i].beat, tune.id).toBeGreaterThanOrEqual(moved[i - 1].beat);
      }
    }
  });
});

describe('judging', () => {
  const specs: TargetSpec[] = [
    { note: 60, beat: 0, len: 1, time: 1, end: 2 },
    { note: 62, beat: 1, len: 1, time: 2, end: 3 },
    { note: 64, beat: 2, len: 1, time: 3, end: 4 },
  ];

  it('grades by how far from the note the press landed', () => {
    const j = new Judge(specs);
    expect(j.press(60, 1).verdict).toBe('perfect');
    expect(j.press(62, 2 + WINDOWS.perfect + 0.001).verdict).toBe('good');
    expect(j.press(64, 3 + WINDOWS.good + 0.001).verdict).toBe('ok');
  });

  it('treats early and late symmetrically', () => {
    const early = new Judge(specs);
    const late = new Judge(specs);
    const off = WINDOWS.perfect + 0.01;
    expect(early.press(60, 1 - off).verdict).toBe(late.press(60, 1 + off).verdict);
  });

  it('calls a press outside every window wrong, and earns nothing for it', () => {
    const j = new Judge(specs);
    const r = j.press(60, 1 + WINDOWS.ok + 0.01);
    expect(r.verdict).toBe('wrong');
    expect(r.target).toBeNull();
    expect(j.accuracy).toBe(0);
    expect(j.judged).toBe(0);
  });

  it('dilutes accuracy with wrong keys rather than subtracting for them', () => {
    const clean = new Judge(specs);
    for (const s of specs) clean.press(s.note, s.time);
    expect(clean.accuracy).toBe(1);

    const messy = new Judge(specs);
    for (const s of specs) messy.press(s.note, s.time);
    messy.press(71, 3);
    // Three notes earned, four presses accounted for.
    expect(messy.accuracy).toBeCloseTo(3 / 4, 9);
    messy.press(71, 3);
    expect(messy.accuracy).toBeCloseTo(3 / 5, 9);
  });

  it('never drives accuracy below zero, however much is mashed', () => {
    const j = new Judge(specs);
    for (let i = 0; i < 200; i++) j.press(71, 3);
    expect(j.accuracy).toBeGreaterThanOrEqual(0);
    expect(j.accuracy).toBeLessThan(0.02);
  });

  it('does not charge for presses made before the tune has started', () => {
    const j = new Judge(specs);
    // The count-in is exactly when a player finds the keys.
    j.press(71, specs[0].time - 1);
    j.press(65, specs[0].time - 0.5);
    // Including the last breath of it: half a hit window before the downbeat
    // is still the count-in, and is not where the rule should turn over.
    j.press(71, specs[0].time - 0.001);
    expect(j.tally.wrong).toBe(0);
    for (const s of specs) j.press(s.note, s.time);
    expect(j.accuracy).toBe(1);
  });

  it('starts charging for wrong keys from the first note onwards', () => {
    const j = new Judge(specs);
    j.press(71, specs[0].time);
    expect(j.tally.wrong).toBe(1);
  });

  it('prices a tail at the multiplier its own onset earned', () => {
    // A long note struck first, then shorter notes on top of it: by the time
    // the tail settles the combo has moved on, and the note must not be paid
    // at whatever it happens to be then.
    const mixed: TargetSpec[] = [
      { note: 60, beat: 0, len: 4, time: 1, end: 5 },
      { note: 62, beat: 1, len: 1, time: 2, end: 3 },
      { note: 64, beat: 2, len: 1, time: 3, end: 4 },
    ];
    const j = new Judge(mixed);
    const first = j.press(60, 1);
    expect(first.combo).toBe(1);
    j.press(62, 2);
    j.press(64, 3);
    expect(j.combo).toBe(3);

    const settled = j.release(60, 5);
    expect(settled).not.toBeNull();
    expect(settled!.combo, 'the combo it was struck on, not the one it ends on')
      .toBe(1);
  });

  it('holds that price when a wrong key breaks the combo under it', () => {
    const long: TargetSpec[] = [{ note: 60, beat: 0, len: 4, time: 1, end: 5 }];
    const j = new Judge(long);
    j.press(60, 1);
    j.press(71, 2);                       // a wrong key while the note is held
    expect(j.combo).toBe(0);
    expect(j.release(60, 5)!.combo).toBe(1);
  });

  it('breaks the combo on a wrong note', () => {
    const j = new Judge(specs);
    j.press(60, 1);
    expect(j.combo).toBe(1);
    j.press(71, 1);
    expect(j.combo).toBe(0);
    expect(j.bestCombo).toBe(1);
  });

  it('misses a note whose window has closed, once', () => {
    const j = new Judge(specs);
    expect(j.expire(1 + WINDOWS.ok + 0.001)).toHaveLength(1);
    expect(j.expire(1 + WINDOWS.ok + 0.002)).toHaveLength(0);
    expect(j.tally.miss).toBe(1);
  });

  it('never double-counts a note that was hit', () => {
    const j = new Judge(specs);
    j.press(60, 1);
    j.expire(10);
    expect(j.tally.miss).toBe(2);   // the two notes never pressed
    expect(j.tally.perfect).toBe(1);
    expect(j.judged).toBe(3);
    expect(j.done).toBe(true);
  });

  it('picks the nearest target when the same note repeats', () => {
    const repeated: TargetSpec[] = [
      { note: 60, beat: 0, len: 1, time: 1, end: 2 },
      { note: 60, beat: 1, len: 1, time: 1.3, end: 2.3 },
    ];
    const j = new Judge(repeated);
    // Slightly late for the second, which must not be read as early for a third.
    j.press(60, 1.32);
    expect(j.targets[1].state).toBe('hit');
    expect(j.targets[0].state).toBe('waiting');
  });

  it('judges simultaneous notes independently', () => {
    const chord: TargetSpec[] = [
      { note: 60, beat: 0, len: 1, time: 1, end: 2 },
      { note: 64, beat: 0, len: 1, time: 1, end: 2 },
    ];
    const j = new Judge(chord);
    j.press(60, 1);
    j.expire(2);
    expect(j.tally.perfect).toBe(1);
    expect(j.tally.miss).toBe(1);
    expect(j.accuracy).toBe(0.5);
  });

  it('weights accuracy by verdict', () => {
    const j = new Judge(specs);
    j.press(60, 1);                                   // perfect  -> 1
    j.press(62, 2 + WINDOWS.perfect + 0.001);         // good
    j.expire(10);                                     // miss     -> 0
    expect(j.accuracy).toBeCloseTo((WORTH.perfect + WORTH.good) / 3, 5);
  });

  it('hands out grades at the documented thresholds', () => {
    expect(grade(1)).toBe('S');
    expect(grade(0.98)).toBe('S');
    expect(grade(0.92)).toBe('A');
    expect(grade(0.84)).toBe('B');
    expect(grade(0.7)).toBe('C');
    expect(grade(0.699)).toBeNull();
  });
});

describe('judging how long a note is held', () => {
  /** One four-beat note at one second a beat, due at second 1. */
  const long: TargetSpec[] = [{ note: 60, beat: 0, len: 4, time: 1, end: 5 }];
  const tail = 5 - 1;

  function held(release: number | null): Judge {
    const j = new Judge(long);
    j.press(60, 1);
    if (release === null) j.settleHolds(Infinity);
    else j.release(60, release);
    return j;
  }

  it('pays a perfectly timed note in full only if it is held', () => {
    expect(held(5).accuracy).toBeCloseTo(1, 9);
    expect(held(null).accuracy).toBeCloseTo(1, 9);
  });

  it('pays the floor for a note dropped the instant it lands', () => {
    expect(held(1).accuracy).toBeCloseTo(HOLD_FLOOR, 9);
  });

  it('pays part way for a note held part way', () => {
    const half = held(1 + tail / 2).accuracy;
    expect(half).toBeGreaterThan(HOLD_FLOOR);
    expect(half).toBeLessThan(1);
  });

  it('counts a release inside the grace as the whole tail', () => {
    expect(held(1 + tail * (1 - HOLD_GRACE)).accuracy).toBeCloseTo(1, 9);
  });

  it('does not punish holding on past the end', () => {
    expect(held(20).accuracy).toBeCloseTo(1, 9);
  });

  it('leaves short notes out of it entirely', () => {
    const short: TargetSpec[] = [{ note: 60, beat: 0, len: 1, time: 1, end: 2 }];
    const j = new Judge(short);
    j.press(60, 1);
    j.release(60, 1);
    expect(j.accuracy).toBe(1);
    expect(j.holdAccuracy).toBeNull();
  });

  it('reports how much of the tails were held', () => {
    expect(held(5).holdAccuracy).toBeCloseTo(1, 9);
    expect(held(1).holdAccuracy).toBeCloseTo(0, 9);
  });

  it('keeps a held note on screen until its tail runs out', () => {
    const j = new Judge(long);
    j.press(60, 1);
    expect(j.sounding(2)).toHaveLength(1);
    expect(j.sounding(6)).toHaveLength(0);
    j.release(60, 3);
    expect(j.sounding(2)).toHaveLength(0);
  });

  it('resolves anything still down when the tune ends', () => {
    const j = new Judge(long);
    j.press(60, 1);
    j.finish();
    expect(j.accuracy).toBeCloseTo(1, 9);
    expect(j.done).toBe(true);
  });

  it('reads accuracy over what has settled while the run is going', () => {
    const two: TargetSpec[] = [
      { note: 60, beat: 0, len: 1, time: 1, end: 2 },
      { note: 62, beat: 4, len: 1, time: 5, end: 6 },
    ];
    const j = new Judge(two);
    expect(j.accuracySoFar).toBe(1);
    j.press(60, 1);
    // One note in, and it was perfect: the panel should say so rather than 50%.
    expect(j.accuracySoFar).toBe(1);
    expect(j.accuracy).toBe(0.5);
  });
});

describe('reading a note length as a shape', () => {
  it('names the plain values', () => {
    expect(noteShape(0.5)).toEqual({ kind: 'quaver', dotted: false });
    expect(noteShape(1)).toEqual({ kind: 'crotchet', dotted: false });
    expect(noteShape(2)).toEqual({ kind: 'minim', dotted: false });
    expect(noteShape(4)).toEqual({ kind: 'semibreve', dotted: false });
    expect(noteShape(8)).toEqual({ kind: 'semibreve', dotted: false });
  });

  it('names a dotted value after the note it is a dot on', () => {
    expect(noteShape(0.75)).toEqual({ kind: 'quaver', dotted: true });
    expect(noteShape(1.5)).toEqual({ kind: 'crotchet', dotted: true });
    expect(noteShape(3)).toEqual({ kind: 'minim', dotted: true });
    expect(noteShape(6)).toEqual({ kind: 'semibreve', dotted: true });
  });

  it('gives every length in the library a shape', () => {
    const seen = new Set<string>();
    for (const tune of LIBRARY) {
      for (const n of tune.melody) {
        const s = noteShape(n.len);
        expect(s.kind, `${tune.id} len ${n.len}`).toBeTruthy();
        seen.add(s.kind);
      }
    }
    // If the library stopped exercising a shape, the shape is decoration.
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe('the transport', () => {
  it('puts beat zero after the count-in', () => {
    const t = new Transport();
    t.bpm = 120;
    t.start(10, 4);
    expect(t.beatSeconds).toBe(0.5);
    expect(t.timeOf(0)).toBe(12);
    expect(t.beatAt(10)).toBe(-4);
    expect(t.beatAt(12)).toBe(0);
    expect(t.beatAt(13)).toBe(2);
  });

  it('round-trips a beat through time and back', () => {
    const t = new Transport();
    t.bpm = 137;
    t.start(3.25, 2);
    for (const beat of [0, 1, 7.5, 129]) {
      expect(t.beatAt(t.timeOf(beat))).toBeCloseTo(beat, 9);
    }
  });

  it('subtracts the calibration offset from a press', () => {
    const t = new Transport();
    t.offset = 0.03;
    expect(t.judgeTime(5)).toBeCloseTo(4.97, 9);
  });

  it('raising the offset corrects a player who lands late', () => {
    const t = new Transport();
    t.bpm = 120;
    t.start(0, 0);
    const due = t.timeOf(4);
    const late = due + 0.04;

    // Uncalibrated, a late press is judged late.
    expect(t.judgeTime(late) - due).toBeCloseTo(0.04, 9);

    // Raising the offset by exactly that much brings it back onto the beat,
    // and raising it further would overshoot into being early.
    t.offset = 0.04;
    expect(t.judgeTime(late) - due).toBeCloseTo(0, 9);
    t.offset = 0.08;
    expect(t.judgeTime(late) - due).toBeCloseTo(-0.04, 9);
  });

  it('lets tempo buy approach only down to the cap', () => {
    const t = new Transport();
    const at = (bpm: number) => { t.bpm = bpm; return t.approachSeconds(4); };

    // Below the cap the lead is exactly what four beats are worth.
    expect(at(60)).toBeCloseTo(4, 9);
    expect(at(100)).toBeCloseTo(2.4, 9);
    expect(at(APPROACH_BPM_CAP)).toBeCloseTo(2, 9);

    // Above it the beat stops shrinking, so the quick tunes stop being charged
    // the same four beats in less and less real time.
    expect(at(132)).toBeCloseTo(2, 9);
    expect(at(176)).toBeCloseTo(2, 9);
  });

  it('never gives a note less approach than its beats are worth', () => {
    // The floor may only ever add. If this fails, some tune got quicker to
    // read than it used to be, which is the opposite of the point.
    const t = new Transport();
    for (const bpm of [50, 60, 96, 132, 176, 200]) {
      t.bpm = bpm;
      for (const lead of LEAD_BEAT_CHOICES) {
        expect(t.approachSeconds(lead), `${bpm} bpm, ${lead} beats`)
          .toBeGreaterThanOrEqual(lead * t.beatSeconds - 1e-9);
      }
    }
  });

  it('keeps the setting worth changing at every tempo', () => {
    // A flat floor in seconds would collapse three, four and six beats onto one
    // value on a quick tune and quietly retire the control. This is the test
    // that rejects that design.
    const t = new Transport();
    for (const bpm of [60, 132, 176]) {
      t.bpm = bpm;
      const leads = LEAD_BEAT_CHOICES.map((b) => t.approachSeconds(b));
      for (let i = 1; i < leads.length; i++) {
        expect(leads[i], `${bpm} bpm`).toBeGreaterThan(leads[i - 1]);
      }
    }
  });

  it('copes with a lead that was persisted out of range', () => {
    // setPlayTuneSettings does not clamp, so an old build's value reaches here.
    const t = new Transport();
    t.bpm = 176;
    const [low] = LEAD_BEAT_CHOICES;
    const high = LEAD_BEAT_CHOICES[LEAD_BEAT_CHOICES.length - 1];
    expect(t.approachSeconds(0)).toBe(t.approachSeconds(low));
    expect(t.approachSeconds(-4)).toBe(t.approachSeconds(low));
    expect(t.approachSeconds(999)).toBe(t.approachSeconds(high));
  });

  it('counts in for at least as long as the lane takes to fall', () => {
    // The judge and the auras are built by start(), so a count-in shorter than
    // the approach puts the first aura on screen already partway down — making
    // the opening note the one note that gets less warning than was asked for.
    // A one-bar count-in was three beats against a lead of four on every tune
    // in three, so this was already true of Gymnopedie by a full second before
    // the approach floor widened it.
    const t = new Transport();
    for (const tune of LIBRARY) {
      t.bpm = tune.bpm;
      t.beatsPerBar = tune.beatsPerBar;
      for (const lead of LEAD_BEAT_CHOICES) {
        const beats = t.countInBeats(lead);
        const where = `${tune.id}, ${lead} beats`;
        expect(beats * t.beatSeconds, where)
          .toBeGreaterThanOrEqual(t.approachSeconds(lead) - 1e-9);
        // A whole number of beats, and never less than the bar it used to be.
        expect(Number.isInteger(beats), where).toBe(true);
        expect(beats, where).toBeGreaterThanOrEqual(tune.beatsPerBar);
      }
    }
  });

  it('rules the tail against the same lane the heads fall down', () => {
    // The head falls on a ruler of seconds and the tail is drawn on a ruler of
    // beats; `AuraStage` derives the second from the first. They describe one
    // lane only while laneBeats * beatSeconds is the approach, and the tail's
    // `Math.max(1, laneBeats)` guard must never be what clamps.
    const t = new Transport();
    for (const tune of LIBRARY) {
      t.bpm = tune.bpm;
      for (const lead of LEAD_BEAT_CHOICES) {
        const approach = t.approachSeconds(lead);
        const laneBeats = approach / t.beatSeconds;
        expect(laneBeats * t.beatSeconds, `${tune.id}, ${lead} beats`)
          .toBeCloseTo(approach, 9);
        expect(laneBeats, `${tune.id}, ${lead} beats`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('progression', () => {
  const order = ['a', 'b', 'c'];
  const KEY = 'playtune';

  it('starts with only the first tune open', () => {
    const p = resetProgress(KEY, order);
    expect(p.unlocked).toEqual(['a']);
    expect(p.best).toEqual({});
  });

  it('opens exactly the next tune on a pass, and nothing on a fail', () => {
    const p = resetProgress(KEY, order);
    const failed = recordRun(KEY, p, 'a', order, { accuracy: 0.4, score: 10, grade: null, passed: false });
    expect(failed.unlocked).toBeNull();
    expect(p.unlocked).toEqual(['a']);

    const passed = recordRun(KEY, p, 'a', order, { accuracy: 0.9, score: 99, grade: 'A', passed: true });
    expect(passed.unlocked).toBe('b');
    expect(p.unlocked).toEqual(['a', 'b']);
    expect(recordRun(KEY, p, 'a', order, { accuracy: 0.95, score: 120, grade: 'A', passed: true }).unlocked)
      .toBeNull();
  });

  it('only ever improves a best', () => {
    const p = resetProgress(KEY, order);
    recordRun(KEY, p, 'a', order, { accuracy: 0.9, score: 500, grade: 'A', passed: true });
    const worse = recordRun(KEY, p, 'a', order, { accuracy: 0.3, score: 20, grade: null, passed: false });
    expect(worse.improved).toBe(false);
    expect(p.best.a.accuracy).toBe(0.9);
    expect(p.best.a.score).toBe(500);
    expect(p.best.a.grade).toBe('A');
    expect(p.best.a.plays).toBe(2);
  });

  it('names what unlocks a locked tune', () => {
    expect(unlockedBy(order, 'b')).toBe('a');
    expect(unlockedBy(order, 'a')).toBeNull();
  });

  it('recovers from unreadable storage', () => {
    resetProgress(KEY, order);
    const p = loadProgress(KEY, order);
    expect(p.unlocked).toContain('a');
  });

  it('drops ids that are no longer in the library', () => {
    const p = resetProgress(KEY, order);
    p.unlocked.push('gone');
    p.best.gone = { accuracy: 1, score: 1, grade: 'S', plays: 1 };
    // Round-trip through storage the way a later release would.
    recordRun(KEY, p, 'a', order, { accuracy: 0.9, score: 1, grade: 'A', passed: true });
    const reloaded = loadProgress(KEY, order);
    expect(reloaded.unlocked).not.toContain('gone');
    expect(reloaded.best.gone).toBeUndefined();
  });
});
