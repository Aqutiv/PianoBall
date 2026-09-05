import { chordNotes, degreeToNote } from '../src/audio/music';
import { describe, expect, it } from 'vitest';
import { AudioEngine, DEFAULT_AUDIO, softClip, unisonPhases } from '../src/audio/engine';
import { wireGlobalControls } from '../src/audio/controls';
import { InputHub } from '../src/midi/inputHub';
import { ChordBed } from '../src/audio/bed';
import { MusicState } from '../src/audio/musicState';
import { AURORA } from '../src/game/table/tables/aurora';

function wired(): { input: InputHub; engine: AudioEngine } {
  const input = new InputHub();
  const engine = new AudioEngine();
  wireGlobalControls(input, engine);
  return { input, engine };
}

describe('cutting the pads short', () => {
  it('is safe before the graph exists', () => {
    // The shell enters a mode at boot to put something behind the home screen,
    // and that switch stops whatever the last mode left ringing — long before
    // a user gesture has unlocked any audio to stop.
    const engine = new AudioEngine();

    expect(engine.ready).toBe(false);
    expect(() => engine.stopPads()).not.toThrow();
  });

  it('hushes safely before the graph exists', () => {
    // Losing focus over the menu puts the pause panel up, and the panel
    // silences the sound — on a page that has not been clicked in yet.
    const engine = new AudioEngine();

    expect(() => engine.hush()).not.toThrow();
  });

  it('takes the pedal in any position before the graph exists', () => {
    const engine = new AudioEngine();
    expect(() => engine.setSustain(true)).not.toThrow();
    expect(() => engine.setSustain(0.5)).not.toThrow();
    expect(() => engine.setSustain(0)).not.toThrow();
  });
});

/**
 * The front and the backing, each on a fader of its own. The pair is the point:
 * how far the chords sit behind the hands is set rather than fixed, and neither
 * fader may move the other or the group above them.
 */
describe('the instrument fader', () => {
  it('starts where the keys have always played', () => {
    expect(new AudioEngine().leadGain).toBe(1);
  });

  it('moves the front without moving the backing, or the group over both', () => {
    const engine = new AudioEngine();

    engine.setSettings({ leadLevel: 0.25 });

    expect(engine.leadGain).toBe(0.5);
    expect(engine.bedGain).toBe(1);
    expect(engine.settings.music).toBe(DEFAULT_AUDIO.music);
  });

  it('is left alone by a mode muting the bed', () => {
    const engine = new AudioEngine();
    engine.setSettings({ leadLevel: 0.9 });

    engine.setBedAudible(false);

    // The hands play on: the mute is the backing's, and the fader is not.
    expect(engine.leadGain).toBe(1.8);
    expect(engine.bedGain).toBe(0);
  });
});

/**
 * The bed's fader and the bed's mute share one gain, which is the whole point:
 * a mode switching the backing off and a player setting how loud it is are
 * different questions, and neither may answer the other's.
 */
describe('the bed fader', () => {
  it('defaults to the level the bed has always sat at', () => {
    expect(new AudioEngine().bedGain).toBe(1);
  });

  it('moves the bed without touching anything the player is holding', () => {
    const engine = new AudioEngine();

    engine.setSettings({ bedLevel: 0.75 });

    // Above half travel, because the bed can come forward as well as back.
    expect(engine.bedGain).toBe(1.5);
    expect(engine.settings.music).toBe(DEFAULT_AUDIO.music);
  });

  it('is neither forgotten by a mute nor undone by one', () => {
    const engine = new AudioEngine();
    engine.setSettings({ bedLevel: 0.75 });

    engine.setBedAudible(false);
    expect(engine.bedGain).toBe(0);

    // Moved while a mode has the backing switched off: it must stay off, and
    // the new level must be what comes back when it is switched on again.
    engine.setSettings({ bedLevel: 0.25 });
    expect(engine.bedGain).toBe(0);

    engine.setBedAudible(true);
    expect(engine.bedGain).toBe(0.5);
  });
});

