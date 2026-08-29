import type { ChordQuality } from '../../game/table/schema';
import type { ScaleName } from '../../audio/music';
import { SCALES } from '../../audio/music';

/** One note the player is asked to play. Simultaneous beats form a chord. */
export interface ChartNote {
  /** Beats from the start of the chart. */
  beat: number;
  /** Length in beats. */
  len: number;
  /** MIDI note, as authored. `fitToRange` moves it by whole octaves. */
  note: number;
}

/** One chord the game plays underneath, in the tune's own scale degrees. */
export interface ChartChord {
  beat: number;
  len: number;
  degree: number;
  quality: ChordQuality;
}

export interface Tune {
  id: string;
  title: string;
  composer: string;
  origin: 'classic' | 'original';
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** One line on the song card: what this tune is for. */
  teaches: string;
  bpm: number;
  beatsPerBar: number;
  /** MIDI note of the tonic. */
  root: number;
  scaleId: ScaleName;
  melody: ChartNote[];
  chords: ChartChord[];
  /** Accuracy needed to unlock the next tune. */
  pass: number;
}

/** Beat the last note finishes on. */
export function lastBeat(tune: Tune): number {
  let end = 0;
  for (const n of tune.melody) end = Math.max(end, n.beat + n.len);
  for (const c of tune.chords) end = Math.max(end, c.beat + c.len);
  return end;
}

export function noteRange(tune: Tune): { low: number; high: number } {
  let low = Infinity, high = -Infinity;
  for (const n of tune.melody) {
    if (n.note < low) low = n.note;
    if (n.note > high) high = n.note;
  }
  return { low, high };
}

/**
 * Octave shift that puts the whole melody inside the mapped keybed.
 *
 * Tunes are authored around middle C; a 25-key controller starts two octaves
 * below that, and a chart the player cannot physically reach is worse than one
 * transposed. Returns null when the melody simply spans more keys than exist,
 * which the song card says out loud rather than failing at play time.
 */
export function fitToRange(tune: Tune, low: number, high: number): number | null {
  const r = noteRange(tune);
  if (!Number.isFinite(r.low)) return 0;
  if (r.high - r.low > high - low) return null;

  // Prefer the shift that centres the melody, then walk outwards, so a tune
  // that fits in several octaves lands in the most comfortable one.
  const wanted = ((low + high) / 2) - ((r.low + r.high) / 2);
  const centre = Math.round(wanted / 12);
  for (let d = 0; d <= 8; d++) {
    for (const oct of d === 0 ? [centre] : [centre - d, centre + d]) {
      const shift = oct * 12;
      if (r.low + shift >= low && r.high + shift <= high) return shift;
    }
  }
  return null;
}

/** The melody moved by `semitones`, sorted by beat then pitch. */
export function fittedMelody(tune: Tune, semitones: number): ChartNote[] {
  return tune.melody
    .map((n) => ({ ...n, note: n.note + semitones }))
    .sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** Chart problems, as human-readable lines. Empty means the tune is sound. */
export function validate(tune: Tune): string[] {
  const problems: string[] = [];
  const scale = SCALES[tune.scaleId] as readonly number[] | undefined;
  if (!scale) problems.push(`unknown scale "${tune.scaleId}"`);
  if (tune.bpm <= 0) problems.push('bpm must be positive');
  if (tune.beatsPerBar <= 0) problems.push('beatsPerBar must be positive');
  if (!tune.melody.length) problems.push('no melody');
  if (tune.pass <= 0 || tune.pass > 1) problems.push('pass must be within (0, 1]');

  let prev = -1;
  for (const n of tune.melody) {
    if (n.beat < 0) problems.push(`note at beat ${n.beat} is before the start`);
    if (n.len <= 0) problems.push(`note at beat ${n.beat} has no length`);
    if (n.note < 0 || n.note > 127) problems.push(`note ${n.note} is outside MIDI`);
    if (n.beat < prev) problems.push(`melody is not sorted at beat ${n.beat}`);
    prev = n.beat;
  }

  let prevChord = -1;
  for (const c of tune.chords) {
    if (c.beat < 0) problems.push(`chord at beat ${c.beat} is before the start`);
    if (c.len <= 0) problems.push(`chord at beat ${c.beat} has no length`);
    if (c.beat < prevChord) problems.push(`chords are not sorted at beat ${c.beat}`);
    prevChord = c.beat;
  }

  // A melody with no harmony under it is allowed; one where the player is
  // asked to hold six keys at once is not.
  const perBeat = new Map<number, number>();
  for (const n of tune.melody) perBeat.set(n.beat, (perBeat.get(n.beat) ?? 0) + 1);
  for (const [beat, count] of perBeat) {
    if (count > 3) problems.push(`beat ${beat} asks for ${count} notes at once`);
  }

  return problems;
}
