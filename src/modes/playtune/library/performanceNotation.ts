import type { ChartNote } from '../chart';

/** An explicitly voiced score event, never a chord-symbol realization. */
export type ScoreStrike = readonly [
  beat: number, len: number, pitches: number | readonly number[],
  strength?: number, soundingLen?: number,
];

/** Written strength is 0-1; emitted gain is a quiet linear synth peak. */
export function score(strikes: readonly ScoreStrike[], start = 0): ChartNote[] {
  return strikes.flatMap(([beat, len, pitches, strength = 0.65, soundingLen = len]) =>
    (typeof pitches === 'number' ? [pitches] : pitches).map(note => ({
      beat: start + beat, len, note, gain: strength * 0.05, soundingLen,
    }))).sort((a, b) => a.beat - b.beat || a.note - b.note);
}

/** Bar positions are explicit, including completely silent bars. */
export function scoreBars(bars: readonly (readonly ScoreStrike[])[], beatsPerBar: number, start = 0): ChartNote[] {
  return bars.flatMap((bar, i) => score(bar, start + i * beatsPerBar));
}

/** Phrase strengths for a computer-played melody; never alter graded holds. */
export function melodyPerformance(notes: ChartNote[], points: readonly (readonly [number, number])[], gate = 0.94, attack = 0.012): ChartNote[] {
  return notes.map(n => {
    let strength = points[0]?.[1] ?? 0.8;
    for (let i = 1; i < points.length; i++) {
      const [from, a] = points[i - 1], [to, b] = points[i];
      if (n.beat >= to) strength = b;
      else if (n.beat >= from) { strength = a + (b - a) * (n.beat - from) / (to - from); break; }
    }
    const soundingLen = n.len > 1 ? n.len : n.len * gate;
    return { ...n, gain: 0.05 * strength, attack: Math.min(attack, soundingLen), soundingLen };
  });
}
