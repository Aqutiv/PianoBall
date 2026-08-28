import type { Collider } from './colliders';

/**
 * Uniform-grid broadphase over the static table. Built once when a table is
 * loaded; queried with the swept AABB of a moving ball.
 */
export class SpatialGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cell: number;
  private readonly buckets: Collider[][];
  /** Per-collider stamp used to de-duplicate results without allocating a Set. */
  private readonly stamps = new Map<number, number>();
  private queryId = 0;

  constructor(width: number, height: number, cell = 72) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.buckets = new Array(this.cols * this.rows);
    for (let i = 0; i < this.buckets.length; i++) this.buckets[i] = [];
  }

  clear(): void {
    for (const b of this.buckets) b.length = 0;
    this.stamps.clear();
  }

  insert(s: Collider): void {
    const bb = s.aabb;
    const x0 = this.clampCol(Math.floor(bb.minX / this.cell));
    const x1 = this.clampCol(Math.floor(bb.maxX / this.cell));
    const y0 = this.clampRow(Math.floor(bb.minY / this.cell));
    const y1 = this.clampRow(Math.floor(bb.maxY / this.cell));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.buckets[y * this.cols + x].push(s);
    }
  }

  /** Appends every collider whose cell overlaps the box into `out` (no duplicates). */
  query(minX: number, minY: number, maxX: number, maxY: number, out: Collider[]): Collider[] {
    out.length = 0;
    const id = ++this.queryId;
    const x0 = this.clampCol(Math.floor(minX / this.cell));
    const x1 = this.clampCol(Math.floor(maxX / this.cell));
    const y0 = this.clampRow(Math.floor(minY / this.cell));
    const y1 = this.clampRow(Math.floor(maxY / this.cell));
    for (let y = y0; y <= y1; y++) {
      const row = y * this.cols;
      for (let x = x0; x <= x1; x++) {
        const bucket = this.buckets[row + x];
        for (let i = 0; i < bucket.length; i++) {
          const s = bucket[i];
          if (this.stamps.get(s.id) === id) continue;
          this.stamps.set(s.id, id);
          out.push(s);
        }
      }
    }
    return out;
  }

  private clampCol(v: number) { return v < 0 ? 0 : v >= this.cols ? this.cols - 1 : v; }
  private clampRow(v: number) { return v < 0 ? 0 : v >= this.rows ? this.rows - 1 : v; }
}
