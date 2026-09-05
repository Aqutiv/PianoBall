import type { CompEvent } from './comp';
import type { BedSpec } from './voices';

/** Peak gain of a note the game plays. A chord stab is 0.055 across three tones. */
export const NOTE_GAIN = 0.05;
/** Struck rather than swelled, in beats. */
export const NOTE_ATTACK = 0.02;

/** A written melody note uses the same pad path as a struck chord. */
export function writtenNoteEvent(note: { note: number; len: number }): CompEvent {
  return {
    offset: 0, len: note.len, notes: [note.note],
    gain: NOTE_GAIN, attack: NOTE_ATTACK, part: 'chord',
  };
}

/** A plucked stab already rings; a simultaneous wash would double its attack. */
export function soundsWithVoice(event: Pick<CompEvent, 'part'>, spec: Pick<BedSpec, 'pluck'>): boolean {
  return event.part !== 'wash' || spec.pluck === undefined;
}
