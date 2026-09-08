import type { ChartNote } from '../chart';
import { score, scoreBars, type ScoreStrike } from './performanceNotation';

type Bar = readonly ScoreStrike[];

// First Light keeps an audible quarter-note pulse, but the register, strength
// and closing gestures follow its four small phrases. Am waits until the held
// F has finished instead of introducing an exposed E underneath it.
const LIGHT_VOICES = [
  [[38, 50], [53, 57]], [[38, 50], [53, 57]],
  [[41, 53], [57, 60]], [[41, 53], [57, 60]],
  [[45, 57], [52, 60]], [[45, 57], [52, 60]],
  [[38, 50], [53, 57]], [[38, 50], [53, 57]],
] as const;
export const LIGHT_BACKING = scoreBars(LIGHT_VOICES.map(([bass, upper], bar): Bar => {
  if (bar === 7) return [[0, 4, [...bass, ...upper], 0.55]];
  const out: ScoreStrike[] = [[0, 4, bass, 0.52]];
  for (let beat = 0; beat < 4; beat++) {
    const notes = (bar === 1 || bar === 5) && beat >= 2 ? [53, 57, 60] : upper;
    out.push([beat, 0.9, notes, [0.42, 0.32, 0.36, 0.3][beat], 0.82]);
  }
  // Harmony changes from Dm to F and from Am to F halfway through their held answers.
  if (bar === 1 || bar === 5) {
    out[0] = [0, 2, bass, 0.52];
    out.push([2, 2, 41, 0.48]);
  }
  return out;
}), 4);

// An ambient sustained score: common tones persist through an entire phrase.
// Wide bass spacing leaves the intentional F-to-E appoggiatura room to resolve.
const DRIFT_STRIKES: ScoreStrike[] = [
  [0, 8, [38, 53, 57], 0.43],
  [8, 8, [41, 57, 60], 0.45],
  [16, 8, [40, 57, 59], 0.39],
  [24, 8, [38, 53, 57, 60], 0.45],
  [32, 4, [45, 52, 60], 0.49],
  [36, 4, [41, 57, 60], 0.46],
  [40, 8, [40, 57, 59], 0.42],
  [48, 4, [38, 53, 57], 0.43],
  [52, 4, [45, 52, 60], 0.4],
  [56, 8, [38, 50, 53, 57], 0.4],
];
export const DRIFT_BACKING: ChartNote[] = score(DRIFT_STRIKES)
  .map(n => ({ ...n, attack: 0.7, soundingLen: n.len }));

// Bass and individually chosen inner voices for the eight-bar sentence. The
// second statement is quieter and lower while the player's new voice arrives.
const HANDS_BARS: Bar[] = [
  [[0, 4, 38, 0.56], [0.5, 1.4, 53, 0.42], [1.5, 1.4, 57, 0.38], [2.5, 1.4, 50, 0.38]],
  [[0, 2, 43, 0.55], [0.5, 1.4, [50, 58], 0.4], [2, 2, 48, 0.52], [2.5, 1.4, [52, 55], 0.38]],
  [[0, 2, 46, 0.56], [0.5, 1.4, [50, 53], 0.4], [2, 2, 41, 0.54], [2.5, 1.4, [53, 57], 0.4]],
  [[0, 2, 43, 0.52], [0.5, 1.4, [50, 58], 0.38], [2, 2, [38, 53, 57], 0.46]],
  [[0, 2, 38, 0.58], [0.5, 1.4, [53, 57], 0.42], [2, 2, 46, 0.56], [2.5, 1.4, [50, 53], 0.4]],
  [[0, 2, 46, 0.57], [0.5, 1.4, [50, 53], 0.42], [2, 2, 43, 0.53], [2.5, 1.4, [50, 58], 0.38]],
  [[0, 2, 45, 0.55], [0.5, 1.4, [52, 60], 0.4], [2, 2, 41, 0.51], [2.5, 1.4, [53, 57], 0.37]],
  [[0, 2, [45, 52, 60], 0.46], [2, 2, [38, 50, 53, 57], 0.5]],
];
export const HANDS_BACKING = [
  ...scoreBars(HANDS_BARS, 4),
  ...scoreBars(HANDS_BARS, 4, 32).map(n => ({
    ...n, note: n.note >= 57 ? n.note - 12 : n.note, gain: (n.gain ?? 0.03) * 0.82,
  })),
].sort((a, b) => a.beat - b.beat || a.note - b.note);

// Ground: I-I-V7-V7-I-V7-V7-I. Root/fifth practice remains easy, and the
// melody's F is heard as the dominant seventh instead of an unexplained clash.
export const GROUND_BACKING = scoreBars([
  [[0, 4, 36, 0.5], [0, 4, [52, 55], 0.34]],
  [[0, 4, 43, 0.48], [0, 4, [48, 52], 0.33]],
  [[0, 4, 43, 0.51], [0, 4, [47, 53], 0.34]],
  [[0, 4, 50, 0.48], [0, 4, [47, 53, 55], 0.32]],
  [[0, 4, 48, 0.53], [0, 4, [52, 55], 0.35]],
  [[0, 4, 43, 0.51], [0, 4, [47, 50], 0.34]],
  [[0, 4, 43, 0.5], [0, 4, [50, 53], 0.32]],
  [[0, 4, [36, 48, 52, 55], 0.49]],
], 4);

// Off the Beat is deliberately a dance lesson: bass on the strong beats,
// lighter chord answers on the weak beats, and a single final ensemble chord.
const OFFBEAT_VOICES = [
  [36, 43, [52, 55, 60]], [41, 48, [53, 57, 60]],
  [43, 50, [50, 55, 59]], [36, 43, [52, 55, 60]],
  [36, 43, [52, 55, 60]], [41, 48, [53, 57, 60]],
  [43, 50, [50, 55, 59]], [36, 43, [52, 55, 60]],
] as const;
export const OFFBEAT_BACKING = scoreBars(OFFBEAT_VOICES.map(([root, fifth, chord], bar): Bar =>
  bar === 7 ? [[0, 4, [root, ...chord], 0.53]] : [
    [0, 0.9, root, 0.56], [1, 0.75, chord, 0.4, 0.65],
    [2, 0.9, fifth, 0.5], [3, 0.75, chord, 0.36, 0.6],
  ]), 4);
