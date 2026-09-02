/**
 * How a chord is played, rather than which chord it is.
 *
 * The bed used to render every chord as one long swell, which states the
 * harmony but never the pulse: at one chord a bar it sounds like a drone laid
 * over the tune instead of an accompaniment playing along with it. This turns a
 * chord into a handful of timed events — a bass note on the bar line, chords on
 * the beats the style puts them on — and leaves the scheduling to the caller.
 *
 * Everything here is in beats, including the attack, so a pattern written once
 * works at any tempo. Nothing in this file touches Web Audio or a clock, which
 * is what makes it testable.
 */

export type CompPattern =
  'sustain' | 'pulse' | 'march' | 'waltz' | 'broken' | 'arpeggio' | 'compound';

export const COMP_PATTERNS: CompPattern[] =
  ['sustain', 'pulse', 'march', 'waltz', 'broken', 'arpeggio', 'compound'];

/**
 * Which part of the accompaniment an event is.
 *
 * The bed plays all three and does not care. PlayTune's chord role does: it
 * asks the player for the `chord` events and keeps the rest, so the part being
 * learned is the only part the game stops playing. Inferring it from the gain
 * or the attack would work today and break the first time a pattern is tuned.
 */
export type CompPart = 'chord' | 'bass' | 'wash';

/** Every part of an accompaniment, which is what a bed normally sounds. */
export const ALL_PARTS: readonly CompPart[] = ['chord', 'bass', 'wash'];

export interface CompEvent {
  /** Beats after the chord's own start. */
  offset: number;
  /** Length in beats. */
  len: number;
  notes: number[];
  /** Peak gain, in the units `AudioEngine.pad` takes. */
  gain: number;
  /** Attack in beats, so it scales with tempo like everything else. */
  attack: number;
  part: CompPart;
}

/** Gains, kept together because they are only ever chosen against each other. */
const PAD = 0.075;
const PAD_BASS = 0.05;
/** The quiet pad that keeps running under a rhythmic pattern. */
const WASH = 0.03;
const CHORD = 0.055;
const BASS = 0.055;
const ARP = 0.04;

/** Attack of a struck chord, in beats. About 12 ms at 96 bpm. */
const STAB = 0.02;
/** Fraction of a swell spent rising. Matches `AudioEngine.pad`'s own default. */
const SWELL = 0.35;

/** A chord tone plays slightly under a bar-line chord when it is off the beat. */
const OFFBEAT = 0.78;

function swell(notes: number[], len: number, gain: number, part: CompPart): CompEvent {
  return { offset: 0, len: len * 1.05, notes, gain, attack: len * SWELL, part };
}

/**
 * The sustained layer every rhythmic pattern keeps underneath itself.
 *
 * Without it a comped chord is a series of separate stabs with silence between
 * them, and the harmony stops being continuous. It is quiet enough to read as
 * the room the chords are played in rather than as a chord of its own.
 */
function wash(voiced: number[], root: number, len: number): CompEvent[] {
  return [
    swell(voiced, len, WASH, 'wash'),
    swell([root - 12], len, WASH * 0.8, 'wash'),
  ];
}

/** Beat positions inside the chord, as `[offset, position within the bar]`. */
function beats(chordLen: number, beatsPerBar: number, barPhase: number, step = 1): [number, number][] {
  const out: [number, number][] = [];
  // A hair of slack, so a chord of length 3 written as 2.9999 still gets its
  // third beat rather than losing it to floating-point.
  for (let offset = 0; offset < chordLen - 1e-6; offset += step) {
    out.push([offset, mod(barPhase + offset, beatsPerBar)]);
  }
  return out;
}

function mod(a: number, n: number): number {
  return n > 0 ? ((a % n) + n) % n : 0;
}

/** Up and back down again, so a rolled chord turns around instead of jumping. */
function upDown(voiced: readonly number[]): number[] {
  if (voiced.length < 3) return [...voiced];
  return [...voiced, ...voiced.slice(1, -1).reverse()];
}

