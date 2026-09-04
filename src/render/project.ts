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
  /**
   * How much larger than the design rake to draw the table. 1 is as designed;
   * the fit buys the difference by raking lower. See `fit`.
   */
  magnify: number;
}

export const DEFAULT_CAMERA: CameraOptions = {
  width: 1024,
  height: 1408,
  elevationDeg: 62,
  distance: 5250,
  fill: 0.965,
  maxZ: 90,
  magnify: 1,
};

/** How far the rake may be pushed to pay for `magnify`. */
const MIN_ELEVATION_DEG = 50;

export interface ScreenPoint { x: number; y: number }

/** The fit box as it lands on screen, in focal-length units. */
interface Extent {
  minU: number; maxU: number; minV: number; maxV: number;
  spanU: number; spanV: number;
}

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
    this.place(this.opts.elevationDeg);
  }

  configure(opts: Partial<CameraOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.place(this.opts.elevationDeg);
    this.fit(this.viewW, this.viewH);
  }

  private place(elevationDeg: number): void {
    const { width, height, distance } = this.opts;
    const el = elevationDeg * DEG;
    const ce = Math.cos(el), se = Math.sin(el);
    this.cx = width / 2;
    this.cy = height / 2 - ce * distance;
    this.cz = se * distance;
    this.fy = ce; this.fz = -se;   // forward: towards the table centre
    this.uy = se; this.uz = ce;    // up: perpendicular, pointing out of the screen top
  }

  /** Where the corners of the fit box land at a given rake, independent of placement. */
  private extent(elevationDeg: number): Extent {
    const { width, height, distance, maxZ } = this.opts;
    const el = elevationDeg * DEG;
    const ce = Math.cos(el), se = Math.sin(el);
    const cx = width / 2, cy = height / 2 - ce * distance, cz = se * distance;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const z of [0, maxZ]) {
      for (const x of [0, width]) {
        for (const y of [0, height]) {
          const vx = x - cx, vy = y - cy, vz = z - cz;
          const c = vy * ce - vz * se;
          if (c <= 1e-6) continue;
          const u = vx / c;
          const v = -(vy * se + vz * ce) / c;
          if (u < minU) minU = u; if (u > maxU) maxU = u;
          if (v < minV) minV = v; if (v > maxV) maxV = v;
        }
      }
    }
    return {
      minU, maxU, minV, maxV,
      spanU: Math.max(1e-6, maxU - minU),
      spanV: Math.max(1e-6, maxV - minV),
    };
  }

  /**
   * Solve focal length and origin so the whole table fits the viewport.
   *
   * `magnify` above 1 is paid for with rake rather than with `fill`. On a
   * landscape display the fit is bound by height, so raking lower foreshortens
   * the far end, projects the table shorter and wider, and lets everything scale
   * up — while the vertical letterbox, and with it the screen-shake headroom
   * under the near edge of the keyboard, stays exactly where it was.
   */
  fit(viewW: number, viewH: number): void {
    this.viewW = viewW;
    this.viewH = viewH;
    const { elevationDeg, fill, magnify } = this.opts;
    const focal = (e: Extent) => Math.min(viewW / e.spanU, viewH / e.spanV);

    let ext = this.extent(elevationDeg);
    let el = elevationDeg;

    if (magnify > 1) {
      const want = focal(ext) * magnify;
      const floorExt = this.extent(MIN_ELEVATION_DEG);
      if (focal(floorExt) >= want) {
        // Monotone: focal grows as the rake drops, so bisect for the least rake
        // that buys the asked-for size.
        let lo = MIN_ELEVATION_DEG, hi = elevationDeg;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (focal(this.extent(mid)) > want) lo = mid; else hi = mid;
        }
        el = (lo + hi) / 2;
        ext = this.extent(el);
      } else if (focal(floorExt) > focal(ext)) {
        // Asked for more than the rake can give. Take all of it.
        el = MIN_ELEVATION_DEG;
        ext = floorExt;
      }
      // Otherwise the viewport is portrait and the fit is bound by width, where
      // raking lower only makes the table wider and so smaller. Nothing to win:
      // stay at the design rake and let the setting be a no-op.
    }

    this.place(el);
    this.F = focal(ext) * fill;
    this.ox = viewW / 2 - ((ext.minU + ext.maxU) / 2) * this.F;
    this.oy = viewH / 2 - ((ext.minV + ext.maxV) / 2) * this.F;
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
