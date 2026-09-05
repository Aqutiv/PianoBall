import type { ManualChord, ManualChordQuality } from '../../audio/bed';

export interface ManualChordPlayer {
  readonly manualChord: Readonly<ManualChord> | null;
  setManualChord(root: number, quality: ManualChordQuality, velocity: number): void;
  clearManualChord(): void;
  transposeManualChord(semitones: number): void;
}

type Role = 'lead' | 'chord' | 'ignore';

/** Owns physical key roles, separately from the chord that remains after release. */
export class ChordInput {
  private roles = new Map<number, Role>();
  private fingers = new Map<number, number>();
  private base = 0;
  private count = 0;
  private enabled = false;
  private quality: ManualChordQuality = 'maj';
  private hold = true;

  constructor(private readonly player: ManualChordPlayer) {}

  get active(): boolean { return this.enabled && this.count >= 12; }
  get heldCount(): number { return this.fingers.size; }

  isChordKey(note: number): boolean {
    return this.active && note >= this.base && note < this.base + 12;
  }

  configure(enabled: boolean, quality: ManualChordQuality, hold: boolean): void {
    if (enabled !== this.enabled) this.stop();
    const changedQuality = quality !== this.quality;
    this.enabled = enabled;
    this.quality = quality;
    this.hold = hold;
    if (!hold && !this.fingers.size) this.player.clearManualChord();
    const chord = this.player.manualChord;
    if (changedQuality && chord) this.player.setManualChord(chord.root, quality, chord.velocity);
  }

  remap(base: number, count: number): void {
    if (base === this.base && count === this.count) return;
    this.endGesture();
    if (count !== this.count || !this.hold) this.player.clearManualChord();
    else this.player.transposeManualChord(base - this.base);
    this.base = base;
    this.count = count;
  }

  noteOn(note: number, velocity: number): Role {
    // A held key must be released before a mode/split change can give it a new job.
    if (this.roles.has(note)) return 'ignore';
    const role = this.isChordKey(note) ? 'chord' : 'lead';
    this.roles.set(note, role);
    if (role === 'chord') {
      this.fingers.set(note, velocity);
      const root = Math.min(...this.fingers.keys());
      const quality = this.fingers.size === 1 ? this.quality
        : this.fingers.size === 2 ? 'min'
        : this.fingers.size === 3 ? 'dom7' : 'min7';
      this.player.setManualChord(root, quality, this.fingers.get(root)!);
    }
    return role;
  }

  noteOff(note: number): Role {
    const role = this.roles.get(note) ?? 'ignore';
    this.roles.delete(note);
    if (this.fingers.delete(note) && !this.fingers.size && !this.hold) {
      this.player.clearManualChord();
    }
    // Never reinterpret a release as a smaller chord while fingers lift.
    return role;
  }

  stop(): void {
    this.endGesture();
    this.player.clearManualChord();
  }

  /** Global all-keys-up, after the mode's lead voices have also been released. */
  reset(): void {
    this.stop();
    this.roles.clear();
  }

  private endGesture(): void {
    for (const [note, role] of this.roles) if (role === 'chord') this.roles.set(note, 'ignore');
    this.fingers.clear();
  }
}
