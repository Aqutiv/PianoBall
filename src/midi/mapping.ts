import { load, save } from '../core/storage';

export interface MappingSettings {
  /** MIDI note of the leftmost key on the controller. */
  baseNote: number;
  /** Number of keys. */
  count: number;
  /** Shift the window automatically when a note arrives outside it. */
  autoLatch: boolean;
}

/** Sensible default for a 32-key controller sitting at its factory octave. */
export const DEFAULT_MAPPING: MappingSettings = {
  baseNote: 48,
  count: 32,
  autoLatch: true,
};

export type CalibrationPhase = 'idle' | 'low' | 'high' | 'done';

/**
 * Maps incoming MIDI notes onto keybed lanes.
 *
 * The octave buttons on most controllers silently transpose everything they
 * send, which would otherwise slide the whole table sideways. Notes outside the
 * mapped window re-latch it by whole octaves, and an explicit two-press
 * calibration handles controllers of any size.
 */
export class NoteMapping {
  settings: MappingSettings;
  /** Lowest and highest notes seen this session, for the settings panel. */
  observedLow = 127;
  observedHigh = 0;
  /** Bumped whenever the window moves, so the keybed knows to rebuild. */
  revision = 0;

  phase: CalibrationPhase = 'idle';
  private calLow = 0;

  constructor(settings?: Partial<MappingSettings>) {
    this.settings = { ...DEFAULT_MAPPING, ...load('mapping', {}), ...settings };
  }

  get low(): number { return this.settings.baseNote; }
  get high(): number { return this.settings.baseNote + this.settings.count - 1; }

  /** Lane index for a note, or -1 when it falls outside the mapped window. */
  laneFor(note: number): number {
    const lane = note - this.settings.baseNote;
    return lane >= 0 && lane < this.settings.count ? lane : -1;
  }

  /**
   * Called for every incoming note. Returns true when the window moved, which
   * means the caller should rebuild the keybed before using the lane.
   */
  observe(note: number): boolean {
    if (note < this.observedLow) this.observedLow = note;
    if (note > this.observedHigh) this.observedHigh = note;
    // Calibration is on its way to setting the window explicitly. Latching it
    // around each press in the meantime just makes the keybed jump about while
    // the player is still being asked for their second key.
    if (this.phase !== 'idle' || !this.settings.autoLatch) return false;

    const { baseNote, count } = this.settings;
    if (note >= baseNote && note < baseNote + count) return false;

    // Move by whole octaves only: that is exactly what an octave button does.
    let base = baseNote;
    while (note < base) base -= 12;
    while (note >= base + count) base += 12;
    if (base === baseNote) return false;
    this.settings.baseNote = base;
    this.revision++;
    this.persist();
    return true;
  }

  shiftOctave(dir: number): void {
    this.settings.baseNote = Math.max(0, Math.min(127 - this.settings.count, this.settings.baseNote + dir * 12));
    this.revision++;
    this.persist();
  }

  /** Two-press calibration: lowest key, then highest. */
  beginCalibration(): void {
    this.phase = 'low';
    this.calLow = 0;
  }

  /** Feed a note during calibration. Returns the phase after handling it. */
  calibrate(note: number): CalibrationPhase {
    if (this.phase === 'low') {
      this.calLow = note;
      this.phase = 'high';
    } else if (this.phase === 'high') {
      const lo = Math.min(this.calLow, note);
      const hi = Math.max(this.calLow, note);
      if (hi - lo >= 6) {
        this.settings.baseNote = lo;
        this.settings.count = hi - lo + 1;
        this.revision++;
        this.persist();
      }
      this.phase = 'done';
    }
    return this.phase;
  }

  cancelCalibration(): void { this.phase = 'idle'; }

  resetSettings(): void {
    this.settings = { ...DEFAULT_MAPPING };
    this.observedLow = 127;
    this.observedHigh = 0;
    this.phase = 'idle';
    this.revision++;
    this.persist();
  }

  persist(): void { save('mapping', this.settings); }
}
