import { describe, expect, it } from 'vitest';
import { STRIKES, strikeFor } from '../src/modes/pinball/strikes';
import { DRUM_SPECS, type DrumVoice } from '../src/audio/drums';
import { MECHS, type MechName } from '../src/audio/surfaces';
import type { SoundTag } from '../src/physics/colliders';
import { Game } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { MusicState } from '../src/audio/musicState';
import { ChordBed } from '../src/audio/bed';
import { PinballAudio } from '../src/modes/pinball/audio';

describe('the table as a band', () => {
  it('gives every scoring family a voice, and names only drums and mechanisms the banks have', () => {
    for (const kind of ['bumper', 'sling', 'target', 'rollover', 'spinner']) {
      expect(STRIKES[kind], kind).toBeDefined();
    }
    for (const [name, s] of Object.entries(STRIKES)) {
      for (const v of s.drum?.voices ?? []) expect(DRUM_SPECS[v], `${name}/${v}`).toBeDefined();
      if (s.roll) expect(MECHS[s.roll.mech], name).toBeDefined();
      if (s.mech) expect(MECHS[s.mech.name], name).toBeDefined();
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
interface Mallet { note: number; gain: number; bright: number; at: number }
interface Drum { voice: DrumVoice; gain: number; at: number }
interface Mech { name: MechName; gain: number; pan: number; at: number }
interface Hit { tag: SoundTag; energy: number; pan?: number; depth?: number; glance?: number; note?: number | null }
interface Scrape { slide: number; pan: number; depth: number }
interface Roll {
  updates: { speed: number; contact: number; pan: number; depth: number }[];
  stopped: boolean;
  update(speed: number, contact: number, pan: number, depth: number): void;
  stop(): void;
}

/** A game wired to an engine that only records what it is asked to play. */
function rig() {
  const mallets: Mallet[] = [];
  const drums: Drum[] = [];
  const mechs: Mech[] = [];
  const hits: Hit[] = [];
  const scrapes: Scrape[] = [];
  const rolls: Roll[] = [];
  /** How many one-shots were taken back, by voice. */
  const cancelled = { mallet: 0, drum: 0, mech: 0 };
  const engine = {
    running: true,
    now: 10,
    settings: { bed: true, assist: false },
    roll: () => {
      const roll: Roll = {
        updates: [], stopped: false,
        update: (speed, contact, pan, depth) => { roll.updates.push({ speed, contact, pan, depth }); },
        stop: () => { roll.stopped = true; },
      };
      rolls.push(roll);
      return roll;
    },
    scrape: (slide: number, pan: number, depth: number) => { scrapes.push({ slide, pan, depth }); },
    mallet: (note: number, gain: number, _pan: number, bright: number, at = 0) => {
      mallets.push({ note, gain, bright, at });
      return { cancel: () => { cancelled.mallet++; } };
    },
    drum: (voice: DrumVoice, gain: number, at = 0) => {
      drums.push({ voice, gain, at });
      return { cancel: () => { cancelled.drum++; } };
    },
    mech: (name: MechName, gain: number, pan = 0, at = 0) => {
      mechs.push({ name, gain, pan, at });
      return { cancel: () => { cancelled.mech++; } };
    },
    hit: (tag: SoundTag, energy: number, opts: Omit<Hit, 'tag' | 'energy'> = {}) => {
      hits.push({ tag, energy, ...opts });
    },
    pad: () => {}, setBedAudible: () => {},
    noteOn: () => {}, noteOff: () => {}, ping: () => {}, swell: () => {},
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
  return { mallets, drums, mechs, hits, scrapes, rolls, hit, game, audio, engine, cancelled, bed };
}

describe('striking the table', () => {

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

  it('ticks the spinner behind its strike, longer the harder it spins', () => {
    const { drums, mechs, hit } = rig();
    hit('spinner', false, 800, 20);
    const roll = mechs.filter((m) => m.name === 'spinner');
    expect(roll.length).toBeGreaterThan(2);
    for (let i = 1; i < roll.length; i++) {
      expect(roll[i].at).toBeGreaterThan(roll[i - 1].at);
      expect(roll[i].gain).toBeLessThan(roll[i - 1].gain);
    }
    expect(drums.some((d) => d.voice === 'shaker')).toBe(true);

    mechs.length = 0;
    hit('spinner', false, 800, 4);
    expect(mechs.filter((m) => m.name === 'spinner').length).toBeLessThan(roll.length);
  });

  it('fires the machine under the music', () => {
    const { mechs, hit } = rig();
    hit('bumper-a');
    hit('sling-l');
    hit('drop-0');
    hit('roll-0');
    expect(mechs.map((m) => m.name)).toEqual(['solenoid', 'solenoid', 'drop', 'switch']);
    for (const m of mechs) {
      expect(m.gain).toBeGreaterThan(0);
      expect(m.gain).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a post silent', () => {
    const { mallets, drums, mechs, hit } = rig();
    hit('post-ul');
    expect(mallets).toHaveLength(0);
    expect(drums).toHaveLength(0);
    expect(mechs).toHaveLength(0);
  });

  /**
   * A sound placed ahead on the clock belongs to the graph, not to the mode
   * that asked for it. Leaving used to clear timers; now it has to take the
   * scheduled hits back itself, or a flourish lands over the next mode.
   */
  it('takes back a roll still in the future when the mode is left', () => {
    const { mechs, hit, audio, cancelled } = rig();
    hit('spinner', false, 800, 20);
    const roll = mechs.filter((m) => m.name === 'spinner').length;
    expect(roll).toBeGreaterThan(0);
    audio.detach();
    expect(cancelled.mech).toBe(roll);
  });

  it('takes back an objective flourish the same way', () => {
    const { mallets, game, audio, cancelled } = rig();
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    expect(mallets.length).toBeGreaterThan(1);
    audio.detach();
    expect(cancelled.mallet).toBe(mallets.length);
  });

  it('takes it back for a pause too, not only for the way out', () => {
    const { mallets, game, audio, cancelled } = rig();
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    expect(mallets.length).toBeGreaterThan(1);

    // The app's hush reaches what is in the engine's shot budget, and a
    // flourish is deliberately not in it — so without this the rest of the
    // run played out behind the pause panel.
    audio.pause();

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

describe('the flourishes', () => {
  const pcs = (ns: readonly number[]) => new Set(ns.map((n) => ((n % 12) + 12) % 12));

  it('run through the chord under them, on the grid, and turn back for an objective', () => {
    const { mallets, game, bed, engine } = rig();
    engine.now = 10.37;
    game.bus.emit('objective', { id: 'arc', label: 'ARC' });
    expect(mallets).toHaveLength(5);
    for (const m of mallets) expect(pcs(bed.chordTones).has(((m.note % 12) + 12) % 12), `${m.note}`).toBe(true);
    expect(mallets[0].at).toBeGreaterThan(engine.now);
    expect(Math.abs(bed.groove.offsetAt(mallets[0].at))).toBeLessThan(1e-9);
    for (let i = 1; i < mallets.length; i++) {
      expect(mallets[i].at - mallets[i - 1].at).toBeCloseTo(bed.groove.stepSeconds, 9);
    }
    const notes = mallets.map((m) => m.note);
    expect(notes[1]).toBeGreaterThan(notes[0]);
    expect(notes[2]).toBeGreaterThan(notes[1]);
    expect(notes[3]).toBeLessThan(notes[2]);
    expect(notes[4]).toBeLessThan(notes[3]);
  });

  it('climb twice as fast for a multiball, and land on a crash', () => {
    const { mallets, drums, game, bed, audio, cancelled } = rig();
    game.bus.emit('multiball', { count: 3 });
    expect(mallets).toHaveLength(6);
    for (let i = 1; i < mallets.length; i++) {
      expect(mallets[i].at - mallets[i - 1].at).toBeCloseTo(bed.groove.stepSeconds / 2, 9);
      expect(mallets[i].note).toBeGreaterThan(mallets[i - 1].note);
    }
    const crash = drums.filter((d) => d.voice === 'crash');
    expect(crash).toHaveLength(1);
    expect(crash[0].at).toBeGreaterThan(mallets[mallets.length - 1].at);
    audio.detach();
    expect(cancelled.drum).toBe(1);
  });

  it('bring the harmony home on a drain', () => {
    const { game, bed } = rig();
    const queued = (): number => (bed as never as { cadenceQueue: unknown[] }).cadenceQueue.length;
    game.bus.emit('drain', { x: 512, y: 30, ballId: 1, saved: false });
    expect(queued()).toBe(2);
    game.bus.emit('drain', { x: 512, y: 30, ballId: 2, saved: true });
    expect(queued()).toBe(2);
  });
});

/** The ball meeting the machine, rather than the music. */
describe('the ball on the table', () => {
  const contact = (over: Partial<{
    sound: SoundTag; energy: number; slide: number; kind: 'surface' | 'paddle' | 'ball';
    note: number | null; x: number; y: number; ball: number; collider: number;
  }> = {}) => ({
    sound: 'wood' as SoundTag, energy: 900, slide: 0, kind: 'surface' as const,
    note: null, x: 512, y: 700, nx: 0, ny: 1, ball: 1, collider: 1, ...over,
  });

  it('rings the surface where and how the ball met it', () => {
    const { hits, game } = rig();
    game.bus.emit('impact', contact({ sound: 'rubber', x: 100, y: game.def.keybed!.baseY }));
    game.bus.emit('impact', contact({ sound: 'metal', x: game.def.width - 100, y: game.def.height, note: 69 }));
    expect(hits.map((h) => h.tag)).toEqual(['rubber', 'metal']);
    expect(hits[0].pan).toBeLessThan(0);
    expect(hits[1].pan).toBeGreaterThan(0);
    expect(hits[0].depth).toBeCloseTo(0, 6);
    expect(hits[1].depth).toBeCloseTo(1, 6);
    expect(hits[1].note).toBe(69);
    expect(hits[0].glance).toBeCloseTo(1, 6);
  });

  it('lets a harder strike through inside the graze window', () => {
    // The gap must never swallow the second bumper of a real rally, so beating
    // the last strike by half again is always worth its own sound.
    const { hits, game } = rig();
    game.bus.emit('impact', contact({ energy: 300 }));
    game.bus.emit('impact', contact({ energy: 320 }));   // barely harder: dropped
    expect(hits).toHaveLength(1);
    game.bus.emit('impact', contact({ energy: 900 }));   // three times harder: kept
    expect(hits).toHaveLength(2);
  });

  it('does not let one surface silence another', () => {
    // A ball rattling between a post and a rail is two sounds and both belong;
    // only a repeat of the *same* surface is a graze.
    const { hits, game } = rig();
    game.bus.emit('impact', contact({ sound: 'rubber', energy: 400 }));
    game.bus.emit('impact', contact({ sound: 'metal', energy: 400 }));
    game.bus.emit('impact', contact({ sound: 'rubber', energy: 400 }));
    expect(hits.map((h) => h.tag)).toEqual(['rubber', 'metal']);
  });

  it('does not let one post silence the next', () => {
    // The case the test above describes but cannot reach. It tells two
    // surfaces apart by their sound tags, and a tag is a material rather than
    // a thing: every post and rubber rail on this table is `rubber` with no
    // note, so nothing in the event distinguished them and a rattle between
    // two posts was heard as one post struck twice.
    const { hits, game } = rig();
    game.bus.emit('impact', contact({ sound: 'rubber', collider: 7, energy: 400 }));
    game.bus.emit('impact', contact({ sound: 'rubber', collider: 9, energy: 400 }));
    expect(hits).toHaveLength(2);

    // The same post twice inside the window is still a graze, which is the
    // whole point of the throttle and must survive the finer identity.
    game.bus.emit('impact', contact({ sound: 'rubber', collider: 7, energy: 400 }));
    expect(hits).toHaveLength(2);
  });

  it('tells a graze from a square hit by the slide', () => {
    const { hits, game } = rig();
    game.bus.emit('impact', contact({ energy: 300, slide: 900 }));
    game.bus.emit('impact', contact({ energy: 900, slide: 0 }));
    expect(hits[0].glance!).toBeLessThan(0.4);
    expect(hits[1].glance!).toBeCloseTo(1, 6);
  });

  it('clicks two balls together, and rings a key the ball lands on', () => {
    const { hits, mechs, game } = rig();
    game.bus.emit('impact', contact({ kind: 'ball', sound: 'metal' }));
    game.bus.emit('impact', contact({ kind: 'paddle', sound: 'key' }));
    expect(mechs.map((m) => m.name)).toEqual(['ballclick']);
    expect(hits.map((h) => h.tag)).toEqual(['key']);
  });

  it('fires the flipper on a throw, harder for a harder key', () => {
    const { mechs, game } = rig();
    const ev = { key: game.keybed.keys[0], velocity: 0.2, speed: 100, x: 300, y: 200, dirX: 0, dirY: 1, offset: 0 };
    game.bus.emit('launch', ev as never);
    game.bus.emit('launch', { ...ev, velocity: 1 } as never);
    expect(mechs.map((m) => m.name)).toEqual(['flipper', 'flipper']);
    expect(mechs[1].gain).toBeGreaterThan(mechs[0].gain);
  });

  it('lets the plunger go on the serve, and drops the ball into the trough at the end', () => {
    const { mechs, game } = rig();
    game.bus.emit('state', { from: 'serve', to: 'play' });
    game.bus.emit('state', { from: 'play', to: 'drained' });
    game.bus.emit('drain', { x: 512, y: 30, ballId: 1, saved: false });
    game.bus.emit('drain', { x: 512, y: 30, ballId: 2, saved: true });
    expect(mechs.map((m) => m.name)).toEqual(['plunger', 'trough', 'kickback']);
  });

  it('scrapes a graze once, not once a step', () => {
    const { scrapes, hits, game, engine } = rig();
    const graze = contact({ energy: 100, slide: 900 });
    game.bus.emit('impact', graze);
    game.bus.emit('impact', graze);
    game.bus.emit('impact', graze);
    // One struck sound, not three. A ball skimming a rail clears the impact
    // threshold on every step of the solver, and every one of those used to
    // ring the surface again -- a couple of hundred bursts a second from a
    // ball that is, to look at, rolling along a wall.
    expect(hits).toHaveLength(1);
    expect(scrapes).toHaveLength(1);
    expect(scrapes[0].slide).toBe(900);
    engine.now += 0.1;
    game.bus.emit('impact', graze);
    expect(scrapes).toHaveLength(2);
    // A square hit slides too little to scrape, however fast.
    game.bus.emit('impact', contact({ energy: 900, slide: 200, ball: 2 }));
    expect(scrapes).toHaveLength(2);
  });
});

describe('the ball rolling', () => {
  it('keeps a roll under every ball and stops it when the ball is gone', () => {
    const { rolls, game, audio } = rig();
    game.spawnBall(400, 700, 500, 0);
    audio.frame();
    expect(rolls).toHaveLength(1);
    expect(rolls[0].updates[0].speed).toBeCloseTo(500, 6);
    expect(rolls[0].updates[0].pan).toBeLessThan(0);

    game.spawnBall(700, 900, 0, 0);
    audio.frame();
    expect(rolls).toHaveLength(2);
    expect(rolls[0].updates).toHaveLength(2);

    // The first ball is gone from the table: its roll is stopped, the other's is not.
    game.balls.splice(0, 1);
    audio.frame();
    expect(rolls[0].stopped).toBe(true);
    expect(rolls[1].stopped).toBe(false);
    expect(rolls[1].updates).toHaveLength(2);
  });

  it('rolls slowly in slow motion, and follows the ball across the table', () => {
    const { rolls, game, audio } = rig();
    const ball = game.spawnBall(400, 700, 600, 0)!;
    audio.frame();
    game.timeScale = 0.25;
    audio.frame();
    ball.p.x = game.def.width - 100;
    ball.p.y = game.def.height - 50;
    audio.frame();
    const [full, slow, far] = rolls[0].updates;
    expect(full.speed).toBeCloseTo(600, 6);
    expect(slow.speed).toBeCloseTo(150, 6);
    expect(far.pan).toBeGreaterThan(0);
    expect(far.depth).toBeGreaterThan(0.9);
    for (const u of rolls[0].updates) expect(u.contact).toBe(1);
  });

  it('opens no roll while audio cannot be heard, and opens one once it can', () => {
    const { rolls, game, audio, engine } = rig();
    engine.running = false;
    game.spawnBall(400, 700, 500, 0);
    audio.frame();
    audio.frame();
    // A roll opened now would be a no-op, cached for the life of the ball.
    expect(rolls).toHaveLength(0);
    engine.running = true;
    audio.frame();
    expect(rolls).toHaveLength(1);
    expect(rolls[0].updates).toHaveLength(1);
  });

  it('stops every roll on pause, and opens none behind the panel', () => {
    const { rolls, game, audio } = rig();
    game.spawnBall(400, 700, 500, 0);
    audio.frame();
    audio.pause();
    expect(rolls[0].stopped).toBe(true);

    // The frames keep coming while the panel is up — the board stays on
    // screen behind it — and a frozen ball's speed never changes, so a roll
    // opened here would hold one unwavering pitch until the panel came down.
    audio.frame();
    audio.frame();
    expect(rolls).toHaveLength(1);

    // And the table rolls again on the way back.
    audio.resume();
    audio.frame();
    expect(rolls).toHaveLength(2);
    expect(rolls[1].stopped).toBe(false);
  });

  it('stops every roll on the way out', () => {
    const { rolls, game, audio } = rig();
    game.spawnBall(400, 700, 500, 0);
    audio.frame();

    audio.detach();

    expect(rolls[0].stopped).toBe(true);
  });
});
