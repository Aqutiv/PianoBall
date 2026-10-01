import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dockFrame, layoutDock, playtuneRows, type DockEnv, type DockLayout } from '../src/game/dock';
import { fitToRange, fitted } from '../src/modes/playtune/chart';
import { ROLES } from '../src/modes/playtune/role';
import { FreestyleMode } from '../src/modes/freestyle/freestyle';
import { PlayTuneMode } from '../src/modes/playtune/playtune';
import { AudioEngine } from '../src/audio/engine';
import { ChordBed } from '../src/audio/bed';
import { MusicState } from '../src/audio/musicState';
import { InputHub } from '../src/midi/inputHub';
import { AURORA } from '../src/game/table/tables/aurora';
import { Stage } from '../src/render/stage';
import type { ModeContext } from '../src/app/mode';
import { resetFreestyleSettings, setFreestyleSettings } from '../src/modes/freestyle/settings';
import { resetDockSettings, setDockOverride } from '../src/render/dockSettings';

vi.mock('../src/modes/freestyle/hud', () => ({
  FreestyleHud: class { mount() {} sync() {} update() {} closeHelp() {} destroy() {} },
}));
vi.mock('../src/modes/playtune/hud', () => ({
  TuneHud: class { mount() {} setTune() {} setRhythm() {} update() {} },
}));

const MAPPED = { low: 48, high: 79 };
const TOUCH: DockEnv = { touch: true, keySize: 'comfortable', center: 60 };

describe('every tune on a phone held sideways', () => {
  // Width, height, and the narrowest white key every part must keep.
  const screens: [string, number, number, number][] = [
    ['an 844×390 phone', 844, 390, 50],
    ['a notched phone after its insets', 750, 369, 44],
    ['a 667×375 phone', 667, 375, 40],
  ];

  for (const [label, w, h, floor] of screens) {
    it(`lays out every part in both roles on ${label}`, () => {
      let checked = 0;
      for (const role of Object.values(ROLES)) {
        for (const tune of role.tunes) {
          const chart = role.chart(tune);
          if (!chart.length) continue;
          // As the mode fits a part on a touch screen: the controller window if
          // it fits there, the whole piano if not.
          const shift = fitToRange(chart, MAPPED.low, MAPPED.high) ?? fitToRange(chart, 21, 108);
          expect(shift, `${role.id} ${tune.id}`).not.toBeNull();
          const notes = fitted(chart, shift!);
          const part = { low: Math.min(...notes.map((n) => n.note)), high: Math.max(...notes.map((n) => n.note)) };
          const rows = playtuneRows(TOUCH, MAPPED, part, w);
          const layout = layoutDock(dockFrame(w, h, { rows: 1, touch: true, header: 6 }), rows);
          expect(layout.rows[0].whiteW, `${role.id} ${tune.id}`).toBeGreaterThanOrEqual(floor);
          for (const n of notes) expect(layout.byNote.has(n.note), `${role.id} ${tune.id} ${n.note}`).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(40);
    });
  }
});

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
  return { getContext: () => ({}), style: {}, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

describe('Freestyle on a touch screen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', { createElement: () => fakeCanvas() });
    resetFreestyleSettings();
    resetDockSettings();
    setDockOverride('touch');
  });

  afterEach(() => {
    setDockOverride(null);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetFreestyleSettings();
  });

  function rig(w: number, h: number) {
    const input = new InputHub();
    input.mapping.settings = { baseNote: 48, count: 32, autoLatch: true };
    const audio = new AudioEngine();
    const music = new MusicState({ ...AURORA.music });
    const bed = new ChordBed(audio, music);
    const stage = new Stage(fakeCanvas());
    stage.cssW = w;
    stage.cssH = h;
    const ctx = {
      input, audio, music, bed, stage,
      hud: { clearPanels() {}, setDock() {} },
      openScreen() {}, setResult() {},
    } as unknown as ModeContext;
    const mode = new FreestyleMode(ctx);
    const layout = () => (mode as unknown as { dock: { layout(): DockLayout } }).dock.layout();
    return { input, audio, bed, stage, ctx, mode, layout };
  }

  it('sizes the keys for fingers, and the computer keyboard follows them', () => {
    const r = rig(844, 390);
    r.mode.enter();
    expect(r.layout().keys).toHaveLength(25);
    expect(r.layout().rows[0].whiteW).toBeGreaterThan(50);
    expect(r.input.keyboardBase?.()).toBe(48);
    r.mode.exit();
    expect(r.input.keyboardBase).toBeNull();
    r.bed.stop();
  });

  it('keeps the computer keyboard on the keys on screen when a mode behind them is remapped', () => {
    setFreestyleSettings({ bed: true, bedMode: 'manual' });
    const r = rig(390, 844);
    // Visited and left: the shell keeps a mode it has built for the session.
    const playtune = new PlayTuneMode(r.ctx);
    playtune.enter();
    expect(r.input.keyboardBase?.()).toBe(60);
    playtune.exit();
    r.mode.enter();
    expect(r.input.keyboardBase?.()).toBe(48);
    // What `Shell.remapKeys` does after a Key size change: every built mode, in
    // the order it was built.
    for (const mode of [r.mode, playtune]) mode.remap();
    expect(r.input.keyboardBase?.()).toBe(48);
    r.mode.exit();
    r.bed.stop();
  });

  it('stacks Manual backing in two rows on an upright phone, and plays both', () => {
    setFreestyleSettings({ bed: true, bedMode: 'manual' });
    const r = rig(390, 844);
    r.mode.enter();
    r.mode.newGame();
    const rows = r.layout().rows;
    expect(rows.map((row) => [row.low, row.high])).toEqual([[48, 59], [60, 72]]);
    const on = vi.spyOn(r.audio, 'noteOn');
    r.input.press(48, 0.8);
    expect(r.bed.manualChord?.root).toBe(48);
    r.input.press(64, 0.8);
    expect(on.mock.calls.at(-1)?.[0]).toBe(64);
    r.mode.exit();
    r.bed.stop();
  });

  it('moves the touch window by octaves, never the controller', () => {
    const r = rig(844, 390);
    r.mode.enter();
    r.mode.shift(1);
    expect(r.layout().low).toBe(60);
    expect(r.input.mapping.low).toBe(48);
    r.mode.shift(-1);
    r.mode.shift(-1);
    expect(r.layout().low).toBe(36);
    r.mode.exit();
    r.bed.stop();
  });

  it('ignores notes the keys on screen do not hold', () => {
    const r = rig(390, 844);
    r.mode.enter();
    r.mode.newGame();
    const on = vi.spyOn(r.audio, 'noteOn');
    r.input.press(48, 0.8);
    expect(on).not.toHaveBeenCalled();
    r.input.press(60, 0.8);
    expect(on).toHaveBeenCalledTimes(1);
    r.mode.exit();
    r.bed.stop();
  });
});
