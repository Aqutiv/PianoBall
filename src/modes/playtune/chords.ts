import { compEvents, type CompPattern } from '../../audio/comp';
import { SCALES, chordNotes, degreeToNote } from '../../audio/music';
import { BED_VOICES } from '../../audio/voices';
import type { ChartChord, ChartNote, Tune } from './chart';

/**
 * Most notes the chord role will ever ask for at once.
 *
 * Four rather than the melody's three, because a seventh is four notes and
 * collapsing it to a triad would take the maj7s out of Gymnopédie and the min7
 * out of Drift, which is most of what those two tunes are.
 */
export const MAX_CHORD_VOICES = 4;

/** How a chord becomes keys under the hand. */
export type Voicing =
  /** Every tone of the chord, root position. */
  | 'full'
  /** Root, third and seventh: the fifth dropped, as a pianist voices a seventh. */
  | 'shell';

/**
 * Patterns a person can actually be asked to play.
 *
 * `broken` and `arpeggio` are missing on purpose. They roll a chord one tone at
 * a time in a fixed order, which is a single-note line derived from a chord —
 * that is the melody role wearing a hat, not the accompanist's job. The five
 * tunes written with one therefore have to name something else here.
 */
export const PLAYABLE_PATTERNS: CompPattern[] =
  ['sustain', 'pulse', 'march', 'waltz', 'compound'];

/** What the chord role asks of one tune. */
export interface ChordRole {
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** One line on the song card: what this tune is for. */
  teaches: string;
  /** Accuracy needed to unlock the next one. */
  pass: number;
  /** How the player strikes the chords. `sustain` is the block chord. */
  pattern: CompPattern;
  /** Default `full`. */
  voicing?: Voicing;
  /**
   * MIDI note the voicings are folded toward.
   *
   * An accompanist plays below the tune, so this defaults an octave under the
   * tonic. Without it a chord built on the sixth degree would sit on top of the
   * melody the game is playing, and the two would be indistinguishable.
   */
  register?: number;
  /** Keys the player plays on. A BED voice: the player is holding the bed. */
  keysVoiceId?: string;
  /** The voice the game plays the tune in. A BED voice — `pad` reads that bank. */
  melodyVoiceId?: string;
}

/**
 * Consecutive chords that are the same chord, run together.
 *
 * The library writes a chord's pickup beat and its bar as two entries —
 * Greensleeves opens `[0,'min',1]` then `[0,'min',3]`, Amazing Grace repeats
 * `[4,'maj',1]`, Londonderry Air splits `[0,'maj',1]` and `[0,'maj',4]`. The
 * bed does not care, because it re-voices to the same notes and the swell joins
 * up. The player would care a great deal: it reads as a chord change one beat
 * later, when nothing has changed.
 */
export function mergedChords(chords: readonly ChartChord[]): ChartChord[] {
  const out: ChartChord[] = [];
  for (const c of chords) {
    const prev = out[out.length - 1];
    const joins = prev
      && prev.degree === c.degree
      && prev.quality === c.quality
      && Math.abs(prev.beat + prev.len - c.beat) < 1e-6;
    if (joins) prev.len += c.len;
    else out.push({ ...c });
  }
  return out;
}

/**
 * One chord as keys, in root position, folded toward `anchor`.
 *
 * Root position throughout, deliberately. `voiceLead` — what the bed uses —
 * places a chord relative to the one before it, which would move the same chord
 * around between plays and make the octave fit depend on where the run started.
 * Root position also means a major triad is always the same shape under the
 * hand, which is the thing being learned. The cost is wider jumps between
 * chords, and that is the honest cost of learning them.
 */
export function voicingFor(
  root: number,
  quality: ChartChord['quality'],
  style: Voicing,
  anchor: number,
): number[] {
  const tones = chordNotes(root, quality);
  // Only a seventh has a fifth worth dropping; a triad without its fifth is
  // two notes and stops being a chord.
  const kept = style === 'shell' && tones.length === 4
    ? [tones[0], tones[1], tones[3]]
    : tones;
  const drop = 12 * Math.round((anchor - kept[0]) / 12);
  return kept.map((n) => n + drop);
}

