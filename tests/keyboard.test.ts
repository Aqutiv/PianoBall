import { describe, it, expect } from 'vitest';
import { buildKeyLayout } from '../src/game/keyLayout';
import { NoteMapping } from '../src/midi/mapping';
import { mapVelocity, DEFAULT_VELOCITY } from '../src/midi/velocityCurve';
import { isBlackKey } from '../src/midi/notes';
import { KeyboardFallback } from '../src/midi/keyboardFallback';
import type { InputEvent } from '../src/midi/types';

describe('key layout', () => {
  it('gives a 32-key controller 19 white and 13 black keys', () => {
    const { keys } = buildKeyLayout(48, 32);
    expect(keys).toHaveLength(32);
    expect(keys.filter((k) => !k.black)).toHaveLength(19);
    expect(keys.filter((k) => k.black)).toHaveLength(13);
  });

  it('tiles the keybed with no gaps or overlaps', () => {
    // The whole point: every x on the keybed belongs to exactly one key, so the
    // ball's position always names one key to press.
    for (const [base, count] of [[48, 32], [36, 25], [21, 88], [55, 37]] as const) {
      const { keys, layout } = buildKeyLayout(base, count);
      const slots = keys
        .map((k) => ({ l: k.cx - k.halfW, r: k.cx + k.halfW }))
        .sort((a, b) => a.l - b.l);
      expect(slots[0].l).toBeCloseTo(layout.left, 6);
      expect(slots[slots.length - 1].r).toBeCloseTo(layout.right, 6);
      for (let i = 1; i < slots.length; i++) {
        expect(slots[i].l).toBeCloseTo(slots[i - 1].r, 6);
      }
    }
  });

  it('keeps every slot wide enough to aim within', () => {
    const { keys, layout } = buildKeyLayout(48, 32);
    for (const k of keys) expect(k.halfW * 2).toBeGreaterThan(layout.whiteW * 0.4);
  });

  it('crowns the keybed so the outer keys sit lower than the middle', () => {
    const { keys } = buildKeyLayout(48, 32);
    const mid = keys[Math.floor(keys.length / 2)];
    expect(keys[0].cy).toBeLessThan(mid.cy);
    expect(keys[keys.length - 1].cy).toBeLessThan(mid.cy);
    // Keys tilt outward from the middle, so a resting ball always rolls away.
    expect(keys[0].tilt).toBeGreaterThan(0);
    expect(keys[keys.length - 1].tilt).toBeLessThan(0);
  });

  it('places black keys between their neighbouring whites', () => {
    const { keys } = buildKeyLayout(48, 32);
    for (let i = 1; i < keys.length - 1; i++) {
      if (!keys[i].black) continue;
      expect(keys[i].drawCx).toBeGreaterThan(keys[i - 1].drawCx);
      expect(keys[i].drawCx).toBeLessThan(keys[i + 1].drawCx);
      expect(isBlackKey(keys[i].note)).toBe(true);
    }
  });
});

describe('note mapping', () => {
  it('maps notes to lanes across the window', () => {
    const m = new NoteMapping({ baseNote: 48, count: 32 });
    expect(m.laneFor(48)).toBe(0);
    expect(m.laneFor(79)).toBe(31);
    expect(m.laneFor(80)).toBe(-1);
  });

  it('re-latches by whole octaves when the controller transposes', () => {
    const m = new NoteMapping({ baseNote: 48, count: 32, autoLatch: true });
    // Octave up: the first note above the window slides the whole map.
    expect(m.observe(84)).toBe(true);
    expect(m.settings.baseNote).toBe(60);
    expect(m.laneFor(84)).toBe(24);
    // Octave down, twice over.
    expect(m.observe(38)).toBe(true);
    expect(m.settings.baseNote).toBe(36);
    expect(m.observe(50)).toBe(false);
  });

  it('never latches when the note is already inside the window', () => {
    const m = new NoteMapping({ baseNote: 48, count: 32 });
    for (let n = 48; n < 80; n++) expect(m.observe(n)).toBe(false);
    expect(m.settings.baseNote).toBe(48);
  });

  it('derives base and count from a two-press calibration', () => {
    const m = new NoteMapping({ baseNote: 48, count: 32 });
    m.beginCalibration();
    m.calibrate(36);
    expect(m.calibrate(84)).toBe('done');
    expect(m.settings.baseNote).toBe(36);
    expect(m.settings.count).toBe(49);
  });
});

describe('velocity curve', () => {
  it('is monotonic and bounded', () => {
    let prev = -1;
    for (let raw = 0; raw <= 127; raw++) {
      const v = mapVelocity(raw, DEFAULT_VELOCITY);
      expect(v).toBeGreaterThanOrEqual(DEFAULT_VELOCITY.min - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('lifts soft playing, which is what mini keys actually produce', () => {
    const soft = mapVelocity(45, { ...DEFAULT_VELOCITY, curve: 'soft' });
    const linear = mapVelocity(45, { ...DEFAULT_VELOCITY, curve: 'linear' });
    expect(soft).toBeGreaterThan(linear);
  });
});

/**
 * Input can be switched off between a key going down and coming up — focus
 * moving to an on-screen control does exactly that — and a release that is
 * dropped leaves a note sounding with nothing able to stop it.
 */
describe('losing the keyboard mid-note', () => {
  function harness() {
    const events: InputEvent[] = [];
    const kb = new KeyboardFallback({
      baseNote: () => 60,
      emit: (e) => events.push(e),
      shiftOctave: () => {},
    });
    const down = (code: string) => kb['onDown']({
      code, repeat: false, metaKey: false, ctrlKey: false,
      shiftKey: false, altKey: false, preventDefault: () => {},
    } as unknown as KeyboardEvent);
    const up = (code: string) => kb['onUp']({ code } as KeyboardEvent);
    return { kb, events, down, up };
  }

  it('still lets a note go after input is disabled', () => {
    const { kb, events, down, up } = harness();
    down('KeyZ');
    expect(events.filter((e) => e.type === 'noteon')).toHaveLength(1);

    kb.enabled = false;
    up('KeyZ');

    expect(events.filter((e) => e.type === 'noteoff'), 'the note must not be stranded').toHaveLength(1);
  });

  it('lets go of the bend as well', () => {
    const { kb, events, down, up } = harness();
    down('ArrowLeft');
    kb.enabled = false;
    up('ArrowLeft');

    const bends = events.filter((e) => e.type === 'bend');
    expect(bends).toHaveLength(2);
    expect(bends[bends.length - 1]).toMatchObject({ value: 0 });
  });

  it('gives focused controls their keys before the next frame disables piano input', () => {
    const { kb, events } = harness();
    let prevented = false;
    kb['onDown']({
      code: 'ArrowLeft', repeat: false, metaKey: false, ctrlKey: false,
      target: { closest: () => ({}) },
      preventDefault: () => { prevented = true; },
    } as unknown as KeyboardEvent);
    expect(events).toHaveLength(0);
    expect(prevented).toBe(false);
  });

  it('ignores a release for something it never had', () => {
    const { kb, events, up } = harness();
    kb.enabled = false;
    up('KeyZ');
    up('ArrowLeft');

    expect(events).toHaveLength(0);
  });

  it('releases everything held when the keyboard is taken away', () => {
    const { kb, events, down } = harness();
    down('KeyZ');
    down('KeyX');
    down('ArrowRight');

    kb.releaseAll();

    expect(events.filter((e) => e.type === 'noteoff')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'bend' && e.value === 0)).toHaveLength(1);
  });
});
