import { DEG } from '../core/math';

export interface CameraOptions {
  /** Table dimensions in table units. */
  width: number;
  height: number;
  /** 90 = straight top-down. Lower values rake the table towards the viewer. */
  elevationDeg: number;
  /** Camera distance from the table centre. Larger = flatter, less perspective. */
  distance: number;
  /** Fraction of the viewport the table should occupy. */
  fill: number;
  /** Tallest object on the table, so the fit leaves room for extrusions. */
  maxZ: number;
}

export const DEFAULT_CAMERA: CameraOptions = {
  width: 1024,
  height: 1408,
  elevationDeg: 62,
  distance: 5250,
  fill: 0.965,
  maxZ: 90,
};

export interface ScreenPoint { x: number; y: number }

/**
 * Pinhole camera looking down at a flat table.
 *
 * The simulation stays perfectly 2D; this is the only place depth exists. Table
 * space is x right, y away from the viewer, z up out of the playfield, so
 * anything with height simply lifts up-screen and can draw its own side walls.
 */
export class TableCamera {
  opts: CameraOptions;

  /** Camera position in table space. */
  private cx = 0; private cy = 0; private cz = 0;
  /** Forward and up basis vectors (right is always world +x for a level camera). */
  private fy = 0; private fz = 0;
  private uy = 0; private uz = 0;
  /** Focal length in pixels and screen origin. */
  private F = 1; private ox = 0; private oy = 0;

  viewW = 1; viewH = 1;

  constructor(opts: Partial<CameraOptions> = {}) {
    this.opts = { ...DEFAULT_CAMERA, ...opts };
    this.place();
  }

  configure(opts: Partial<CameraOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.place();
    this.fit(this.viewW, this.viewH);
  }

  private place(): void {
    const { width, height, elevationDeg, distance } = this.opts;
    const el = elevationDeg * DEG;
    const ce = Math.cos(el), se = Math.sin(el);
    this.cx = width / 2;
    this.cy = height / 2 - ce * distance;
    this.cz = se * distance;
    this.fy = ce; this.fz = -se;   // forward: towards the table centre
    this.uy = se; this.uz = ce;    // up: perpendicular, pointing out of the screen top
  }

  /** Solve focal length and origin so the whole table fits the viewport. */
  fit(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    const { width, height, maxZ, fill } = this.opts;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const z of [0, maxZ]) {
      for (const x of [0, width]) {
        for (const y of [0, height]) {
          const vx = x - this.cx, vy = y - this.cy, vz = z - this.cz;
          const c = vy * this.fy + vz * this.fz;
          if (c <= 1e-6) continue;
          const u = vx / c;
          const v = -(vy * this.uy + vz * this.uz) / c;
          if (u < minU) minU = u; if (u > maxU) maxU = u;
          if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
      }
    }

    const spanU = Math.max(1e-6, maxU - minU);
    const spanV = Math.max(1e-6, maxV - minV);
    this.F = Math.min(viewW / spanU, viewH / spanV) * fill;
    this.ox = viewW / 2 - ((minU + maxU) / 2) * this.F;
    this.oy = viewH / 2 - ((minV + maxV) / 2) * this.F;
  }

  /** Table space -> screen pixels. Writes into `out` to stay allocation-free. */
  project(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
    const vx = x - this.cx, vy = y - this.cy, vz = z - this.cz;
    const c = Math.max(1e-4, vy * this.fy + vz * this.fz);
    out.x = this.ox + (vx / c) * this.F;
    out.y = this.oy - ((vy * this.uy + vz * this.uz) / c) * this.F;
    return out;
  }

  /** Pixels per table unit of horizontal extent at a given point. */
  scaleAt(_x: number, y: number, z = 0): number {
    const vy = y - this.cy, vz = z - this.cz;
    return this.F / Math.max(1e-4, vy * this.fy + vz * this.fz);
  }

  /** Screen pixels -> the table plane at height `z`. Used for pointer input. */
  unproject(sx: number, sy: number, z = 0): { x: number; y: number } {
    const u = (sx - this.ox) / this.F;
    const v = -(sy - this.oy) / this.F;
    // Ray direction in table space: right*u + up*v + forward.
    const dx = u;
    const dy = v * this.uy + this.fy;
    const dz = v * this.uz + this.fz;
    const t = Math.abs(dz) < 1e-9 ? 0 : (z - this.cz) / dz;
    return { x: this.cx + dx * t, y: this.cy + dy * t };
  }
}