describe('MIDI audio controls', () => {
  it('maps channel volume CC 7 to master volume', () => {
    const { input, engine } = wired();

    input.dispatch({ type: 'cc', controller: 7, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).toBe(0.25);
  });

  it('does not treat unrelated CC messages as volume', () => {
    const { input, engine } = wired();
    const initial = engine.settings.master;

    input.dispatch({ type: 'cc', controller: 10, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).toBe(initial);
  });

  it('releases the subscription when told to', () => {
    const input = new InputHub();
    const engine = new AudioEngine();
    const off = wireGlobalControls(input, engine);
    off();

    input.dispatch({ type: 'cc', controller: 7, value: 0.25, time: 0, source: 'midi' });

    expect(engine.settings.master).not.toBe(0.25);
  });
});

/**
 * A bed switched on has to be heard now.
 *
 * The bar clock keeps running while the bed is silent, so re-enabling it used
 * to mean waiting for whatever bar the previous mode had left on the clock —
 * up to five seconds at the table's tempo, which reads as a button that does
 * nothing at all.
 */
describe('switching the bed on', () => {
  function harness() {
    const pads: number[][] = [];
    const audible: boolean[] = [];
    const engine = {
      running: true,
      now: 0,
      settings: { bed: true },
      pad: (notes: number[]) => { pads.push(notes); },
      stopPads: () => {},
      setBedAudible: (on: boolean) => { audible.push(on); },
    };
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine as never, music);
    return { pads, audible, engine, bed };
  }

  it('plays on the next tick rather than on the next bar', () => {
    const { pads, audible, engine, bed } = harness();

    // A bar goes out, leaving the clock pointing at the one after it.
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length).toBe(2);

    // The player switches it off, then back on well inside that bar.
    bed.setEnabled(false);
    engine.now = 1;
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length, 'silent while off').toBe(2);

    bed.setEnabled(true);
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length, 'sounds as soon as it is asked for').toBe(4);
    // And the bus follows, so what was already ringing stopped on the way out.
    expect(audible).toEqual([false, true]);
  });

  it('silences what is already ringing when it stops', () => {
    const { pads, audible, bed } = harness();
    (bed as never as { schedule(): void }).schedule();
    expect(pads.length).toBe(2);

    // Those pads are already in the engine's hands and will ring for their
    // whole length — nearly four seconds of a slow swell. Dropping the queue
    // does not reach them; only the bus does.
    bed.stop();
    expect(audible).toEqual([false]);

    // And starting again brings them back, so a stop is not a one-way trip.
    bed.start();
    expect(audible).toEqual([false, true]);
    bed.stop();
  });

  it('comes back only as loud as the mode asked for', () => {
    const { audible, bed } = harness();
    // A mode that wants no bed of its own must not get one back just because
    // something stopped and started the scheduler around it.
    bed.setEnabled(false);
    bed.stop();
    bed.start();
    expect(audible).toEqual([false, false, false]);
    bed.stop();
  });

  it('does nothing when asked for a state it is already in', () => {
    const { pads, audible, engine, bed } = harness();
    (bed as never as { schedule(): void }).schedule();
    engine.now = 1;

    // Re-asserting "on" must not restart the bar clock under a playing bed.
    bed.setEnabled(true);
    (bed as never as { schedule(): void }).schedule();

    expect(pads.length).toBe(2);
    expect(audible).toEqual([]);
  });
});

/**
 * The table asks the bed to play its loop differently as a rally builds. What
 * has to hold is that the bottom rung is the bed as it always was, that a
 * comped bar lands on its beats, and that a change never lands mid-bar.
 */
