import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, TableCamera } from '../src/render/project';
import { AURORA } from '../src/game/table/tables/aurora';
import { DEFAULT_KEYBED } from '../src/game/keyLayout';
import { TABLE_SIZE, backingDensity } from '../src/render/stage';

const LANDSCAPE = { w: 1920, h: 1080 };
const KEYBED = { ...DEFAULT_KEYBED, ...AURORA.keybed };

function fitted(magnify: number, w = LANDSCAPE.w, h = LANDSCAPE.h): TableCamera {
  const cam = new TableCamera({ width: AURORA.width, height: AURORA.height, magnify });
  cam.fit(w, h);
  return cam;
}

/**
 * The focal length, up to a constant.
 *
 * At the table centre the depth along the view axis is exactly the camera
 * distance whatever the rake, so this reads the fit itself rather than the
 * perspective at some particular spot on the table.
 */
function focalScale(cam: TableCamera): number {
  return cam.scaleAt(0, AURORA.height / 2, 0);
}

/** Pixels per table unit across the middle of the keybed. */
function keyScale(cam: TableCamera): number {
  return cam.scaleAt(KEYBED.left, KEYBED.baseY, 13);
}

describe('the table camera', () => {
  it('leaves the framing exactly as designed at the default size', () => {
    const cam = fitted(1);

    expect(cam.opts.magnify).toBe(DEFAULT_CAMERA.magnify);
    // The rake is untouched, so every projected point is where it always was.
    const p = cam.project(AURORA.width / 2, 0, 0, { x: 0, y: 0 });
    const ref = new TableCamera({ width: AURORA.width, height: AURORA.height });
    ref.fit(LANDSCAPE.w, LANDSCAPE.h);
    expect(p).toEqual(ref.project(AURORA.width / 2, 0, 0, { x: 0, y: 0 }));
  });

  it('draws the table as much larger as it was asked to', () => {
    const base = focalScale(fitted(1));

    for (const m of [1.05, 1.1, TABLE_SIZE.max]) {
      expect(focalScale(fitted(m)) / base, `magnify ${m}`).toBeCloseTo(m, 3);
    }
  });

  it('hands the keyboard at least the size the table got', () => {
    const base = keyScale(fitted(1));

    // The keybed sits nearer than the focal plane, so the rake that pays for the
    // size gives the keys a little more of it and the far end a little less.
    for (const m of [1.05, 1.1, TABLE_SIZE.max]) {
      const got = keyScale(fitted(m)) / base;
      expect(got, `magnify ${m}`).toBeGreaterThanOrEqual(m);
      expect(got, `magnify ${m}`).toBeLessThan(m * 1.05);
    }
  });

  it('finds the best rake on a squarish viewport, not the one at the floor', () => {
    // Here the fit stops being bound by height partway down the range, so the
    // focal length peaks in the middle: raking to the floor overshoots and ends
    // up smaller than a rake the viewport could actually have had.
    const square = { w: 900, h: 1000 };
    const base = focalScale(fitted(1, square.w, square.h));

    expect(focalScale(fitted(1.04, square.w, square.h)) / base).toBeGreaterThanOrEqual(1.04);
  });

  it('offers no more size than the rake can actually deliver', () => {
    // Every step of the control has to move something, so the top of the range
    // must stay inside what raking can buy on a display bound by height.
    const base = focalScale(fitted(1));
    const atMax = focalScale(fitted(TABLE_SIZE.max));

    expect(focalScale(fitted(TABLE_SIZE.max - TABLE_SIZE.step))).toBeLessThan(atMax);
    expect(atMax / base).toBeGreaterThanOrEqual(TABLE_SIZE.max);
  });

  it('buys the size with rake rather than by cropping the keyboard', () => {
    // The near edge of the outermost key, which is the first thing a crop would
    // take, and the shake that has to stay clear of the bottom of the screen.
    const nearY = KEYBED.baseY - KEYBED.crown - KEYBED.whiteDepth;
    const gap = (m: number) =>
      LANDSCAPE.h - fitted(m).project(KEYBED.left, nearY, 0, { x: 0, y: 0 }).y;

    // Raking lower lifts that edge if anything; it never eats into the reserve.
    expect(gap(TABLE_SIZE.max)).toBeGreaterThanOrEqual(gap(1));
    expect(gap(TABLE_SIZE.max)).toBeGreaterThan(13);
  });

  it('keeps the margins the piano roll and the cabinet sides need', () => {
    const cam = fitted(TABLE_SIZE.max);
    const p = { x: 0, y: 0 };
    let minX = Infinity;
    for (const pt of AURORA.outline) minX = Math.min(minX, cam.project(pt.x, pt.y, 50, p).x);

    // 78px is where `Stage.drawRoll` gives up on a side.
    expect(minX).toBeGreaterThan(78);
  });

  it('is a no-op on a portrait viewport, where the fit is bound by width', () => {
    const base = keyScale(fitted(1, 390, 844));

    // Raking lower only makes the table wider there, so there is nothing to win
    // and — more to the point — nothing to lose.
    expect(keyScale(fitted(TABLE_SIZE.max, 390, 844))).toBe(base);
  });
});

/** Device pixels the canvas and its two full-size layers would come to. */
const backingPixels = (cssW: number, cssH: number, ratio: number): number => {
  const d = backingDensity(cssW, cssH, ratio);
  return cssW * d * cssH * d;
};

describe('the backing store', () => {
  it('draws every 4K panel at its native resolution, whatever the scaling', () => {
    // css size and reported ratio for one 4K display at each Windows setting.
    for (const [cssW, cssH, ratio] of [[2560, 1440, 1.5], [1920, 1080, 2], [1536, 864, 2.5], [1280, 720, 3]]) {
      expect(backingDensity(cssW, cssH, ratio), `${ratio}x`).toBe(ratio);
    }
  });

  it('holds the budget when the browser is zoomed out', () => {
    // Zooming out shrinks the reported ratio and grows the viewport in step, so
    // the pixels are the same 4K either way. Flooring the density at 1 here cost
    // four times the budget at 50% zoom, and sixteen times it at 25%.
    const full = backingPixels(3840, 2160, 1);

    for (const [cssW, cssH, ratio] of [[5734, 3226, 0.67], [7680, 4320, 0.5], [15360, 8640, 0.25]]) {
      expect(backingPixels(cssW, cssH, ratio), `${ratio}x`).toBeCloseTo(full, -3);
    }
  });

  it('never asks for more than the budget, and never more than it can use', () => {
    for (const [cssW, cssH, ratio] of [[3840, 2160, 2], [2560, 1440, 2], [1920, 1080, 4], [800, 600, 1]]) {
      const d = backingDensity(cssW, cssH, ratio);
      expect(cssW * d * cssH * d, `${cssW}x${cssH} @${ratio}`).toBeLessThanOrEqual(3840 * 2160 + 1);
      expect(d).toBeLessThanOrEqual(Math.min(3, ratio));
      expect(d).toBeGreaterThan(0);
    }
  });

  it('falls back to 1 when the browser reports no ratio at all', () => {
    expect(backingDensity(1920, 1080, 0)).toBe(1);
    expect(backingDensity(1920, 1080, undefined as unknown as number)).toBe(1);
  });
});
