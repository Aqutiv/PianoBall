import { describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, TableCamera } from '../src/render/project';
import { AURORA } from '../src/game/table/tables/aurora';
import { DEFAULT_KEYBED } from '../src/game/keyLayout';
import { TABLE_SIZE } from '../src/render/stage';

const LANDSCAPE = { w: 1920, h: 1080 };

function fitted(magnify: number, w = LANDSCAPE.w, h = LANDSCAPE.h): TableCamera {
  const cam = new TableCamera({ width: AURORA.width, height: AURORA.height, magnify });
  cam.fit(w, h);
  return cam;
}

/** Pixels per table unit across the middle of the keybed. */
function keyScale(cam: TableCamera): number {
  const kb = { ...DEFAULT_KEYBED, ...AURORA.keybed };
  return cam.scaleAt(kb.left, kb.baseY, 13);
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
    const base = keyScale(fitted(1));

    for (const m of [1.05, 1.1, TABLE_SIZE.max]) {
      const got = keyScale(fitted(m)) / base;
      // `magnify` sizes the fit; the keybed sits nearer than the focal plane, so
      // the rake that pays for it hands the keys a little more than was asked
      // for and the far end of the table a little less.
      expect(got, `magnify ${m}`).toBeGreaterThanOrEqual(m);
      expect(got, `magnify ${m}`).toBeLessThan(m * 1.05);
    }
  });

  it('buys the size with rake rather than by cropping the keyboard', () => {
    // The near edge of the outermost key, which is the first thing a crop would
    // take, and the shake that has to stay clear of the bottom of the screen.
    const kb = { ...DEFAULT_KEYBED, ...AURORA.keybed };
    const nearY = kb.baseY - kb.crown - kb.whiteDepth;
    const gap = (m: number) =>
      LANDSCAPE.h - fitted(m).project(kb.left, nearY, 0, { x: 0, y: 0 }).y;

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
    expect(keyScale(fitted(TABLE_SIZE.max, 390, 844))).toBeGreaterThanOrEqual(base);
  });
});
