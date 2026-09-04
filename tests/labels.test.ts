import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stage } from '../src/render/stage';

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

/** One `strokeText` or `fillText`, with the context state it was drawn under. */
interface Mark {
  op: 'stroke' | 'fill';
  text: string;
  font: string;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  shadowColor: string;
  shadowBlur: number;
  globalAlpha: number;
}

/**
 * A canvas context that remembers what it was asked to draw.
 *
 * `label` sets state and then draws, twice, with different state each time —
 * so a recorder that only kept the final values would be able to prove nothing
 * about either pass. Each mark snapshots the state as it stood at the call.
 */
function recorder(): { ctx: CanvasRenderingContext2D; marks: Mark[] } {
  const marks: Mark[] = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '',
    miterLimit: 0, shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    textAlign: '', textBaseline: '',
    save() {}, restore() {},
    snapshot(op: 'stroke' | 'fill', text: string): Mark {
      return {
        op, text, font: ctx.font, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle,
        lineWidth: ctx.lineWidth, lineJoin: ctx.lineJoin, shadowColor: ctx.shadowColor,
        shadowBlur: ctx.shadowBlur, globalAlpha: ctx.globalAlpha,
      };
    },
    strokeText(text: string) { marks.push(ctx.snapshot('stroke', text)); },
    fillText(text: string) { marks.push(ctx.snapshot('fill', text)); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, marks };
}

/** The rendered size `label` settled on, read back off the font it set. */
function fontPx(mark: Mark): number {
  return Number(/ (\d+(?:\.\d+)?)px /.exec(mark.font)?.[1]);
}

function stage(): Stage {
  const s = new Stage(fakeCanvas());
  s.cam.fit(1280, 800);
  return s;
}

describe('label contrast', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('strokes the edge before it fills the glyph', () => {
    // The order is the whole reason an outline is usable here. `strokeText`
    // centres the line on the glyph contour; the fill going on top covers its
    // inward half, so half the width shows outside the letter and none of it
    // eats the stem. Swap these two lines and a bold glyph is thinned into a
    // hairline by its own outline — which looks like a font problem, not like
    // the edit that caused it. Hence a test rather than a comment alone.
    const { ctx, marks } = recorder();
    stage().label(ctx, 512, 300, 12, 'C#', '#ffffff', 1, 30, { edge: '#04050d' });

    expect(marks.map((m) => m.op)).toEqual(['stroke', 'fill']);
    expect(marks[0].strokeStyle).toBe('#04050d');
    expect(marks[1].fillStyle).toBe('#ffffff');
  });

  it('shadows the edge and not the fill drawn over it', () => {
    // A shadow on the fill pass would be cast over the outline that was just
    // laid down, dirtying its inner contour.
    const { ctx, marks } = recorder();
    stage().label(ctx, 512, 300, 12, 'C', '#ffffff', 1, 30, { edge: '#04050d' });

    expect(marks[0].shadowBlur).toBeGreaterThan(0);
    expect(marks[1].shadowBlur).toBe(0);
  });

  it('scales the edge with the type, and keeps a floor under both', () => {
    const { ctx, marks } = recorder();
    const s = stage();
    s.label(ctx, 512, 300, 12, 'C', '#ffffff', 1, 30, { edge: '#04050d' });
    expect(marks[0].lineWidth).toBeCloseTo(fontPx(marks[0]) * 0.2, 5);
    expect(marks[0].lineJoin).toBe('round');

    // A viewport too short to project 12px of type still gets 12px of type:
    // below that there is not enough glyph left to carry an outline.
    const tiny = recorder();
    s.label(tiny.ctx, 512, 300, 12, 'C', '#ffffff', 1, 1, { edge: '#04050d', minSize: 12 });
    expect(fontPx(tiny.marks[0])).toBe(12);
    expect(tiny.marks[0].lineWidth).toBeCloseTo(2.4, 5);
  });

  it('leaves a label with no edge exactly as it was', () => {
    // The pin for every call site that did not ask for this: the octave markers
    // on the keys, the pinball element names, the Freestyle chord name.
    const { ctx, marks } = recorder();
    stage().label(ctx, 512, 300, 12, 'C4', '#04050d', 0.5, 21);

    expect(marks.map((m) => m.op)).toEqual(['fill']);
    expect(marks[0].shadowColor).toBe('rgba(0,0,0,0.65)');
    expect(marks[0].shadowBlur).toBe(6);
    expect(marks[0].globalAlpha).toBe(0.5);
  });
});
