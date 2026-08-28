export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Semitones in an octave that are black keys. */
const BLACK = new Set([1, 3, 6, 8, 10]);

export const pitchClass = (note: number) => ((note % 12) + 12) % 12;
export const isBlackKey = (note: number) => BLACK.has(pitchClass(note));
export const octaveOf = (note: number) => Math.floor(note / 12) - 1;

export const noteName = (note: number, flat = false) =>
  (flat ? NOTE_NAMES_FLAT : NOTE_NAMES)[pitchClass(note)];

export const noteLabel = (note: number, flat = false) => `${noteName(note, flat)}${octaveOf(note)}`;

/** Equal temperament, A4 = 440 Hz. */
export const noteToFreq = (note: number, a4 = 440) => a4 * Math.pow(2, (note - 69) / 12);

/**
 * Index of a white key among the white keys, counting from C0.
 * Black keys return the index of the white key immediately below them.
 */
export function whiteIndexOf(note: number): number {
  const oct = Math.floor(note / 12);
  const pc = pitchClass(note);
  const table = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return oct * 7 + table[pc];
}

/**
 * How far a black key sits from the boundary between its neighbouring white
 * keys, in white-key widths. Real keyboards nudge them apart like this and
 * matching it keeps the on-screen keybed aligned with muscle memory.
 */
export function blackKeyNudge(note: number): number {
  switch (pitchClass(note)) {
    case 1: return -0.05;   // C#
    case 3: return 0.05;    // D#
    case 6: return -0.05;   // F#
    case 8: return 0;       // G#
    case 10: return 0.05;   // A#
    default: return 0;
  }
}
