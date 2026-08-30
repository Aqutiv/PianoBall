import type { ChordQuality } from '../../game/table/schema';
import type { ScaleName } from '../../audio/music';
import { SCALES, chordNotes, degreeToNote, inScale } from '../../audio/music';
import { COMP_PATTERNS, type CompPattern } from '../../audio/comp';
import { BED_VOICES, LEAD_VOICES } from '../../audio/voices';

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
  /**
   * Beats before the first bar line, for a tune that starts mid-bar.
   *
   * The chart counts beats from its own first note, so in a tune with a pickup
   * every bar line sits at `pickup + n * beatsPerBar`. The accompaniment needs
   * that: a bass note belongs on the downbeat, and without this it would put
   * one wherever the chart happens to have started instead.
   */
  pickup?: number;
  /** MIDI note of the tonic. */
  root: number;
  scaleId: ScaleName;
  melody: ChartNote[];
  chords: ChartChord[];
  /** How the bed plays those chords: the rhythm, not the harmony. */
  accompaniment: CompPattern;
  /**
   * What the keys sound like, and what the bed sounds like under them.
   *
   * Both are left out rather than defaulted here, because the absence carries
   * the rule: a tune that names no instrument is a tune with nothing to name,
   * and gets the sound the app makes everywhere else. Für Elise names a piano
   * and Twinkle names a music box; the originals name neither, so they say
   * nothing and keep the voice PianoBall has always had.
   */
  voiceId?: string;
  bedVoiceId?: string;
  /**
   * Chord tones from outside `scaleId` this tune means to use, as semitones
   * above the tonic.
   *
   * Borrowing is normal — a minor tune raises its seventh at a cadence, and
   * Greensleeves is the standard example — but it has to be declared, because
   * the alternative is having no way to tell a deliberate E major in A minor
   * from a chord degree that was simply typed wrong.
   */
  borrows?: number[];
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

/**
 * Lowest and highest note in a chart.
 *
 * Takes the notes rather than the tune, because what the player is asked to
 * play depends on the role: the melody in one, the chords in the other, and
 * the two have quite different spans.
 */
export function noteRange(notes: readonly ChartNote[]): { low: number; high: number } {
  let low = Infinity, high = -Infinity;
  for (const n of notes) {
    if (n.note < low) low = n.note;
    if (n.note > high) high = n.note;
  }
  return { low, high };
}

/**
 * Octave shift that puts a whole chart inside the mapped keybed.
 *
 * Tunes are authored around middle C; a 25-key controller starts two octaves
 * below that, and a chart the player cannot physically reach is worse than one
 * transposed. Returns null when the chart simply spans more keys than exist,
 * which the song card says out loud rather than failing at play time.
 */
export function fitToRange(notes: readonly ChartNote[], low: number, high: number): number | null {
  const r = noteRange(notes);
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

/** A chart moved by `semitones`, sorted by beat then pitch. */
export function fitted(notes: readonly ChartNote[], semitones: number): ChartNote[] {
  return notes
    .map((n) => ({ ...n, note: n.note + semitones }))
    .sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** Chart problems, as human-readable lines. Empty means the tune is sound. */
export function validate(tune: Tune): string[] {
  const problems: string[] = [];
  const scale = SCALES[tune.scaleId] as readonly number[] | undefined;
  if (!scale) problems.push(`unknown scale "${tune.scaleId}"`);
  if (!COMP_PATTERNS.includes(tune.accompaniment)) {
    problems.push(`unknown accompaniment "${tune.accompaniment}"`);
  }
  // Checked against the banks rather than through `findLeadVoice`, which falls
  // back to the default on purpose. That fallback is right for a saved
  // preference and wrong for a chart: it would turn a typo here into a tune
  // that quietly plays on the signature voice, and this is the one place a
  // typo in the library is supposed to say so.
  if (tune.voiceId !== undefined && !LEAD_VOICES.some((v) => v.id === tune.voiceId)) {
    problems.push(`unknown instrument "${tune.voiceId}"`);
  }
  if (tune.bedVoiceId !== undefined && !BED_VOICES.some((b) => b.id === tune.bedVoiceId)) {
    problems.push(`unknown backing "${tune.bedVoiceId}"`);
  }
  if (tune.bpm <= 0) problems.push('bpm must be positive');
  if (tune.beatsPerBar <= 0) problems.push('beatsPerBar must be positive');
  const pickup = tune.pickup ?? 0;
  if (pickup < 0 || pickup >= tune.beatsPerBar) {
    problems.push(`pickup ${pickup} must be within [0, ${tune.beatsPerBar})`);
  }
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

/**
 * Chord tones this tune plays that its own scale does not contain and its
 * `borrows` list does not admit to.
 *
 * Checking the chord's *root* is in the scale is not enough, and used to be all
 * that was checked: a B major triad built on a scale tone still drags a D sharp
 * and an F sharp in behind it, which is how a chord nobody meant to write sat
 * under a tune in D minor. Returns the offending semitones, as human-readable
 * lines.
 */
export function harmonyProblems(tune: Tune): string[] {
  const scale = SCALES[tune.scaleId] as readonly number[] | undefined;
  if (!scale) return [`unknown scale "${tune.scaleId}"`];
  const allowed = new Set(tune.borrows ?? []);
  const out: string[] = [];
  for (const c of tune.chords) {
    const root = degreeToNote(c.degree, tune.root, scale);
    for (const n of chordNotes(root, c.quality)) {
      const rel = ((n - tune.root) % 12 + 12) % 12;
      if (inScale(n, tune.root, scale) || allowed.has(rel)) continue;
      out.push(`chord at beat ${c.beat} (degree ${c.degree} ${c.quality}) uses ${rel} semitones, `
        + `which is outside ${tune.scaleId} and not in borrows`);
    }
  }
  return out;
}

/** Longest stretch, in beats, that the same chord is held for. */
export function slowestChordChange(tune: Tune): number {
  let worst = 0;
  for (const c of tune.chords) worst = Math.max(worst, c.len);
  return worst;
}
