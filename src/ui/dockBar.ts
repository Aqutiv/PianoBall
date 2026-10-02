import { PIANO_WHITES, mapFraction, noteAtFraction } from '../game/dock';
import { isBlackKey, noteLabel } from '../midi/notes';

/** What the bar moves, and how far it can go. */
export interface DockBarHost {
  /** The keys on screen. */
  range(): { low: number; high: number; canDown: boolean; canUp: boolean };
  /** Move the keys an octave down (-1) or up (1). */
  shift(dir: number): void;
  /** Bring the keys as near as whole octaves allow to a note dragged to on the strip. */
  centreOn(note: number): void;
}

/**
 * The strip above Freestyle's keyboard: an octave down, the whole piano in
 * miniature with the keys on screen lit on it, and an octave up.
 *
 * A finger can drag the lit window along the miniature to jump anywhere on
 * the piano, and the arrow keys step it an octave at a time when it has focus.
 * Either way the keyboard only ever moves by whole octaves, so a C stays a C
 * under the finger.
 */
export class DockBar {
  private readonly down: HTMLButtonElement;
  private readonly up: HTMLButtonElement;
  private readonly strip: HTMLElement;
  private readonly window: HTMLElement;
  private readonly label: HTMLElement;
  private dragging: number | null = null;
  private lastNote = -1;
  private shown = '';

  constructor(private readonly root: HTMLElement, private readonly host: DockBarHost) {
    // Every white key of the piano, with its Cs a shade brighter to read by.
    let keys = '';
    for (let n = 21; n <= 108; n++) if (!isBlackKey(n)) keys += n % 12 === 0 ? '<i class="c"></i>' : '<i></i>';
    root.innerHTML = `
      <button type="button" class="dock-oct" id="dock-down" aria-label="Keys down an octave">−</button>
      <div class="dock-strip" id="dock-strip" role="slider" tabindex="0" aria-label="Keyboard range"
        aria-valuemin="21" aria-valuemax="108">${keys}<div class="dock-window"><span id="dock-label"></span></div></div>
      <button type="button" class="dock-oct" id="dock-up" aria-label="Keys up an octave">+</button>
    `;
    const q = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.down = q<HTMLButtonElement>('#dock-down');
    this.up = q<HTMLButtonElement>('#dock-up');
    this.strip = q('#dock-strip');
    this.window = q('.dock-window');
    this.label = q('#dock-label');

    this.down.addEventListener('click', (e) => this.step(-1, e));
    this.up.addEventListener('click', (e) => this.step(1, e));
    this.strip.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1
        : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      this.host.shift(dir);
      this.sync();
    });
    this.strip.addEventListener('pointerdown', (e) => {
      this.dragging = e.pointerId;
      this.lastNote = -1;
      try { this.strip.setPointerCapture(e.pointerId); } catch { /* still drags inside the strip */ }
      this.dragTo(e.clientX);
      e.preventDefault();
    });
    this.strip.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.dragging) this.dragTo(e.clientX);
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.dragging) this.dragging = null; };
    this.strip.addEventListener('pointerup', end);
    this.strip.addEventListener('pointercancel', end);
    this.strip.addEventListener('lostpointercapture', end);
    root.hidden = false;
    this.sync();
  }

  /** Bring the strip up to date with the keys on screen. Cheap when nothing moved. */
  sync(): void {
    const r = this.host.range();
    const key = `${r.low}-${r.high}-${r.canDown}-${r.canUp}`;
    if (key === this.shown) return;
    this.shown = key;
    const left = mapFraction(r.low);
    const right = mapFraction(r.high);
    const cell = 100 / PIANO_WHITES;
    this.window.style.left = `${left * (100 - cell)}%`;
    this.window.style.width = `${(right - left) * (100 - cell) + cell}%`;
    const text = `${noteLabel(r.low)}–${noteLabel(r.high)}`;
    this.label.textContent = text;
    this.strip.setAttribute('aria-valuenow', String(r.low));
    this.strip.setAttribute('aria-valuetext', text.replace('–', ' to '));
    this.down.disabled = !r.canDown;
    this.up.disabled = !r.canUp;
  }

  destroy(): void {
    this.root.innerHTML = '';
    this.root.hidden = true;
  }

  private step(dir: number, e: MouseEvent): void {
    this.host.shift(dir);
    this.sync();
    // Leave the computer keyboard available for playing after a click.
    if (e.detail > 0) (e.currentTarget as HTMLElement).blur();
  }

  private dragTo(clientX: number): void {
    const rect = this.strip.getBoundingClientRect();
    if (rect.width <= 0) return;
    const note = noteAtFraction((clientX - rect.left) / rect.width);
    if (note === this.lastNote) return;
    this.lastNote = note;
    this.host.centreOn(note);
    this.sync();
  }
}