describe("the loop's pattern", () => {
  interface Pad { notes: number[]; seconds: number; gain: number; at: number; attack: number }
  const BAR = (60 / AURORA.music.bpm) * 4;
  const BEAT = BAR / 4;

  function harness() {
    const pads: Pad[] = [];
    const engine = {
      running: true,
      now: 0,
      bedVoice: 'warm',
      settings: { bed: true },
      pad: (notes: number[], seconds: number, gain: number, at: number, attack: number) => {
        pads.push({ notes, seconds, gain, at, attack });
      },
      setBedAudible: () => {},
    };
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(engine as never, music);
    const tick = () => (bed as never as { schedule(): void }).schedule();
    /** Wind the clock a bar forward, a scheduler tick at a time. */
    const bar = () => { for (let t = 0; t < BAR; t += 0.04) { engine.now += 0.04; tick(); } };
    return { pads, engine, bed, tick, bar, music };
  }

  // The harness rolls a scale at random, as the game does, so these assert
  // against the chord the bed says it is on rather than against a note.
  it('voices and colours the loop as the table asks, from the next bar', () => {
    const { pads, bed, tick, bar } = harness();
    tick();
    const plain = pads[0].notes.length;
    expect(plain).toBe(bed.chordSpec.notes.length);
    expect(bed.chordTones).toHaveLength(plain);
    bed.setLoopStyle({ voicing: 'spread', colour: 1 });
    bar();
    const chords = pads.filter((p) => p.notes.length > 1);
    // The bar already written keeps its voicing; the next one takes the new.
    expect(chords[0].notes).toHaveLength(plain);
    const coloured = chords[chords.length - 1].notes;
    expect(coloured.length).toBeGreaterThanOrEqual(plain);
    expect(coloured.length).toBeLessThanOrEqual(5);
    expect(Math.max(...coloured) - Math.min(...coloured)).toBeLessThanOrEqual(19);
    expect(bed.chordTones).toEqual(coloured);
    // And back to plain, from the bar after — which is the next chord's.
    bed.setLoopStyle({});
    bar();
    expect(pads.filter((p) => p.notes.length > 1).pop()!.notes).toHaveLength(bed.chordSpec.notes.length);
  });

  it('walks the bass into the next chord on the last bar of the one before', () => {
    const { pads, bed, tick, bar } = harness();
    bed.setLoopPattern('pulse', ['chord', 'bass']);
    bed.setLoopStyle({ bass: 'walk' });
    tick();
    const root = bed.chordSpec.root - 12;
    bar();
    bar();
    const next = bed.chordSpec.root - 12;
    const single = pads.filter((p) => p.notes.length === 1);
    const near = (at: number, beats: number) => Math.abs(at - beats * BEAT) < 1e-6;
    // The fifth on three, in both bars of the chord.
    expect(single.some((p) => near(p.at, 2) && p.notes[0] === root + 7)).toBe(true);
    expect(single.some((p) => near(p.at, 6) && p.notes[0] === root + 7)).toBe(true);
    // A step into the next chord on the last half-beat of the second bar,
    // from just below it, and nothing of the kind in the first bar.
    expect(single.some((p) => near(p.at, 3.5))).toBe(false);
    const step = single.find((p) => near(p.at, 7.5));
    expect(step).toBeDefined();
    expect(next - step!.notes[0]).toBeGreaterThanOrEqual(1);
    expect(next - step!.notes[0]).toBeLessThanOrEqual(2);
  });

  it('turns around at the end of the loop and plays its second loop the second time round', () => {
    const { bed, tick, bar, music } = harness();
    const rootOf = (step: { degree: number }) => degreeToNote(step.degree, music.root, music.scale) - 12;
    tick();
    expect(bed.chordSpec.root).toBe(rootOf(music.progression[0]));
    // Sixteen bars: eight chords of two. The last bar of the eighth turns around.
    for (let i = 0; i < 15; i++) bar();
    expect(bed.chordIndex).toBe(7);
    expect(bed.chordSpec.root).toBe(rootOf(music.turnaround!));
    // And the seventeenth is the top of the other loop.
    bar();
    expect(bed.chordIndex).toBe(0);
    expect(bed.chordSpec.root).toBe(rootOf(music.variation![0]));
    // Sixteen more, and it is the first loop again.
    for (let i = 0; i < 16; i++) bar();
    expect(bed.chordSpec.root).toBe(rootOf(music.progression[0]));
  });

  it('comes home through a cadence when asked, then starts over or carries on', () => {
    for (const then of ['restart', 'resume'] as const) {
      const { pads, bed, tick, bar, music } = harness();
      const pcs = (ns: readonly number[]) => new Set(ns.map((n) => ((n % 12) + 12) % 12));
      const chordOf = (step: { degree: number; quality: 'maj' | 'min' | 'min7' | 'maj7' | 'sus2' | 'sus4' | 'dom7' | 'dim' }) =>
        pcs(chordNotes(degreeToNote(step.degree, music.root, music.scale), step.quality));
      const lastChord = () => pcs(pads.filter((p) => p.notes.length > 1).pop()!.notes);
      tick();
      bar();
      bar();
      expect(bed.chordIndex).toBe(1);
      bed.cadence('authentic', then);
      const steps = music.cadences!.authentic;
      bar();
      expect(lastChord(), then).toEqual(chordOf(steps[0]));
      bar();
      expect(lastChord(), then).toEqual(chordOf(steps[steps.length - 1]));
      bar();
      if (then === 'restart') {
        expect(bed.chordIndex).toBe(0);
        expect(lastChord()).toEqual(chordOf(music.progression[0]));
      } else {
        expect(bed.chordIndex).toBe(1);
        expect(lastChord()).toEqual(chordOf(music.progression[1]));
      }
    }
  });

  it('sounds as it always has until it is asked otherwise', () => {
    const { pads, tick } = harness();
    tick();
    // A chord and its root, both for the whole bar, both on the bar line.
    expect(pads.map((p) => p.at)).toEqual([0, 0]);
    expect(pads[0].seconds).toBeCloseTo(BAR * 1.05, 6);
    expect(pads[0].notes.length).toBeGreaterThan(1);
    expect(pads[1].notes).toHaveLength(1);
  });

  it('plays a comped bar on the beats, and only the parts it was given', () => {
    const { pads, bed, tick, bar } = harness();
    bed.setLoopPattern('pulse', ['chord', 'bass']);
    tick();
    bar();
    const first = pads.filter((p) => p.at < BAR - 1e-6);
    // Four chord stabs and one bass note; the wash was left out.
    expect(first).toHaveLength(5);
    const stabs = first.filter((p) => p.notes.length > 1).map((p) => p.at / BEAT);
    expect(stabs.map((s) => Math.round(s * 1000) / 1000)).toEqual([0, 1, 2, 3]);
  });

  it('uses natural plucked tails instead of stacking a wash beside them', () => {
    const sustained = harness();
    sustained.bed.setLoopPattern('pulse');
    sustained.tick();
    sustained.bar();
    const withWash = sustained.pads.filter((p) => p.at < BAR - 1e-6);
    expect(withWash).toHaveLength(7);
    expect(withWash.filter((p) => p.attack >= p.seconds * 0.2)).toHaveLength(2);

    const plucked = harness();
    plucked.engine.bedVoice = 'nylon-guitar';
    plucked.bed.setLoopPattern('pulse');
    plucked.tick();
    plucked.bar();
    const naturalTails = plucked.pads.filter((p) => p.at < BAR - 1e-6);
    expect(naturalTails).toHaveLength(5);
    expect(naturalTails.every((p) => p.attack < p.seconds * 0.2)).toBe(true);
  });

  it('changes on the next bar line, never in the middle of a bar', () => {
    const { pads, engine, bed, tick } = harness();
    tick();
    const before = pads.length;
    engine.now = BEAT;
    bed.setLoopPattern('pulse');
    tick();
    expect(pads.length, 'nothing new inside the bar').toBe(before);
    engine.now = BAR - 0.1;
    tick();
    const next = pads.filter((p) => p.at >= BAR - 1e-6);
    expect(next.length).toBeGreaterThan(2);
  });

  it('forgets a bar it had expanded when the key changes under it', () => {
    const { pads, bed, tick, engine } = harness();
    bed.setLoopPattern('arpeggio');
    tick();
    const written = pads.length;
    // The arpeggio's later steps are still queued for their moment; a scale
    // change must not let them play out over the new key's first bar.
    bed.reset();
    engine.now = 0.5;
    tick();
    expect(pads.length).toBeGreaterThan(written);
    for (const p of pads.slice(written)) expect(p.at).toBeCloseTo(0.5, 6);
  });
});

