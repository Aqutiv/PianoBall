import { describe, it, expect } from 'vitest';
import {
  BLACK_LENGTH, BLACK_WIDTH, KEY_TARGET, centreFor, dockForce, dockFrame, freestyleRows, layoutDock, mapFraction, noteAtFraction, pickDock,
  playtuneRows, touchOctaves, touchWindow, whiteCount, type DockEnv, type DockLayout, type DockRowSpec,
} from '../src/game/dock';
import { isBlackKey } from '../src/midi/notes';

const MAPPED = { low: 48, high: 79 };
const touch = (over: Partial<DockEnv> = {}): DockEnv => ({ touch: true, keySize: 'comfortable', center: 60, ...over });
const desk: DockEnv = { touch: false, keySize: 'comfortable', center: 60 };

function dock(width: number, height: number, rows: DockRowSpec[], o: { touch?: boolean; header?: number } = {}): DockLayout {
  const frame = dockFrame(width, height, { rows: rows.length > 1 ? 2 : 1, touch: o.touch ?? true, header: o.header ?? 44 });
  return layoutDock(frame, rows);
}

const whites = (l: DockLayout, row = 0) => l.rows[row].keys.filter((k) => !k.black);

describe('dock geometry', () => {
  it('gives black keys the desktop proportions, centred on the white boundary', () => {
    const l = dock(1440, 900, [{ low: 48, high: 79 }], { touch: false });
    const row = l.rows[0];
    for (let i = 0; i < row.keys.length; i++) {
      const k = row.keys[i];
      if (!k.black) continue;
      expect(k.rect.w).toBeCloseTo(row.whiteW * BLACK_WIDTH, 6);
      expect(k.rect.h).toBeCloseTo(row.height * BLACK_LENGTH, 6);
      // Its centre is exactly where the white key after it begins.
      const next = row.keys[i + 1];
      expect(next.black).toBe(false);
      expect(k.laneX).toBeCloseTo(next.rect.x, 6);
    }
  });

  it('tiles the row with whites, leaving half a key at a black end', () => {
    for (const [low, high] of [[48, 79], [49, 72], [48, 73], [61, 70]]) {
      const l = dock(1000, 700, [{ low, high }], { touch: false });
      const row = l.rows[0];
      const w = whites(l);
      expect(w).toHaveLength(whiteCount(low, high));
      const padL = isBlackKey(low) ? 0.5 : 0;
      const padR = isBlackKey(high) ? 0.5 : 0;
      expect(w[0].rect.x).toBeCloseTo(l.left + padL * row.whiteW, 6);
      const last = w[w.length - 1];
      expect(last.rect.x + last.rect.w).toBeCloseTo(l.right - padR * row.whiteW, 6);
      for (let i = 1; i < w.length; i++) expect(w[i].rect.x).toBeCloseTo(w[i - 1].rect.x + w[i - 1].rect.w, 6);
      for (const k of w) expect(k.rect.w).toBeCloseTo(row.whiteW, 6);
    }
  });

  it('lists every key once, in note order, with a lane at its centre', () => {
    const l = dock(844, 390, [{ low: 48, high: 72 }]);
    expect(l.keys.map((k) => k.note)).toEqual(Array.from({ length: 25 }, (_, i) => 48 + i));
    for (const k of l.keys) {
      expect(l.byNote.get(k.note)).toBe(k);
      expect(k.laneX).toBeCloseTo(k.rect.x + k.rect.w / 2, 6);
    }
    expect(l.low).toBe(48);
    expect(l.high).toBe(72);
  });

  it('stacks two rows from the bottom up, chords above melody', () => {
    const l = dock(390, 844, [{ low: 48, high: 59 }, { low: 60, high: 72 }]);
    const [top, bottom] = l.rows;
    expect(top.top + top.height + l.frame.rowGap).toBeCloseTo(bottom.top, 6);
    expect(bottom.top + bottom.height).toBeCloseTo(l.bottom, 6);
    expect(l.keysTop).toBe(top.top);
    expect(l.top).toBeCloseTo(l.keysTop - l.frame.header, 6);
    expect(top.keys.every((k) => k.row === 0 && k.note < 60)).toBe(true);
    expect(bottom.keys.every((k) => k.row === 1 && k.note >= 60)).toBe(true);
  });

  it('keeps the geometry key stable, and different when the rows change', () => {
    const a = dock(844, 390, [{ low: 48, high: 72 }]);
    const b = dock(844, 390, [{ low: 48, high: 72 }]);
    const c = dock(844, 390, [{ low: 60, high: 84 }]);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
  });
});