/**
 * One chord, as the events that play it.
 *
 * `barPhase` is where in the bar the chord starts, which is not always zero —
 * a pickup chord lands mid-bar, and its bass note still belongs on the bar line
 * rather than on the chord's own first beat.
 */
export function compEvents(
  pattern: CompPattern,
  voiced: readonly number[],
  root: number,
  chordLen: number,
  beatsPerBar: number,
  barPhase = 0,
): CompEvent[] {
  const notes = [...voiced];
  if (!notes.length || chordLen <= 0) return [];
  const bass = root - 12;
  const phase = mod(barPhase, beatsPerBar);

  // The chord swell here is a `chord` and not a `wash`: it is the whole of what
  // this pattern plays, and it is what the chord role means by a block chord.
  if (pattern === 'sustain') {
    return [swell(notes, chordLen, PAD, 'chord'), swell([bass], chordLen, PAD_BASS, 'bass')];
  }

  const out: CompEvent[] = wash(notes, root, chordLen);
  const lows = new Set<number>();
  /** A bass note, clipped so it never rings past the chord it belongs to. */
  const low = (offset: number, len: number) => {
    if (lows.has(offset)) return;
    lows.add(offset);
    out.push({ offset, len: Math.min(len, chordLen - offset), notes: [bass], gain: BASS, attack: STAB, part: 'bass' });
  };
  const stab = (offset: number, len: number, gain: number, ns = notes) =>
    out.push({ offset, len: Math.min(len, chordLen - offset), notes: ns, gain, attack: STAB, part: 'chord' });

  // A rolled chord, one tone at a time. Quavers where there is room for them,
  // crotchets where the tempo already fills the bar — the same left hand, at
  // the speed the piece is actually taken.
  if (pattern === 'arpeggio' || pattern === 'broken') {
    const seq = upDown(notes);
    const step = pattern === 'arpeggio' ? 0.5 : 1;
    let n = 0;
    for (const [offset, pos] of beats(chordLen, beatsPerBar, phase, step)) {
      if (pos === 0) low(offset, 1);
      stab(offset, step * 0.9, ARP * (Number.isInteger(pos) ? 1 : OFFBEAT), [seq[n % seq.length]]);
      n++;
    }
    return floor(out, low, chordLen);
  }

  for (const [offset, pos] of beats(chordLen, beatsPerBar, phase)) {
    if (pattern === 'compound') {
      // Counted in eighths: the bass carries each group of three, the other two
      // eighths of the group are the lilt.
      if (pos % 3 === 0) low(offset, 1.5);
      else stab(offset, 0.9, CHORD * (pos % 3 === 1 ? 1 : OFFBEAT));
    } else if (pattern === 'waltz') {
      if (pos === 0) low(offset, 1);
      else stab(offset, 0.9, CHORD * (pos === 1 ? 1 : OFFBEAT));
    } else if (pattern === 'march') {
      // Bass on the strong beats, chord on the weak ones: the oldest trick
      // there is for making four feel like four.
      if (pos % 2 === 0) low(offset, 1);
      else stab(offset, 0.9, CHORD);
    } else {
      // pulse: the chord on every beat, leaning on the bar line.
      if (pos === 0) low(offset, 1);
      stab(offset, 0.9, CHORD * (pos === 0 ? 1 : OFFBEAT));
    }
  }

  return floor(out, low, chordLen);
}

/**
 * Make sure the chord has a bass note under its own start.
 *
 * A chord that begins between bar lines gets no downbeat of its own, and would
 * otherwise be left with no floor at all. Added last rather than first, because
 * a chord that *does* start on a bar line already has one and does not want a
 * second one stacked on top of it.
 */
function floor(
  out: CompEvent[],
  low: (offset: number, len: number) => void,
  chordLen: number,
): CompEvent[] {
  low(0, Math.min(1, chordLen));
  return out;
}