/**
 * The master ceiling.
 *
 * A `WaveShaper` clamps its input to ±1 and reads the curve across exactly
 * that range, so a curve that is still climbing when the table runs out is a
 * hard clipper wearing a soft clipper's name: the waveform gets a corner in it
 * at full scale, which is the crunch. These are the properties that make it a
 * ceiling instead, and the slope-at-the-edges one is what the original curve
 * failed.
 */
describe('the soft clipper', () => {
  const POINTS = 4096;
  const curve = softClip(POINTS);
  const slopes = Array.from({ length: POINTS - 1 }, (_, i) => curve[i + 1] - curve[i]);
  const steepest = Math.max(...slopes);

  it('reaches full scale rather than stopping short of it', () => {
    // The old curve was `tanh` across the table's own range, so it topped out
    // at tanh(1) = 0.762 and gave away two and a half decibels for nothing.
    expect(curve[POINTS - 1]).toBeGreaterThan(0.99);
    expect(curve[POINTS - 1]).toBeLessThanOrEqual(1);
    expect(curve[0]).toBeCloseTo(-curve[POINTS - 1], 12);
  });

  it('has flattened out before the table runs out', () => {
    // The one that matters. Beyond the table the shaper repeats the end point,
    // so the curve has to arrive there with no slope left; anything else is a
    // corner in the waveform at exactly the level everything is loudest.
    expect(slopes[0]).toBeLessThan(steepest * 0.01);
    expect(slopes[slopes.length - 1]).toBeLessThan(steepest * 0.01);
  });

  it('is unity through the middle, so a mix that fits is untouched', () => {
    // A straight line, within what a `Float32Array` can hold it to.
    const mid = POINTS >> 1;
    for (let i = mid - 100; i < mid + 100; i++) {
      expect(Math.abs(slopes[i] / steepest - 1)).toBeLessThan(1e-4);
    }
  });

  it('never turns back on itself, and never bends sharply', () => {
    for (let i = 0; i < slopes.length; i++) {
      // Level, not falling. Out at the ends the curve has saturated so
      // completely that two neighbours land on the same float, which is the
      // point of it.
      expect(slopes[i]).toBeGreaterThanOrEqual(0);
      expect(Math.abs(curve[i])).toBeLessThanOrEqual(1);
      if (i > 0) expect(Math.abs(slopes[i] - slopes[i - 1])).toBeLessThan(steepest * 0.02);
    }
  });
});

