import { BED_VOICES, LEAD_VOICES } from '../../audio/voices';
import { fitToRange, lastBeat, type ChartChord, type ChartNote, type Tune } from './chart';

export const MAX_CHORD_VOICES = 3;

/** Authored accompaniment; retained type name follows the compatible role ID. */
export interface ChordRole {
  difficulty: 1 | 2 | 3 | 4 | 5;
  teaches: string;
  pass: number;
  notes: readonly ChartNote[];
  keyVoicing: 'lead' | 'bed';
  keysVoiceId: string;
  melodyVoiceId: string;
}

/** Consecutive equal harmony entries share one HUD label. */
export function mergedChords(chords: readonly ChartChord[]): ChartChord[] {
  const out: ChartChord[] = [];
  for (const c of chords) {
    const prev = out.at(-1);
    if (prev && prev.degree === c.degree && prev.quality === c.quality
      && Math.abs(prev.beat + prev.len - c.beat) < 1e-6) prev.len += c.len;
    else out.push({ ...c });
  }
  return out;
}

/** Own the returned objects; playback and export must not mutate the score. */
export function chordChart(_tune: Tune, role: ChordRole): ChartNote[] {
  return role.notes.map(n => ({ ...n }));
}

/** Check both simultaneous attacks and held notes, including phrase boundaries. */
export function chordProblems(tune: Tune, role: ChordRole): string[] {
  const problems: string[] = [];
  if (!Number.isFinite(role.pass) || role.pass <= 0 || role.pass > 1) problems.push('pass must be within (0, 1]');
  const bank = role.keyVoicing === 'lead' ? LEAD_VOICES : BED_VOICES;
  if (!['lead', 'bed'].includes(role.keyVoicing)) problems.push('unknown key voicing');
  if (!bank.some(v => v.id === role.keysVoiceId)) problems.push(`unknown instrument "${role.keysVoiceId}"`);
  if (!BED_VOICES.some(v => v.id === role.melodyVoiceId)) problems.push(`unknown backing "${role.melodyVoiceId}"`);
  const chart = role.notes;
  if (!chart.length) return [...problems, 'backing chart is empty'];
  const end = lastBeat(tune);
  const ends = new Map<number, number>();
  let previous = -Infinity;
  const active: ChartNote[] = [];
  for (const n of chart) {
    if (![n.beat, n.len, n.note].every(Number.isFinite)) { problems.push('non-finite backing note'); continue; }
    if (n.beat < 0 || n.beat < previous) problems.push(`unordered or negative beat ${n.beat}`);
    previous = n.beat;
    if (n.len <= 0 || n.beat + n.len > end + 1e-6) problems.push(`invalid note length at ${n.beat}`);
    if (!Number.isInteger(n.note) || n.note < 0 || n.note > 127) problems.push(`invalid MIDI pitch ${n.note}`);
    if ((ends.get(n.note) ?? -Infinity) > n.beat + 1e-6) problems.push(`duplicate or overlapping pitch ${n.note} at ${n.beat}`);
    ends.set(n.note, n.beat + n.len);
    for (let i = active.length - 1; i >= 0; i--) if (active[i].beat + active[i].len <= n.beat + 1e-6) active.splice(i, 1);
    active.push(n);
    if (active.length > MAX_CHORD_VOICES) problems.push(`more than three sounding notes at ${n.beat}`);
    if (Math.max(...active.map(n => n.note)) - Math.min(...active.map(n => n.note)) > 12) problems.push(`hand span exceeds an octave at ${n.beat}`);
  }
  if (fitToRange(chart, 48, 72) === null) problems.push('backing does not fit the standard 25-key range');
  return problems;
}
