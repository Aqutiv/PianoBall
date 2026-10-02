import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlatCamera, DEFAULT_CAMERA } from '../src/render/project';
import { Stage } from '../src/render/stage';
import { drawPops } from '../src/render/pops';
import { Scoring } from '../src/game/scoring';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function fakeCanvas(): HTMLCanvasElement {
  return { getContext: () => ({}), style: {} } as unknown as HTMLCanvasElement;
}

/** A canvas whose context answers every drawing call, for the sprite caches. */
function paintableCanvas(): HTMLCanvasElement {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : k.toString().startsWith('create') ? () => gradient : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, style: {} } as unknown as HTMLCanvasElement;
}

describe('flat camera', () => {
  it('reads upwards from the top of the keys, with x untouched', () => {
    const cam = new FlatCamera();
    cam.floor = 300;
    cam.unit = 0.5;
    const p = { x: 0, y: 0 };
    expect(cam.project(120, 0, 0, p)).toEqual({ x: 120, y: 300 });
    expect(cam.project(120, 80, 0, p)).toEqual({ x: 120, y: 220 });
    // Height off the floor lifts by table units turned into pixels.
    expect(cam.project(120, 0, 40, p)).toEqual({ x: 120, y: 280 });
    expect(cam.scaleAt(0, 0, 0)).toBe(0.5);
  });
});

describe('stage projection', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => paintableCanvas() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('draws through the table camera until told otherwise', () => {
    const stage = new Stage(fakeCanvas());
    expect(stage.proj).toBe(stage.cam);
    stage.setProjection('flat');
    expect(stage.proj).toBe(stage.flat);
    expect(stage.projectionKind).toBe('flat');
  });

  it('goes back to the table camera on reset, without touching its options', () => {
    const stage = new Stage(fakeCanvas());
    stage.setProjection('flat');
    stage.flat.floor = 500;
    stage.flat.unit = 0.4;
    stage.reset();
    expect(stage.proj).toBe(stage.cam);
    expect(stage.cam.opts).toEqual(DEFAULT_CAMERA);
  });

  it('places halos and labels through the flat camera when it is active', () => {
    const stage = new Stage(fakeCanvas());
    stage.setProjection('flat');
    stage.flat.floor = 400;
    stage.flat.unit = 0.5;
    const drawn: number[][] = [];
    const em = {
      globalCompositeOperation: '', globalAlpha: 1,
      drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => drawn.push([x, y, w, h]),
    } as unknown as CanvasRenderingContext2D;
    stage.halo(em, 200, 100, 0, 180, 40, 1);
    // Centred on (200, 300), forty table units of radius at half a pixel each.
    expect(drawn[0]).toEqual([180, 280, 40, 40]);
  });
});

describe('score pops', () => {
  it('draws through whichever projector it is given, in the colour asked for', () => {
    const scoring = new Scoring();
    scoring.add(100, 50, 0, { flat: true, label: 'PERFECT', style: 'perfect' });
    expect(scoring.pops[0].style).toBe('perfect');
    const cam = new FlatCamera();
    cam.floor = 200;
    const marks: { text: string; x: number; y: number; fill: string }[] = [];
    const ctx = {
      globalAlpha: 1, textAlign: '', textBaseline: '', fillStyle: '', font: '', shadowColor: '', shadowBlur: 0,
      save() {}, restore() {},
      fillText(text: string, x: number, y: number) { marks.push({ text, x, y, fill: ctx.fillStyle }); },
    };
    drawPops(ctx as unknown as CanvasRenderingContext2D, cam, scoring.pops, scoring.time, {
      color: (p) => (p.style === 'perfect' ? '#9be7ff' : null),
    });
    expect(marks.map((m) => m.text)).toEqual(['PERFECT', '100']);
    expect(marks[0].fill).toBe('#9be7ff');
    // Born thirty units up, at the point it was scored.
    expect(marks[0].x).toBe(50);
    expect(marks[0].y).toBe(170);
  });
});
