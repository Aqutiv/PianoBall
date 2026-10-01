import type { KeyHit } from '../app/pointerKeys';
import { dockForce, dockFrame, layoutDock, pickDock, type DockLayout, type DockRowSpec } from '../game/dock';
import type { Hud } from '../ui/hud';
import type { Stage } from './stage';

/** Header heights, in CSS pixels: the strip above the keys for captions and the octave bar. */
export interface DockHeader { touch: number; desk: number }

const rowsKey = (rows: readonly DockRowSpec[]) => rows.map((r) => `${r.low}-${r.high}`).join(',');

/**
 * One music mode's docked keyboard: which rows it holds, where they sit on the
 * current screen, and what is under a finger.
 *
 * The layout is worked out lazily from the stage's size and cached until the
 * size, the rows or the kind of device changes, so a mode can ask for it from
 * input handlers and from the frame alike. Every time the keys actually move,
 * `revision` goes up, which is how a finger held across a rotation knows to
 * stop sliding.
 */
export class DockView {
  /** Bumped whenever the keys move on screen. */
  revision = 0;
  /** Lay out for fingers rather than for a mouse. */
  touch = false;

  private rows: DockRowSpec[] = [{ low: 48, high: 79 }];
  private cached: DockLayout | null = null;
  private cachedFor = '';
  private published = '';

  constructor(
    private readonly stage: Stage,
    private readonly hud: Hud,
    private readonly header: DockHeader,
  ) {}

  /** The rows the keyboard holds, from the top of the screen down. */
  get rowSpecs(): readonly DockRowSpec[] { return this.rows; }

  setRows(rows: readonly DockRowSpec[]): void {
    if (rowsKey(rows) === rowsKey(this.rows)) return;
    this.rows = rows.map((r) => ({ ...r }));
  }

  setTouch(touch: boolean): void { this.touch = touch; }

  /** Where everything is on the current screen. */
  layout(): DockLayout {
    const { cssW, cssH } = this.stage;
    const key = `${cssW}x${cssH}|${this.touch}|${rowsKey(this.rows)}`;
    if (this.cached && this.cachedFor === key) return this.cached;
    const frame = dockFrame(cssW, cssH, {
      rows: this.rows.length > 1 ? 2 : 1,
      touch: this.touch,
      header: this.touch ? this.header.touch : this.header.desk,
    });
    const before = this.cached?.key;
    this.cached = layoutDock(frame, this.rows);
    this.cachedFor = key;
    if (before !== this.cached.key) this.revision++;
    return this.cached;
  }

  /** The key under a canvas point, and how hard a tap there strikes it. */
  keyAt(x: number, y: number, moving: boolean): KeyHit | null {
    const k = pickDock(this.layout(), x, y, moving ? 24 : 6);
    return k ? { note: k.note, force: dockForce(k, y) } : null;
  }

  /** Centre of a note's lane on screen, or null if the note is not on the keyboard. */
  laneX(note: number): number | null {
    return this.layout().byNote.get(note)?.laneX ?? null;
  }

  /**
   * Tell the page where the keys are, so its panels stay clear of them. Only
   * when the layout actually moved: this is called every frame.
   */
  publish(): void {
    const l = this.layout();
    if (l.key === this.published) return;
    this.published = l.key;
    this.hud.setDock({ top: l.top, keysTop: l.keysTop, bottom: l.bottom, left: l.left, right: l.right });
  }

  /** Forget what was published. The HUD clears its copy when a mode hands over. */
  forget(): void { this.published = ''; }
}
