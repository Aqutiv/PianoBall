import { describe, expect, it } from 'vitest';
import { STRIKES, strikeFor } from '../src/modes/pinball/strikes';
import { DRUM_SPECS, type DrumVoice } from '../src/audio/drums';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { MusicState } from '../src/audio/musicState';
import { ChordBed } from '../src/audio/bed';
import { PinballAudio } from '../src/modes/pinball/audio';

describe('the table as a band', () => {
  it('gives every scoring family a voice, and names only drums the bank has', () => {
    for (const kind of ['bumper', 'sling', 'target', 'rollover', 'spinner']) {
      expect(STRIKES[kind], kind).toBeDefined();
    }
    for (const [name, s] of Object.entries(STRIKES)) {
      for (const v of s.drum?.voices ?? []) expect(DRUM_SPECS[v], `${name}/${v}`).toBeDefined();
      if (s.roll) expect(DRUM_SPECS[s.roll.voice], name).toBeDefined();
      if (s.mallet) {
        expect(s.mallet.bright, name).toBeGreaterThanOrEqual(0);
        expect(s.mallet.bright, name).toBeLessThanOrEqual(1);
        expect(s.mallet.gain, name).toBeGreaterThan(0);
      }
    }
  });

  it('tells the dome lanes from the arc by their group', () => {
    const game = new Game(new InputHub(), AURORA, new MusicState({ ...AURORA.music }));
    expect(strikeFor(game.table.byId.get('roll-0')!)).toBe(STRIKES.lanes);
    expect(strikeFor(game.table.byId.get('arc-0')!)).toBe(STRIKES.rollover);
    expect(strikeFor(game.table.byId.get('post-ul')!)).toBeUndefined();
  });
});

/**
 * What reaches the engine when the ball hits something. Counted rather than
 * heard: the engine here is a recorder, so what is asserted is the routing.
 */
describe('striking the table', () => {
  interface Mallet { note: number; gain: number; bright: number }
  interface Drum { voice: DrumVoice; gain: number; at: number }

  function rig() {
    const mallets: Mallet[] = [];
    const drums: Drum[] = [];
    /** How many one-shots were taken back, by voice. */
    const cancelled = { mallet: 0, drum: 0 };
    const engine = {
      running: true,
      now: 10,
      settings: { bed: true, assist: false },
      mallet: (note: number, gain: number, _pan: number, bright: number) => {
        mallets.push({ note, gain, bright });
        return { cancel: () => { cancelled.mallet++; } };
      },
      drum: (voice: DrumVoice, gain: number, at = 0) => {
        drums.push({ voice, gain, at });
        return { cancel: () => { cancelled.drum++; } };
      },
      pad: () => {}, setBedAudible: () => {},
      noteOn: () => {}, noteOff: () => {}, ping: () => {}, impact: () => {}, swell: () => {},
    };
    const music = new MusicState({ ...AURORA.music });
    const game = new Game(new InputHub(), AURORA, music);
    const bed = new ChordBed(engine as never, music);
    const audio = new PinballAudio(engine as never, bed, game);
    audio.attach();
    const hit = (id: string, energised = false, impact = 800, spinRate = 0) => {
      const el = game.table.byId.get(id)!;
      el.spinRate = spinRate;
      game.bus.emit('element', { el, energised, impact, x: el.x, y: el.y });
    };
    return { mallets, drums, hit, game, audio, engine, cancelled };
  }

  it('keeps the bumpers as they were', () => {
    const { mallets, drums, hit } = rig();
    hit('bumper-a');
    expect(drums).toHaveLength(0);
    expect(mallets).toHaveLength(1);
    expect(mallets[0].bright).toBeCloseTo(0.45, 6);
    expect(mallets[0].gain).toBeCloseTo(0.18 + 800 / 2600, 6);
  });

  it('makes a sling a drum, picked by the side of the table it is on', () => {
    const { drums, hit } = rig();
    hit('sling-l');
    hit('sling-r');
    expect(drums.map((d) => d.voice)).toEqual(['kick', 'tomLo']);
  });

  it('rings the dome lanes and plucks the targets', () => {
    const { mallets, hit, game } = rig();
    hit('roll-0');
    hit('drop-0');
    expect(mallets[0].note).toBe(game.table.byId.get('roll-0')!.note);
    expect(mallets[0].bright).toBe(1);
    expect(mallets[1].bright).toBeLessThan(0.2);
  });

  it('still plays an energised element louder and brighter', () => {
    const { mallets, hit } = rig();
    hit('bumper-a', false);
    hit('bumper-a', true);
    expect(mallets[1].gain).toBeCloseTo(mallets[0].gain * 1.5, 6);
    expect(mallets[1].bright).toBeGreaterThan(mallets[0].bright);
  });

  it('rolls the hat behind a spinner, longer the harder it spins', () => {
    const { drums, hit } = rig();
    hit('spinner', false, 800, 20);
    const roll = drums.filter((d) => d.voice === 'hat');
    expect(roll.length).toBeGreaterThan(2);
    for (let i = 1; i < roll.length; i++) {
      expect(roll[i].at).toBeGreaterThan(roll[i - 1].at);
      expect(roll[i].gain).toBeLessThan(roll[i - 1].gain);
    }
    expect(drums.some((d) => d.voice === 'shaker')).toBe(true);

    drums.length = 0;
    hit('spinner', false, 800, 4);
    expect(drums.filter((d) => d.voice === 'hat').length).toBeLessThan(roll.length);
  });

  it('leaves a post silent', () => {
    const { mallets, drums, hit } = rig();
    hit('post-ul');
    expect(mallets).toHaveLength(0);
    expect(drums).toHaveLength(0);
  });

  /**
   * A sound placed ahead on the clock belongs to the graph, not to the mode
   * that asked for it. Leaving used to clear timers; now it has to take the
   * scheduled hits back itself, or a flourish lands over the next mode.
   */
  it('takes back a roll still in the future when the mode is left', () => {
    const { drums, hit, audio, cancelled } = rig();
    hit('spinner', false, 800, 20);
    const roll = drums.filter((d) => d.voice === 'hat').length;
    expect(roll).toBeGreaterThan(0);
    audio.detach();
    expect(cancelled.drum).toBe(roll);
  });

  it('takes back an objective flourish the same way', () => {
    const { mallets, game, audio, cancelled } = rig();
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    expect(mallets.length).toBeGreaterThan(1);
    audio.detach();
    expect(cancelled.mallet).toBe(mallets.length);
  });

  it('forgets a flourish that has already played out', () => {
    const { game, audio, engine, cancelled } = rig();
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    // Well past the last note: nothing left worth taking back.
    engine.now += 30;
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    audio.detach();
    expect(cancelled.mallet).toBe(5);
  });
});
