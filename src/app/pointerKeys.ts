/** What a mode reports about the key under a pointer. */
export interface KeyHit {
  note: number;
  /** How hard the touch strikes it, 0..1. */
  force: number;
}

interface Contact {
  /** The note this finger is holding, or null while it rests off the keys. */
  note: number | null;
  /** The key layout the finger came down on. */
  rev: number;
}

/**
 * Fingers on the on-screen keys.
 *
 * The shell used to keep one note per pointer and release it when that pointer
 * lifted. Two fingers on the same key broke that: lifting either one released
 * the note while the other was still holding it down. Here every contact is
 * counted, so a note is let go only when the last finger on it leaves — and
 * every new contact still strikes again, the way a second key on the computer
 * keyboard re-strikes a note already sounding.
 *
 * A finger can also slide. Moving onto another key plays that key and lets the
 * last one go; moving off the keys lets go and moving back on plays again,
 * which is what makes a glissando. A finger that came down before the keys
 * moved under it (a rotation, a new range) keeps its note until it lifts but
 * stops sliding, since the key it is over is no longer the key it struck.
 *
 * Pure bookkeeping: the press and release callbacks are the only way out, so
 * it is testable without a canvas.
 */
export class PointerKeys {
  private readonly contacts = new Map<number, Contact>();
  private readonly holds = new Map<number, number>();

  constructor(
    private readonly press: (note: number, force: number) => void,
    private readonly release: (note: number) => void,
  ) {}

  /** Fingers currently on the keys. */
  get size(): number { return this.contacts.size; }

  has(id: number): boolean { return this.contacts.has(id); }

  /**
   * A pointer came down. Returns whether it landed on a key, which is when the
   * caller should capture it.
   */
  down(id: number, hit: KeyHit | null, rev: number): boolean {
    // A pointer id is only reused after its `up`, but a lost event must not
    // leave a note held forever.
    if (this.contacts.has(id)) this.up(id);
    if (!hit) return false;
    this.contacts.set(id, { note: hit.note, rev });
    this.hold(hit.note, hit.force);
    return true;
  }

  /** A captured pointer moved, now over `hit`. */
  move(id: number, hit: KeyHit | null, rev: number): void {
    const c = this.contacts.get(id);
    if (!c || c.rev !== rev) return;
    const next = hit ? hit.note : null;
    if (next === c.note) return;
    if (c.note !== null) this.letGo(c.note);
    c.note = next;
    if (hit) this.hold(hit.note, hit.force);
  }

  /** A pointer lifted, was cancelled, or lost its capture. */
  up(id: number): void {
    const c = this.contacts.get(id);
    if (!c) return;
    this.contacts.delete(id);
    if (c.note !== null) this.letGo(c.note);
  }

  /** Lift every finger at once: a pause, a menu, a change of mode. */
  cancelAll(): void {
    const notes = [...this.contacts.values()].map((c) => c.note);
    this.contacts.clear();
    for (const note of notes) if (note !== null) this.letGo(note);
  }

  private hold(note: number, force: number): void {
    this.holds.set(note, (this.holds.get(note) ?? 0) + 1);
    this.press(note, force);
  }

  private letGo(note: number): void {
    const left = (this.holds.get(note) ?? 1) - 1;
    if (left > 0) {
      this.holds.set(note, left);
      return;
    }
    this.holds.delete(note);
    this.release(note);
  }
}
