import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuraStage, laneFrame } from '../src/modes/playtune/render';
import { Judge, type TargetSpec } from '../src/modes/playtune/judge';
import { dockFrame, layoutDock } from '../src/game/dock';
import type { Stage } from '../src/render/stage';
import { AudioEngine } from '../src/audio/engine';
import { MusicState } from '../src/audio/musicState';
import type { ChordBed } from '../src/audio/bed';
import type { ModeContext } from '../src/app/mode';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { PlayTuneMode } from '../src/modes/playtune/playtune';
import { resetPlayTuneSettings } from '../src/modes/playtune/settings';
import type { Transport } from '../src/modes/playtune/transport';
import type { Hud } from '../src/ui/hud';

vi.mock('../src/modes/playtune/hud', () => ({
  TuneHud: class { mount() {} setTune() {} setRhythm() {} update() {} },
}));

const layout = layoutDock(dockFrame(1440, 900, { rows: 1, touch: false, header: 12 }), [{ low: 48, high: 79 }]);
const lanes = laneFrame(layout, 108);
const spec = (note: number, time: number, len = 1): TargetSpec => ({ note, beat: time, len, time, end: time + len });

describe('falling notes on straight lanes', () => {
  const stage = new AuraStage({} as Stage);

  it('falls straight down its own lane and lands on the line above the keys', () => {
    const judge = new Judge([spec(60, 4)]);
    const lane = layout.byNote.get(60)!;
    const at = (now: number) => stage.view(judge, now, 4, 1, layout, lanes)[0];

    const first = at(0);
    const half = at(2);
    const landed = at(4);
    for (const v of [first, half, landed]) expect(v.lane.laneX).toBe(lane.laneX);
    expect(first.progress).toBe(0);
    expect(first.y).toBeCloseTo(lanes.top + first.r, 6);
    expect(half.y).toBeCloseTo(lanes.strike - half.r - 0.5 * (lanes.strike - lanes.top - 2 * half.r), 6);
    expect(landed.y).toBeCloseTo(lanes.strike - landed.r, 6);
    // Steady speed: equal time, equal distance.
    expect(half.y - first.y).toBeCloseTo(landed.y - half.y, 6);
  });

  it('sizes a head to its key, and shrinks chord tones on neighbouring lanes', () => {
    const lone = stage.view(new Judge([spec(60, 2)]), 0, 4, 1, layout, lanes)[0];
    expect(lone.r).toBe(25);
    const chord = stage.view(new Judge([spec(60, 2), spec(61, 2)]), 0, 4, 1, layout, lanes);
    const gap = Math.abs(layout.byNote.get(61)!.laneX - layout.byNote.get(60)!.laneX);
    for (const v of chord) expect(v.r).toBeCloseTo(Math.max(7, 0.46 * gap), 6);
    // Notes a fifth apart have all the room they need.
    const open = stage.view(new Judge([spec(60, 2), spec(67, 2)]), 0, 4, 1, layout, lanes);
    for (const v of open) expect(v.r).toBe(25);
  });

  it('settles a struck note on its key with the tail draining above it', () => {
    const judge = new Judge([spec(64, 1, 2)]);
    judge.press(64, 1);
    const early = stage.view(judge, 1.5, 4, 1, layout, lanes).find((v) => v.held)!;
    const late = stage.view(judge, 2.5, 4, 1, layout, lanes).find((v) => v.held)!;
    expect(early.y).toBeCloseTo(lanes.strike + early.r * 0.9, 6);
    expect(early.tailBeats).toBeCloseTo(1.5, 6);
    expect(late.tailBeats).toBeCloseTo(0.5, 6);
  });

  it('points at the next onset still to come, and only that one', () => {
    const judge = new Judge([spec(60, 1), spec(64, 1), spec(67, 2)]);
    const views = stage.view(judge, 0, 4, 1, layout, lanes);
    expect([...stage.nextNotes(views)].sort()).toEqual([60, 64]);
  });
});

describe('PlayTune verdict pops', () => {
  let clock = 5;
  beforeEach(() => { clock = 5; resetPlayTuneSettings(); });
  afterEach(() => { vi.restoreAllMocks(); resetPlayTuneSettings(); });

  function rig() {
    const engine = new AudioEngine();
    vi.spyOn(engine, 'now', 'get').mockImplementation(() => clock);
    vi.spyOn(engine, 'running', 'get').mockImplementation(() => true);
    const bed = { clearTracks: vi.fn(), stop: vi.fn(), setTrack: vi.fn(), setNoteTrack: vi.fn(), start: vi.fn() } as unknown as ChordBed;
    const stage = {
      cssW: 1440, cssH: 900, dpr: 1,
      particles: { ring: vi.fn(), burst: vi.fn(), spawn: vi.fn(), shatter: vi.fn() },
      hue: () => 180, kick: vi.fn(),
      quality: { reducedMotion: false }, flat: { floor: 0, unit: 1 },
    } as unknown as Stage;
    const hud = { left: {}, right: {}, banner: vi.fn(), clearPanels: vi.fn(), setDock: vi.fn() } as unknown as Hud;
    const input = new InputHub();
    const ctx: ModeContext = {
      stage, input, audio: engine, bed, music: new MusicState({ ...AURORA.music }), hud,
      openScreen: vi.fn(), setResult: vi.fn(),
    };
    const mode = new PlayTuneMode(ctx);
    mode.enter();
    return { mode, input, stage };
  }

  it('says PERFECT and GOOD once per onset, in the verdict style, and never shakes the keys', () => {
    const { mode, input, stage } = rig();
    expect(mode.start('ode-to-joy')).toBe(true);
    const inner = mode as unknown as { judge: Judge; transport: Transport; scoring: { pops: { label: string; style?: string }[] } };
    const targets = inner.judge.approaching(-Infinity, Infinity);
    const offset = inner.transport.offset;

    // Exactly on the first note: perfect.
    clock = targets[0].time + offset;
    input.press(targets[0].note, 0.8);
    input.release(targets[0].note);
    // Eighty milliseconds late on the second: good.
    clock = targets[1].time + offset + 0.08;
    input.press(targets[1].note, 0.8);
    input.release(targets[1].note);

    const pops = inner.scoring.pops;
    expect(pops.map((p) => p.label)).toEqual(['PERFECT', 'GOOD']);
    expect(pops.map((p) => p.style)).toEqual(['perfect', 'good']);
    expect((stage.kick as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    mode.exit();
  });

  it('fits a tune against the controller window, not the keys on screen', () => {
    const { mode, input } = rig();
    input.mapping.settings = { baseNote: 48, count: 32, autoLatch: false };
    expect(mode.fitFor(mode.tunes[0])).not.toBeNull();
    mode.exit();
  });
});