describe('dock picking', () => {
  const l = dock(844, 390, [{ low: 48, high: 72 }]);
  const key = (n: number) => l.byNote.get(n)!;

  it('finds every key at the centre of its visible face', () => {
    for (const k of l.keys) {
      // A white key's visible face is below the black keys' tips.
      const y = k.black ? k.rect.y + k.rect.h / 2 : k.rect.y + k.rect.h * 0.85;
      expect(pickDock(l, k.laneX, y)?.note).toBe(k.note);
    }
  });

  it('lets a black key win where it overlaps a white one', () => {
    const cs = key(49);
    expect(pickDock(l, cs.rect.x + 1, cs.rect.y + 5)?.note).toBe(49);
    // Below the black key's tip, the same x belongs to the white key under it.
    expect(pickDock(l, cs.rect.x + 1, cs.rect.y + cs.rect.h + 5)?.note).toBe(48);
  });

  it('accepts a touch just above the keys, within the slop', () => {
    const c = key(60);
    expect(pickDock(l, c.laneX, l.keysTop - 4)?.note).toBe(60);
    expect(pickDock(l, c.laneX, l.keysTop - 20)).toBeNull();
    expect(pickDock(l, c.laneX, l.keysTop - 20, 24)?.note).toBe(60);
  });

  it('plays the end key from the side margin, and nothing far above', () => {
    expect(pickDock(l, 1, l.bottom - 5)?.note).toBe(48);
    expect(pickDock(l, 843, l.bottom - 5)?.note).toBe(72);
    expect(pickDock(l, 400, 20)).toBeNull();
  });

  it('picks from the row the point is in when there are two', () => {
    const two = dock(390, 844, [{ low: 48, high: 59 }, { low: 60, high: 72 }]);
    const [top, bottom] = two.rows;
    expect(pickDock(two, 30, top.top + top.height - 4)?.note).toBe(48);
    expect(pickDock(two, 30, bottom.top + bottom.height - 4)?.note).toBe(60);
    // In the gap, the nearer row owns the point.
    expect(pickDock(two, 30, top.top + top.height + 2)?.note).toBe(48);
    expect(pickDock(two, 30, bottom.top - 2)?.note).toBe(60);
  });

  it('strikes harder nearer the front of the key, within the pointer range', () => {
    const k = key(60);
    const back = dockForce(k, k.rect.y);
    const mid = dockForce(k, k.rect.y + k.rect.h / 2);
    const front = dockForce(k, k.rect.y + k.rect.h);
    expect(back).toBeCloseTo(0.6, 6);
    expect(mid).toBeGreaterThan(back);
    expect(front).toBeGreaterThan(mid);
    expect(front).toBeLessThanOrEqual(0.95 + 1e-9);
    expect(dockForce(k, k.rect.y - 20)).toBeCloseTo(0.6, 6);
  });
});