/**
 * Unison phases.
 *
 * Three strings under one hammer are three strings. The engine scales each
 * copy by the number of copies to a power near a half, which is what sources
 * at independent phases sum to — so the phases have to actually be
 * independent, partial by partial. They were not once: a single shift in time
 * per copy moves partial *k* by *k* times one angle, which is a comb, and a
 * comb has notches. That is what these guard.
 */
describe('unison phases', () => {
  /** How much of one oscillator's partial `k` survives when `copies` are summed. */
  const sum = (copies: number, k: number): number => {
    const table = unisonPhases(copies);
    let re = 0;
    let im = 0;
    for (let j = 0; j < copies; j++) {
      re += Math.cos(table[j][k]);
      im += Math.sin(table[j][k]);
    }
    return Math.hypot(re, im);
  };

  it('leaves the spectrum exactly as written for the first copy', () => {
    // A voice with no unison at all must be untouched by any of this.
    for (const copies of [1, 2, 3]) {
      for (const a of unisonPhases(copies)[0]) expect(a).toBe(0);
    }
  });

  it('gives one copy the same phases every time it is asked', () => {
    expect(unisonPhases(3)[1]).toEqual(unisonPhases(3)[1]);
    expect(unisonPhases(3)[2][7]).toBe(unisonPhases(3)[2][7]);
  });

  it('never lets a partial cancel', () => {
    // The failure this replaced: three copies a golden ratio apart summed
    // their fundamentals to 0.47 where independent sources give about 1.73 —
    // eleven decibels of hollow on the attack. And drawing at random alone is
    // not enough either; it buries whichever partial lands in a null.
    for (const copies of [2, 3]) {
      for (let k = 1; k < 64; k++) {
        expect(sum(copies, k), `${copies} copies, partial ${k}`)
          .toBeGreaterThan(Math.sqrt(copies) * 0.7);
      }
    }
  });

  it('sums to what the level scaling assumes, partial by partial', () => {
    for (const copies of [2, 3]) {
      for (let k = 1; k < 64; k++) {
        expect(sum(copies, k), `${copies} copies, partial ${k}`)
          .toBeLessThan(Math.sqrt(copies) * 1.3);
      }
    }
  });

  it('scatters differently for each partial, or the sum would be peaky again', () => {
    // Every partial landing on the same phases would make the copies sum to a
    // scaled version of the original waveform — the same crest, and no
    // headroom won at all. The variety across partials is the point.
    const angles = unisonPhases(3)[1].slice(1, 64);
    const spread = new Set(angles.map((a) => Math.round(a * 8)));
    expect(spread.size).toBeGreaterThan(8);
  });
});
