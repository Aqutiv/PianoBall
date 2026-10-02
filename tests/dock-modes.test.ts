import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreestyleMode } from '../src/modes/freestyle/freestyle';
import { AudioEngine } from '../src/audio/engine';
import { ChordBed } from '../src/audio/bed';
import { MusicState } from '../src/audio/musicState';
import { InputHub } from '../src/midi/inputHub';
import { AURORA } from '../src/game/table/tables/aurora';
import { Stage } from '../src/render/stage';
import { DEFAULT_CAMERA } from '../src/render/project';
import type { GameMode, ModeContext } from '../src/app/mode';
import type { DockLayout } from '../src/game/dock';
import { resetFreestyleSettings } from '../src/modes/freestyle/settings';

vi.mock('../src/modes/freestyle/hud', () => ({
  FreestyleHud: class { mount() {} sync() {} update() {} closeHelp() {} destroy() {} },
}));

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

function rig(w = 1440, h = 900) {
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
  return { stage, ctx };
}

/** The keyboard a mode is showing, read off its private dock for the test. */
function layoutOf(mode: GameMode): DockLayout {
  return (mode as unknown as { dock: { layout(): DockLayout } }).dock.layout();
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
  vi.stubGlobal('document', { createElement: () => fakeCanvas() });
  resetFreestyleSettings();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetFreestyleSettings();
});

describe('music modes on the docked keyboard', () => {
  it('asks for the flat stage, and leaves the table camera as it found it', () => {
    const { stage, ctx } = rig();
    const mode = new FreestyleMode(ctx);
    expect(mode.projection).toBe('flat');
    // What the shell does around a mode.
    stage.reset();
    stage.setProjection(mode.projection);
    mode.enter();
    mode.exit();
    stage.reset();
    expect(stage.proj).toBe(stage.cam);
    expect(stage.cam.opts).toEqual(DEFAULT_CAMERA);
    ctx.bed.stop();
  });

  it('finds every Freestyle key at the centre of its face', () => {
    const { ctx } = rig();
    const mode = new FreestyleMode(ctx);
    const layout = layoutOf(mode);
    expect(layout.keys).toHaveLength(32);
    for (const k of layout.keys) {
      const y = k.black ? k.rect.y + k.rect.h / 2 : k.rect.y + k.rect.h * 0.85;
      const hit = mode.keyAt(k.laneX, y, false);
      expect(hit?.note).toBe(k.note);
      expect(hit!.force).toBeGreaterThanOrEqual(0.6);
    }
    // Above the dock is the stage, and a tap there plays nothing.
    expect(mode.keyAt(layout.keys[0].laneX, layout.top - 40, false)).toBeNull();
  });

  it('slides across Freestyle keys, and bumps its revision when the keys move', () => {
    const { stage, ctx } = rig();
    const mode = new FreestyleMode(ctx);
    expect(mode.glide).toBe(true);
    layoutOf(mode);
    const before = mode.keyLayoutRevision;
    stage.cssW = 844;
    stage.cssH = 390;
    layoutOf(mode);
    expect(mode.keyLayoutRevision).toBe(before + 1);
    layoutOf(mode);
    expect(mode.keyLayoutRevision).toBe(before + 1);
  });
});