/**
 * A tune's chord track, as the notes the player presses.
 *
 * `role.pattern` is what the chord role asks for and is not
 * `tune.accompaniment`, which is what the bed plays while the *melody* is being
 * learned. Only Drift is written `sustain`, so keying off the tune would open
 * the chord curve with a march.
 *
 * The block chord needs no special case: `compEvents('sustain', …)` already
 * renders a chord as one event covering its whole length, which is exactly
 * "press it and keep it down".
 */
export function chordChart(tune: Tune, role: ChordRole): ChartNote[] {
  const scale = SCALES[tune.scaleId];
  const anchor = role.register ?? tune.root - 12;
  const style = role.voicing ?? 'full';
  const pickup = tune.pickup ?? 0;
  const out: ChartNote[] = [];

  for (const c of mergedChords(tune.chords)) {
    const root = degreeToNote(c.degree, tune.root, scale);
    const voiced = voicingFor(root, c.quality, style, anchor);
    // Where in the bar the chord starts, so a pattern puts its strong beat on
    // the bar line rather than on wherever this chord happened to begin.
    const phase = c.beat - pickup;
    for (const ev of compEvents(role.pattern, voiced, root, c.len, tune.beatsPerBar, phase)) {
      // The bass and the wash stay with the game.
      if (ev.part !== 'chord') continue;
      // A swell overhangs its chord by a twentieth so the bed joins up. A note
      // the player has to hold must not, or its tail runs into the next chord.
      const len = Math.min(ev.len, c.len - ev.offset);
      if (len <= 0) continue;
      for (const note of ev.notes) out.push({ beat: c.beat + ev.offset, len, note });
    }
  }

  return dedupe(out);
}

/**
 * Two events landing on the same pitch at the same moment, merged.
 *
 * One press can only ever satisfy one target, so a duplicate is a guaranteed
 * miss the player has no way to avoid. No pattern produces one today; this is
 * here so that adding one cannot quietly make a tune unplayable.
 */
function dedupe(notes: ChartNote[]): ChartNote[] {
  const byKey = new Map<string, ChartNote>();
  for (const n of notes) {
    const key = `${n.beat}:${n.note}`;
    const prev = byKey.get(key);
    if (!prev || n.len > prev.len) byKey.set(key, n);
  }
  return [...byKey.values()].sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/**
 * Problems with a tune's chord chart, as human-readable lines.
 *
 * Deliberately not part of `validate`, which is about what a tune's author
 * wrote. A chord chart is derived, and the cap it has to keep is its own: four
 * notes rather than the melody's three.
 */
export function chordProblems(tune: Tune, role: ChordRole): string[] {
  const problems: string[] = [];

  if (!PLAYABLE_PATTERNS.includes(role.pattern)) {
    problems.push(`pattern "${role.pattern}" rolls a chord one note at a time`);
  }
  if (role.pass <= 0 || role.pass > 1) problems.push('pass must be within (0, 1]');
  const keys = role.keysVoiceId === undefined
    ? undefined
    : BED_VOICES.find((v) => v.id === role.keysVoiceId);
  if (role.keysVoiceId !== undefined && !keys) {
    problems.push(`unknown instrument "${role.keysVoiceId}"`);
  }
  // A plucked voice is over within a second of being struck whether or not the
  // key is still down. That is right for the game's part and wrong for the
  // player's: this role asks for chords to be *held*, and the tail draining on
  // screen would have nothing left to hear.
  if (keys?.spec.pluck) {
    problems.push(`"${role.keysVoiceId}" is plucked, so a held chord would not sound`);
  }
  if (role.melodyVoiceId !== undefined && !BED_VOICES.some((b) => b.id === role.melodyVoiceId)) {
    problems.push(`unknown backing "${role.melodyVoiceId}"`);
  }

  const chart = chordChart(tune, role);
  if (!chart.length) {
    problems.push('chord chart is empty');
    return problems;
  }

  const perBeat = new Map<number, number>();
  for (const n of chart) perBeat.set(n.beat, (perBeat.get(n.beat) ?? 0) + 1);
  for (const [beat, count] of perBeat) {
    if (count > MAX_CHORD_VOICES) problems.push(`beat ${beat} asks for ${count} notes at once`);
  }

  for (const n of chart) {
    if (n.beat < 0) problems.push(`chord note at beat ${n.beat} is before the start`);
    if (n.len <= 0) problems.push(`chord note at beat ${n.beat} has no length`);
    if (n.note < 0 || n.note > 127) problems.push(`chord note ${n.note} is outside MIDI`);
  }

  return problems;
}
