import type { ChartNote, Tune } from '../chart';
import { scorePart } from './classicalNotation';
import { figure } from './backingNotation';

/** Independent teaching parts, with exact rests and source-specific bass motion. */
const targets = (source: string): ChartNote[] => scorePart(source)
  .map(({ beat, len, note }) => ({ beat, len, note }));

// Beethoven's six gestures, shifted into a compact register. The first and
// returning chromatic runs stay entirely unaccompanied. E2 becomes E3 while
// A2 becomes A3; the upper tones move together by an octave. No extra chords.
export const ELISE_TARGETS = targets(
  '_/4 A3/0.5 E4/0.5 A4/0.5 _/1.5 | E3/0.5 E4/0.5 G#4/0.5 _/1.5 | '
  + 'A3/0.5 E4/0.5 A4/0.5 _/4.5 | A3/0.5 E4/0.5 A4/0.5 _/1.5 | '
  + 'E3/0.5 E4/0.5 G#4/0.5 _/1.5 | A3/0.5 E4/0.5 A4/1',
);

// Satie's upper chord is B-D-F# over G, then A-C#-F# over D. Retaining
// those triads avoids the old F#-G-B cluster. Release the simple bass first
// so the player never has to hold more than three notes or exceed an octave.
export const GYMNO_TARGETS = Array.from({ length: 10 }, (_, bar) => [
  { beat: bar * 3, len: 0.9, note: bar % 2 ? 50 : 55 },
  ...(bar % 2 ? [57, 61, 66] : [59, 62, 66])
    .map(note => ({ beat: bar * 3 + 1, len: 2, note })),
]).flat();

// Petzold's full A-section bass is already easy enough at the practice tempo.
// Only the final low G2 is raised one octave for the existing25-key course.
export const MINUET_TARGETS = targets(
  'G3+B3+D4/2 A3/1 | B3/3 | C4/3 | B3/3 | A3/3 | G3/3 | '
  + 'D4/1 B3/1 G3/1 | D4/1 D3/0.5 C4/0.5 B3/0.5 A3/0.5 | '
  + 'B3/2 A3/1 | G3/1 B3/1 G3/1 | C4/3 | B3/1 C4/0.5 B3/0.5 A3/0.5 G3/0.5 | '
  + 'A3/2 F#3/1 | G3/2 B3/1 | C4/1 D4/1 D3/1 | G3/2 G3/1',
);

// Waltz1's bass inversions are part of the identity of the passage. Retain
// the simple bass/chord/chord strikes and shell reach, but write the actual
// first bass of each source bar. The introduction bar remains silent.
const DANUBE_BASS = [
  null, 50, 50, 50, 50, 52, 52, 52, 52, 57, 57, 57, 57, 50, 50, 50,
  50, 54, 54, 54, 54, 55, 55, 55, 52, 52, 57, 50, 54, 55, 57, 50,
] as const;
export function danubeTargets(tune: Tune): ChartNote[] {
  return figure(tune, [[0, 'bass', 0.8], [1, 'shell', 0.7], [2, 'shell', 0.7]],
    { cadence: 93, start: 3 }).map(n => n.beat < 93 && n.beat % 3 === 0
    ? { ...n, note: DANUBE_BASS[n.beat / 3]! } : n);
}

// Bach's continuo pitches, compacted to C3–B3. Three regular bass pulses
// simplify the last bar's written rests; the inner answers follow its tonic
// arpeggiation and keep Em7 over D at bar6's last pulse.
const JESU_BASS = [55,55,52, 59,52,52, 57,59,48, 50,54,50,
  55,52,48, 59,52,50, 48,49,50, 55,55,50];
export function jesuTargets(tune: Tune): ChartNote[] {
  return figure(tune, [[0, 'bass', 1.8], [2, 'dyad', 0.8], [3, 'bass', 1.8],
    [5, 'dyad', 0.8], [6, 'bass', 1.8], [8, 'dyad', 0.8]], { cadence: 72 })
    .map(n => n.beat < 72 && n.beat % 3 === 0 ? { ...n, note: JESU_BASS[n.beat / 3] } : n);
}