describe('dock range policy', () => {
  const viewports: [string, number, number, DockEnv, number, number][] = [
    // label, width, height, env, keys, minimum white key px
    ['phone landscape', 844, 390, touch(), 25, 54],
    ['notched phone landscape', 750, 369, touch(), 25, 48],
    ['small phone landscape', 667, 375, touch(), 25, 42],
    ['phone portrait', 390, 844, touch(), 13, 46],
    ['tablet portrait', 768, 1024, touch(), 25, 49],
    ['tablet landscape', 1024, 768, touch(), 37, 45],
    ['desktop', 1440, 900, desk, 32, 70],
  ];

  for (const [label, w, h, env, keys, minWhite] of viewports) {
    it(`sizes the Freestyle window for a ${label}`, () => {
      const rows = freestyleRows(env, MAPPED, false, w);
      const l = dock(w, h, rows, { touch: env.touch });
      expect(l.keys).toHaveLength(keys);
      for (const r of l.rows) expect(r.whiteW).toBeGreaterThanOrEqual(minWhite);
    });
  }

  it('builds touch windows C to C around the centre', () => {
    expect(touchWindow(60, 1)).toEqual({ low: 60, high: 72 });
    expect(touchWindow(60, 2)).toEqual({ low: 48, high: 72 });
    expect(touchWindow(60, 3)).toEqual({ low: 48, high: 84 });
    expect(touchWindow(60, 4)).toEqual({ low: 36, high: 84 });
    // Kept on the piano at either end.
    expect(touchWindow(12, 2)).toEqual({ low: 24, high: 48 });
    expect(touchWindow(108, 2)).toEqual({ low: 84, high: 108 });
  });

  it('grows the window only while keys stay at the target width', () => {
    for (const size of ['compact', 'comfortable', 'large'] as const) {
      for (const w of [360, 390, 667, 750, 844, 1024, 1366]) {
        const k = touchOctaves(w, size);
        const rows = freestyleRows(touch({ keySize: size }), MAPPED, false, w);
        const l = dock(w, 600, rows);
        if (k > 1) expect(l.rows[0].whiteW).toBeGreaterThanOrEqual(KEY_TARGET[size]);
      }
    }
    expect(touchOctaves(844, 'large')).toBe(2);
    expect(touchOctaves(750, 'large')).toBe(1);
    expect(touchOctaves(844, 'compact')).toBe(3);
  });

  it('stacks the chord octave above the melody when one row would be too thin', () => {
    const portrait = freestyleRows(touch(), MAPPED, true, 390);
    expect(portrait).toEqual([{ low: 48, high: 59 }, { low: 60, high: 72 }]);
    // Turned sideways, the same notes fit in one row.
    const landscape = freestyleRows(touch(), MAPPED, true, 844);
    expect(landscape).toEqual([{ low: 48, high: 72 }]);
    const notes = (rows: DockRowSpec[]) => rows.flatMap((r) => Array.from({ length: r.high - r.low + 1 }, (_, i) => r.low + i));
    expect(notes(portrait)).toEqual(notes(landscape));
    // A two-row layout keeps every key comfortably wide.
    const two = dock(390, 844, portrait);
    for (const r of two.rows) expect(r.whiteW).toBeGreaterThanOrEqual(KEY_TARGET.comfortable);
  });

  it('uses the mapped controller window with a mouse or a MIDI keyboard', () => {
    expect(freestyleRows(desk, MAPPED, true, 1440)).toEqual([MAPPED]);
    expect(playtuneRows(desk, MAPPED, { low: 60, high: 67 }, 1440)).toEqual([MAPPED]);
  });

  it('fits PlayTune to the part, at least an octave, on whole white keys', () => {
    // Ode to Joy's span: a fifth. It widens to an octave and gains breathing room.
    const [ode] = playtuneRows(touch(), MAPPED, { low: 60, high: 67 }, 844);
    expect(isBlackKey(ode.low)).toBe(false);
    expect(isBlackKey(ode.high)).toBe(false);
    expect(ode.low).toBeLessThanOrEqual(60);
    expect(ode.high).toBeGreaterThanOrEqual(67);
    expect(whiteCount(ode.low, ode.high)).toBeGreaterThanOrEqual(8);
    // A part that starts and ends on black keys is widened to whites.
    const [sharp] = playtuneRows(touch(), MAPPED, { low: 61, high: 75 }, 390);
    expect(sharp.low).toBe(60);
    expect(sharp.high).toBe(76);
    // No breathing room when it would cost the keys their width.
    const [tight] = playtuneRows(touch(), MAPPED, { low: 48, high: 71 }, 667);
    expect(tight).toEqual({ low: 48, high: 71 });
  });

  it('gives the dock about two fifths of a phone on its side, and under a third of a desktop', () => {
    const phone = dock(844, 390, [{ low: 48, high: 72 }], { header: 44 });
    const share = (l: DockLayout) => (l.frame.height - l.top) / l.frame.height;
    expect(share(phone)).toBeGreaterThan(0.36);
    expect(share(phone)).toBeLessThan(0.46);
    const lanes = dock(844, 390, [{ low: 60, high: 72 }], { header: 6 });
    expect(share(lanes)).toBeGreaterThan(0.3);
    const desktop = dock(1440, 900, [MAPPED], { touch: false, header: 32 });
    expect(share(desktop)).toBeLessThanOrEqual(0.32);
  });
});

describe('dock range strip', () => {
  it('places notes along a full piano by white keys', () => {
    expect(mapFraction(21)).toBe(0);
    expect(mapFraction(108)).toBe(1);
    expect(mapFraction(60)).toBeCloseTo(23 / 51, 6);
    // A black key sits halfway between its white neighbours.
    expect(mapFraction(61)).toBeCloseTo(mapFraction(60) + 0.5 / 51, 6);
    for (const n of [21, 24, 48, 60, 72, 96, 108]) expect(noteAtFraction(mapFraction(n))).toBe(n);
  });

  it('centres a dragged window on the note under the finger', () => {
    // Two octaves are centred on their middle C.
    expect(centreFor(60, 2)).toBe(60);
    expect(centreFor(65, 2)).toBe(60);
    expect(centreFor(67, 2)).toBe(72);
    // One octave sits half an octave above its C.
    expect(centreFor(66, 1)).toBe(60);
    expect(touchWindow(centreFor(78, 1), 1)).toEqual({ low: 72, high: 84 });
    // Never off the end of the piano.
    expect(centreFor(21, 2)).toBe(36);
    expect(centreFor(108, 2)).toBe(96);
  });
});
