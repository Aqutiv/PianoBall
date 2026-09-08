import type { ChartNote } from '../chart';

/** Nominal linear note level; expression arguments below remain normalized. */
const NOTE_GAIN = 0.05;

/** Compact, absolute score notation: C4/1, C4+E4/2, _/0.5; | only separates bars. */
export function scorePart(source: string, start = 0, gain = 0.8, gate = 1): ChartNote[] {
  const natural: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let beat = start;
  const notes: ChartNote[] = [];
  for (const token of source.trim().split(/\s+/).filter(t => t !== '|')) {
    const [pitches, duration] = token.split('/');
    const len = Number(duration);
    if (!Number.isFinite(len) || len <= 0) throw new Error(`Invalid score duration: ${token}`);
    if (pitches !== '_') {
      for (const pitch of pitches.split('+')) {
        const m = /^([A-G])([#b]?)(-?\d)$/.exec(pitch);
        if (!m) throw new Error(`Invalid score pitch: ${pitch}`);
        const note = 12 * (Number(m[3]) + 1) + natural[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        notes.push({ beat, len, note, gain: gain * NOTE_GAIN, attack: 0.012, soundingLen: len * gate });
      }
    }
    beat += len;
  }
  return notes.sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** Dynamics follow authored phrase points without moving score onsets. */
export function phraseDynamics(notes: ChartNote[], points: readonly (readonly [number, number])[]): ChartNote[] {
  return notes.map(n => {
    let value = points[0]?.[1] ?? 1;
    for (let i = 1; i < points.length; i++) {
      const [from, a] = points[i - 1];
      const [to, b] = points[i];
      if (n.beat >= to) value = b;
      else if (n.beat >= from) { value = a + (b - a) * (n.beat - from) / (to - from); break; }
    }
    return { ...n, gain: Math.min(1, (n.gain ?? NOTE_GAIN) * value) };
  });
}

/** Sustain one harmonic gesture, lifting before the next bar's harmony. */
export function pedalBars(notes: ChartNote[], beatsPerBar: number, pickup = 0, end = Infinity): ChartNote[] {
  return notes.map(n => ({ ...n, soundingLen: Math.max(n.len,
    Math.min(end, pickup + (Math.floor((n.beat - pickup) / beatsPerBar) + 1) * beatsPerBar) - n.beat - 0.08) }));
}
