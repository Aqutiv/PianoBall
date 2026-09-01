import { describe, expect, it } from 'vitest';
import { predictLanding } from '../src/game/predict';
import { crownAt } from '../src/game/keyLayout';
import { Game, INTENSITY_HOLD } from '../src/game/game';
import { AURORA } from '../src/game/table/tables/aurora';
import { InputHub } from '../src/midi/inputHub';
import { MusicState } from '../src/audio/musicState';
import type { KeyState } from '../src/game/keybed';
import type { TableElement } from '../src/game/table/schema';

/**
 * The first tests of the game itself, as opposed to the physics under it.
 *
 * The claims worth pinning here are the ones about *reach*: which parts of the
 * table a given press can get to, and whether a return that leaves the keybed
 * ever scores anything. Both were assumed rather than measured, and both turned
 * out to be wrong.
 */

/** A game stepped by hand, with no shell, renderer or audio around it. */
function rig() {
  const input = new InputHub();
  const music = new MusicState({ ...AURORA.music });
  const game = new Game(input, AURORA, music);
  game.active = true;
  return { input, game };
}

const STEP = 1 / 240;

function press(input: InputHub, note: number, raw: number): void {
  input.dispatch({ type: 'noteon', note, velocity: raw, raw, time: 0, source: 'debug' });
}
function lift(input: InputHub, note: number): void {
  input.dispatch({ type: 'noteoff', note, time: 0, source: 'debug' });
}

/** The key nearest a given x, which is the one a ball there would land on. */
function keyNear(game: Game, x: number): KeyState {
  let best = game.keybed.keys[0];
  for (const k of game.keybed.keys) {
    if (Math.abs(k.geom.cx - x) < Math.abs(best.geom.cx - x)) best = k;
  }
  return best;
}

/**
 * Put a still ball on a key's face and hit it. This isolates the key's own
 * throw: with no incoming speed there is nothing for `carry` to give back, so
 * the apex is a pure function of how hard the key was pressed.
 */
function apexFromRest(raw: number, x = 512, offset = 0): { apex: number; hits: string[]; scored: number } {
  const { input, game } = rig();
  game.newGame();
  game.state = 'play';
  game.held = null;
  game.world.balls.length = 0;

  const k = keyNear(game, x);
  const g = k.geom;
  // Along the key face, then out along its normal: this is the frame the strike
  // offset is measured in, so placing the ball here is the same as hitting the
  // key that far off centre.
  const ax = Math.cos(g.tilt) * g.halfW * offset;
  const ay = Math.sin(g.tilt) * g.halfW * offset;
  const ball = game.spawnBall(g.cx + ax + g.nx * 20, g.cy + ay + g.ny * 20, 0, 0)!;

  const hits: string[] = [];
  let scored = 0;
  game.bus.on('element', (e: { el: TableElement }) => {
    if (!hits.includes(e.el.id)) hits.push(e.el.id);
  });
  game.bus.on('score', (e: { amount: number }) => { scored += e.amount; });

  press(input, g.note, raw);
  let apex = ball.p.y;
  for (let i = 0; i < 900; i++) {
    game.step(STEP);
    if (i === 30) lift(input, g.note);
    if (!ball.alive) break;
    if (ball.p.y > apex) apex = ball.p.y;
  }
  return { apex, hits, scored };
}

/** Every x the probe sweeps, spread across the keybed. */
const COLUMNS = [190, 240, 300, 360, 420, 512, 600, 660, 720, 790, 838];

