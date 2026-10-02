import { describe, it, expect, beforeEach } from 'vitest';
import { PointerKeys } from '../src/app/pointerKeys';

describe('pointer keys', () => {
  let log: string[];
  let keys: PointerKeys;
  const hit = (note: number, force = 0.8) => ({ note, force });

  beforeEach(() => {
    log = [];
    keys = new PointerKeys(
      (note, force) => log.push(`on ${note} ${force}`),
      (note) => log.push(`off ${note}`),
    );
  });

  it('plays a tap and lets it go', () => {
    expect(keys.down(1, hit(60), 0)).toBe(true);
    keys.up(1);
    expect(log).toEqual(['on 60 0.8', 'off 60']);
    expect(keys.size).toBe(0);
  });

  it('ignores a tap that misses the keys', () => {
    expect(keys.down(1, null, 0)).toBe(false);
    keys.up(1);
    expect(log).toEqual([]);
  });

  it('holds a note until the last finger on it lifts', () => {
    keys.down(1, hit(60, 0.7), 0);
    keys.down(2, hit(60, 0.9), 0);
    // The second finger strikes again, as a second key on the computer keyboard does.
    expect(log).toEqual(['on 60 0.7', 'on 60 0.9']);
    keys.up(1);
    expect(log).toHaveLength(2);
    keys.up(2);
    expect(log).toEqual(['on 60 0.7', 'on 60 0.9', 'off 60']);
  });

  it('plays each key a sliding finger crosses, and lets go off the keys', () => {
    keys.down(1, hit(60), 0);
    keys.move(1, hit(60), 0);
    keys.move(1, hit(62), 0);
    keys.move(1, null, 0);
    keys.move(1, null, 0);
    keys.move(1, hit(64), 0);
    keys.up(1);
    expect(log).toEqual(['on 60 0.8', 'off 60', 'on 62 0.8', 'off 62', 'on 64 0.8', 'off 64']);
  });

  it('keeps a slide from releasing a note another finger still holds', () => {
    keys.down(1, hit(60), 0);
    keys.down(2, hit(60), 0);
    keys.move(2, hit(62), 0);
    expect(log).toEqual(['on 60 0.8', 'on 60 0.8', 'on 62 0.8']);
    keys.up(1);
    expect(log.at(-1)).toBe('off 60');
  });

  it('stops a finger sliding once the keys move under it, but keeps its note', () => {
    keys.down(1, hit(60), 3);
    keys.move(1, hit(62), 4);
    expect(log).toEqual(['on 60 0.8']);
    keys.up(1);
    expect(log).toEqual(['on 60 0.8', 'off 60']);
  });

  it('cancels every finger at once, releasing each note once', () => {
    keys.down(1, hit(60), 0);
    keys.down(2, hit(60), 0);
    keys.down(3, hit(64), 0);
    keys.cancelAll();
    expect(log.filter((l) => l.startsWith('off'))).toEqual(['off 60', 'off 64']);
    // The pointers lifting afterwards have nothing left to release.
    keys.up(1);
    keys.up(3);
    expect(log.filter((l) => l.startsWith('off'))).toHaveLength(2);
    expect(keys.size).toBe(0);
  });

  it('lifts a stale contact when its pointer id comes down again', () => {
    keys.down(1, hit(60), 0);
    keys.down(1, hit(64), 0);
    expect(log).toEqual(['on 60 0.8', 'off 60', 'on 64 0.8']);
    keys.up(1);
    expect(log.at(-1)).toBe('off 64');
  });

  it('ignores moves and lifts for pointers it never saw', () => {
    keys.move(9, hit(60), 0);
    keys.up(9);
    expect(log).toEqual([]);
  });
});
