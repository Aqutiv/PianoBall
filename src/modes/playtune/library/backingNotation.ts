import { SCALES, chordNotes, degreeToNote } from '../../../audio/music';
import { lastBeat, type ChartNote, type Tune } from '../chart';

/** A figure is written in the song's chart beats, relative to its bar line. */
export type BackingTone = 'bass' | 'fifth' | 'third' | 'top' | 'dyad' | 'shell';
export type BackingStrike = readonly [offset: number, tone: BackingTone, len: number];
const EPS = 1e-6;

/** Fixed C3–C5 register. Inversions keep chord answers near the bass. */
function pitches(tune: Tune, beat: number, tone: BackingTone): number[] {
  const c = tune.chords.find(c => c.beat <= beat + EPS && c.beat + c.len > beat + EPS);
  if (!c) return [];
  const root = degreeToNote(c.degree, tune.root, SCALES[tune.scaleId]);
  const bass = 48 + ((root % 12) + 12) % 12;
  const notes = chordNotes(bass, c.quality);
  // Put all upper tones in C4–B4, retaining thirds/sevenths through inversions.
  const upper = (n: number) => 60 + n % 12;
  switch (tone) {
    case 'bass': return [bass];
    case 'fifth': return [bass + 7];
    case 'third': return [notes[1]];
    case 'top': return [notes[2]];
    case 'dyad': return [upper(notes[1]), upper(notes.at(-1)!)].sort((a, b) => a - b);
    case 'shell': return (notes.length === 4 ? [notes[0], notes[1], notes[3]] : notes)
      .map(upper).sort((a, b) => a - b);
  }
}

/**
 * Materialize a song's authored figure, with optional phrase rests and cadence.
 * Harmony is sampled at each strike; bar timing never restarts at a change.
 * Lengths stop at harmonic boundaries, so old tones cannot obscure a new chord.
 */
export function figure(
  tune: Tune, strikes: readonly BackingStrike[],
  options: { rests?: readonly (readonly [number, number])[]; cadence?: number; start?: number } = {},
): ChartNote[] {
  const out: ChartNote[] = [];
  const end = lastBeat(tune);
  const pickup = tune.pickup ?? 0;
  const put = (beat: number, tone: BackingTone, len: number) => {
    if (beat < (options.start ?? 0) - EPS || beat >= end - EPS) return;
    if (options.rests?.some(([from, to]) => beat >= from - EPS && beat < to - EPS)) return;
    const chord = tune.chords.find(c => c.beat <= beat + EPS && c.beat + c.len > beat + EPS);
    if (!chord) return;
    let stop = Math.min(end, beat + len, chord.beat + chord.len);
    for (const [from] of options.rests ?? []) if (from > beat) stop = Math.min(stop, from);
    for (const note of pitches(tune, beat, tone)) out.push({ beat, len: stop - beat, note });
  };
  for (let bar = pickup - tune.beatsPerBar; bar < end - EPS; bar += tune.beatsPerBar) {
    for (const [offset, tone, len] of strikes) {
      const beat = bar + offset;
      if (options.cadence !== undefined && beat >= options.cadence - EPS) continue;
      put(beat, tone, len);
    }
  }
  if (options.cadence !== undefined) put(options.cadence, 'shell', end - options.cadence);
  return out.sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** Place a bass attack at each written harmony boundary, including pickups. */
export function harmonicBass(tune: Tune): ChartNote[] {
  return tune.chords.flatMap(c => pitches(tune, c.beat, 'bass')
    .map(note => ({ beat: c.beat, len: c.len, note })));
}

/** Drift's held shells use root position to keep the foundation in the chord. */
export function heldHarmony(tune: Tune): ChartNote[] {
  const out: ChartNote[] = [];
  for (const c of tune.chords) {
    const root = degreeToNote(c.degree, tune.root, SCALES[tune.scaleId]);
    const notes = chordNotes(48 + root % 12, c.quality);
    for (const note of notes.length === 4 ? [notes[0], notes[1], notes[3]] : notes) {
      out.push({ beat: c.beat, len: c.len, note });
    }
  }
  return out.sort((a, b) => a.beat - b.beat || a.note - b.note);
}