describe('reach', () => {
  /**
   * The complaint this whole change answers was that returns felt weak and the
   * table felt empty. Both were measurable, and both measured badly: a centre
   * return could not score at any press velocity, because the only thing above
   * the centre keys was a post that scores nothing.
   */
  it('lets a return score from anywhere on the keybed', () => {
    const barren: string[] = [];
    for (const x of COLUMNS) {
      const best = Math.max(
        apexFromRest(92, x, -0.5).scored,
        apexFromRest(92, x, 0).scored,
        apexFromRest(92, x, 0.5).scored,
      );
      if (best === 0) barren.push(`x=${x}`);
    }
    expect(barren).toEqual([]);
  });

  it('makes press velocity worth something in the middle', () => {
    // Straight up the centre used to apex at 543 for raw 42 and 543 for raw
    // 127 alike. Aim is the other half of it, so this checks the pair.
    const soft = apexFromRest(42, 512, 0.5);
    const hard = apexFromRest(127, 512, 0.5);
    expect(hard.apex).toBeGreaterThan(soft.apex + 100);
  });

  it('gives every key somewhere to throw a ball', () => {
    // The keybed used to run under the slingshot assemblies, roofing the four
    // outermost keys at each end 30 units above their own faces.
    for (const x of [COLUMNS[0], COLUMNS[COLUMNS.length - 1]]) {
      expect(apexFromRest(92, x, 0).apex).toBeGreaterThan(400);
    }
  });

  it('keeps the drop-target bank reachable from the centre', () => {
    const { hits } = apexFromRest(92, 512, 0);
    expect(hits.some((id) => id.startsWith('drop-'))).toBe(true);
  });

  it('crosses the centre gate on the way up and the way down', () => {
    const { input, game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;

    const k = keyNear(game, 512);
    const g = k.geom;
    const ball = game.spawnBall(g.cx + g.nx * 20, g.cy + g.ny * 20, 0, 0)!;
    let crossings = 0;
    game.bus.on('element', (e: { el: TableElement }) => {
      if (e.el.id === 'spin-mid') crossings++;
    });

    press(input, g.note, 92);
    for (let i = 0; i < 900 && ball.alive; i++) {
      game.step(STEP);
      if (i === 30) lift(input, g.note);
    }
    expect(crossings).toBeGreaterThanOrEqual(2);
  });
});

describe('scoring', () => {
  it('keeps a combo across a return, and lapses it when play goes quiet', () => {
    const { game } = rig();
    const s = game.scoring;
    for (let i = 0; i < 5; i++) s.chain();
    expect(s.combo).toBe(5);

    // A rally: nothing scores for a moment, but not long enough to lapse.
    for (let i = 0; i < 240 * 2; i++) s.update(STEP);
    expect(s.combo).toBe(5);

    for (let i = 0; i < 240; i++) s.update(STEP);
    expect(s.combo).toBe(0);
  });

  it('lets resonance climb instead of decaying as fast as it is earned', () => {
    const { game } = rig();
    const s = game.scoring;
    // Five energised hits spread over two seconds, which used to net nothing:
    // the +0.3 a hit was worth decayed away in under a quarter of a second.
    for (let i = 0; i < 5; i++) {
      s.setResonance(s.resonance + 0.45);
      for (let j = 0; j < 240 * 0.4; j++) s.update(STEP);
      s.setResonance(Math.max(1, s.resonance - 0.55 * 0.4));
    }
    expect(s.resonance).toBeGreaterThan(2);
  });

  it('scores a four-note chord above a three-note one', () => {
    const three = rig();
    three.game.newGame();
    for (const n of [62, 65, 69]) press(three.input, n, 92);

    const four = rig();
    four.game.newGame();
    for (const n of [62, 65, 69, 72]) press(four.input, n, 92);

    expect(four.game.scoring.score).toBeGreaterThan(three.game.scoring.score);
  });
});

/**
 * The music follows the rally through one number, and the claims that matter
 * are about its edges: it rises the moment there is something to hear, waits
 * through a lull, and stops dead with the ball.
 */
describe('intensity', () => {
  function inPlay() {
    const { game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;
    const levels: number[] = [];
    game.bus.on('intensity', (e: { level: number }) => levels.push(e.level));
    return { game, levels };
  }

  it('rises the moment a rally starts, and says so once', () => {
    const { game, levels } = inPlay();
    for (let i = 0; i < 6; i++) game.scoring.chain();
    game.step(STEP);
    expect(game.intensity).toBe(2);
    expect(levels).toEqual([2]);
    game.step(STEP);
    expect(levels, 'an edge, not a repeat').toEqual([2]);
  });

  it('holds through a lull before it falls', () => {
    const { game } = inPlay();
    for (let i = 0; i < 6; i++) game.scoring.chain();
    game.step(STEP);
    game.scoring.breakChain();
    for (let i = 0; i < 240; i++) game.step(STEP);
    expect(game.intensity, 'a second of quiet is still a rally').toBe(2);
    for (let i = 0; i < 240 * (INTENSITY_HOLD + 0.1); i++) game.step(STEP);
    expect(game.intensity).toBe(0);
  });

  it('drops at once when the ball is lost', () => {
    const { game, levels } = inPlay();
    for (let i = 0; i < 12; i++) game.scoring.chain();
    game.step(STEP);
    expect(game.intensity).toBe(3);
    // Straight into the drain, with no save to catch it.
    const ball = game.spawnBall(512, 60, 0, -400)!;
    ball.safeFor = 0;
    for (let i = 0; i < 240 && game.state === 'play'; i++) game.step(STEP);
    expect(game.state).toBe('drained');
    expect(game.intensity).toBe(0);
    expect(levels.at(-1)).toBe(0);
  });
});

describe('objectives', () => {
  it('resets the arc and pays out when all five are lit', () => {
    const { game } = rig();
    game.newGame();
    const arc = game.table.elements.filter((e) => e.group === 'arc');
    expect(arc).toHaveLength(5);

    const objectives: string[] = [];
    game.bus.on('objective', (e: { id: string }) => objectives.push(e.id));

    // Roll each one in turn, the way a ball crossing them would.
    for (const el of arc) {
      game.spawnBall(el.x, el.y + 90, 0, -600);
      for (let i = 0; i < 240 && !el.down; i++) game.step(STEP);
      game.world.balls.length = 0;
    }

    expect(objectives).toContain('arc');
    expect(arc.every((e) => !e.down)).toBe(true);
  });
});

describe('catch', () => {
  /** A ball rolling on a key that is already held down. */
  function cradled() {
    const { input, game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;

    const k = keyNear(game, 512);
    const g = k.geom;
    press(input, g.note, 92);
    // Past the launch window, so the press is no longer a strike.
    for (let i = 0; i < 30; i++) game.step(STEP);
    const ball = game.spawnBall(g.cx + g.nx * 24, g.cy + g.ny * 24, 40, -30)!;
    for (let i = 0; i < 30; i++) game.step(STEP);
    return { input, game, key: k, ball };
  }

  it('holds a ball still on a key that is already down', () => {
    const { game, ball } = cradled();
    const at = { x: ball.p.x, y: ball.p.y };
    for (let i = 0; i < 120; i++) game.step(STEP);
    expect(Math.hypot(ball.p.x - at.x, ball.p.y - at.y)).toBeLessThan(1);
    // The pin lands before the solver, so one step of gravity always follows
    // it — the same residual the serve's own held ball carries.
    expect(Math.hypot(ball.v.x, ball.v.y)).toBeLessThan(20);
  });

  it('throws it once, when the key comes up', () => {
    const { input, game, key, ball } = cradled();
    const launches: number[] = [];
    game.bus.on('launch', (e: { ballId: number; speed: number }) => launches.push(e.speed));

    lift(input, key.geom.note);
    for (let i = 0; i < 60; i++) game.step(STEP);

    expect(launches).toHaveLength(1);
    expect(launches[0]).toBeGreaterThanOrEqual(game.keybed.tuning.baseSpeed);
    expect(ball.v.y).toBeGreaterThan(0);
  });

  it('will not freeze multiball a ball at a time', () => {
    const { game } = cradled();
    // A second ball on another held key must not also stop.
    const other = keyNear(game, 700);
    game.keybed.noteOn(other.geom.note, 0.7);
    for (let i = 0; i < 30; i++) game.step(STEP);
    const g = other.geom;
    const second = game.spawnBall(g.cx + g.nx * 24, g.cy + g.ny * 24, 30, -30)!;
    for (let i = 0; i < 30; i++) game.step(STEP);
    expect(Math.hypot(second.v.x, second.v.y)).toBeGreaterThan(0);
  });

  it('lets the ball go when the keybed is rebuilt under it', () => {
    const { game, ball } = cradled();
    // Auto-latching remaps the keyboard when a note arrives out of range, which
    // discards every key. A cradle still pointing at a discarded key would pin
    // the ball to geometry no longer on the table, and lifting the physical key
    // could not free it, because the note now resolves to the rebuilt one.
    const at = { x: ball.p.x, y: ball.p.y };
    game.remapKeybed();
    for (let i = 0; i < 240; i++) game.step(STEP);
    // A pinned ball keeps a step of gravity in it, so speed alone proves
    // nothing — what proves it is that the ball is no longer where it was held.
    expect(Math.hypot(ball.p.x - at.x, ball.p.y - at.y)).toBeGreaterThan(40);
    expect(game.keybed.keys.some((k) => k.caught !== null)).toBe(false);
  });

  it('lets go on its own rather than holding the ball for ever', () => {
    const { game, ball } = cradled();
    for (let i = 0; i < 240 * 2; i++) game.step(STEP);
    expect(Math.hypot(ball.v.x, ball.v.y)).toBeGreaterThan(0);
  });
});

/**
 * Where a ball first comes down onto the keybed, which is what the predictor
 * claims. Measured on the first descent into the band and not after: past that
 * the ball bounces and rolls along the crown, which is a different question.
 */
function firstTouchdownX(game: Game, ball: { alive: boolean; p: { x: number; y: number }; v: { y: number }; r: number }): number | null {
  const L = game.keybed.layout;
  for (let i = 0; i < 900; i++) {
    game.step(STEP);
    if (!ball.alive) return null;
    const face = L.baseY + crownAt(ball.p.x, L) + ball.r + 5;
    if (ball.v.y < 0 && ball.p.y <= face + 20) return ball.p.x;
  }
  return null;
}

describe('landing predictor', () => {
  it('names the key a falling ball actually reaches', () => {
    const { game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;

    let checked = 0;
    // Below the drop-target bank: the bank is solid until it is cleared, and
    // the predictor deliberately says nothing through it.
    for (const vx of [-260, 0, 340]) {
      const ball = game.spawnBall(512, 700, vx, -120)!;
      const guess = predictLanding(ball, game.world, game.keybed);
      if (!guess) { game.world.balls.length = 0; continue; }

      const x = firstTouchdownX(game, ball);
      if (x !== null) {
        const actual = game.keybed.keyAtX(x)!;
        // One key either side: the affordance has to point somewhere the hand
        // can reach, not resolve the contact.
        expect(Math.abs(actual.geom.lane - guess.lane)).toBeLessThanOrEqual(1);
        checked++;
      }
      game.world.balls.length = 0;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('follows the curve a spinning ball is actually on', () => {
    const { game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;
    expect(game.world.cfg.magnus).not.toBe(0);

    // Launches put real spin on the ball, and the world curves it. A predictor
    // that integrated straight ballistics under a world that curves would drift
    // off the true path and name the key next to the right one.
    const ball = game.spawnBall(512, 700, 0, -140)!;
    ball.spin = -260;
    const guess = predictLanding(ball, game.world, game.keybed)!;
    expect(guess).not.toBeNull();
    // That spin bends the landing about three key widths off the ballistic
    // path, so ignoring it would point at the wrong key, not merely a rough one.
    expect(Math.abs(guess.x - 512)).toBeGreaterThan(40);

    const x = firstTouchdownX(game, ball);
    expect(x).not.toBeNull();
    expect(Math.abs(x! - guess.x)).toBeLessThan(game.keybed.keys[0].geom.halfW);
  });

  it('says nothing rather than guessing through an obstruction', () => {
    const { game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;
    // Straight down onto a post: where it goes after that is not ballistics.
    const post = game.table.elements.find((e) => e.id === 'post-ul')!;
    const ball = game.spawnBall(post.x, post.y + 160, 0, -400)!;
    expect(predictLanding(ball, game.world, game.keybed)).toBeNull();
  });

  it('ignores a ball that is still on its way up', () => {
    const { game } = rig();
    game.newGame();
    game.state = 'play';
    game.held = null;
    game.world.balls.length = 0;
    const ball = game.spawnBall(512, 300, 0, 1800)!;
    const guess = predictLanding(ball, game.world, game.keybed);
    // It does land eventually — but not before it has been to the top.
    expect(guess === null || guess.t > 0.9).toBe(true);
  });
});
