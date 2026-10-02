import { describe, it, expect } from 'vitest';
import { mix, ramp, tone } from '../src/render/palette';
import { THEMES } from '../src/render/theme';

/** `mix` as it was when it read hex alone, to hold hex results to the byte. */
function hexOnlyMix(a: string, b: string, t: number): string {
  const parse = (hex: string): number[] => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const pa = parse(a), pb = parse(b);
  const [r, g, bl] = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Every hex colour a theme names, however deep. */
function hexesOf(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (/^#(?:[0-9a-f]{3}){1,2}$/i.test(value)) out.add(value);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) hexesOf(v, out);
  }
  return out;
}

describe('mix', () => {
  it('mixes hex exactly as it always has, so no theme ramp moves', () => {
    for (const theme of THEMES) {
      const hexes = [...hexesOf(theme)];
      expect(hexes.length).toBeGreaterThan(20);
      const got: string[] = [], want: string[] = [];
      for (const a of hexes) for (const b of hexes) for (const t of [0, 0.15, 0.5, 0.85, 1]) {
        got.push(mix(a, b, t));
        want.push(hexOnlyMix(a, b, t));
      }
      expect(got).toEqual(want);
    }
  });

  it('reads the hsl() that tone() writes, rather than mixing towards black', () => {
    // A lit white key's face, which came out rgb(24, 25, 26).
    expect(mix('#f2f5ff', tone(0, 95, 82), 0.9)).toBe('rgb(252, 173, 174)');
    expect(mix('#ffffff', 'hsl(0 100% 50%)', 1)).toBe('rgb(255, 0, 0)');
    expect(mix('#ffffff', 'hsl(120 100% 50%)', 1)).toBe('rgb(0, 255, 0)');
    expect(mix('#ffffff', 'hsl(240 100% 25%)', 1)).toBe('rgb(0, 0, 128)');
    // Fractional and negative hues: a theme's hue shift can leave either.
    expect(mix('#000000', 'hsl(30.5 100% 50%)', 1)).toBe('rgb(255, 130, 0)');
    expect(mix('#000000', 'hsl(-120 100% 50%)', 1)).toBe('rgb(0, 0, 255)');
    // However small a number gets, it still parses, exponent and all.
    expect(mix('#000000', `hsl(${1e-7} 100% 50%)`, 1)).toBe('rgb(255, 0, 0)');
  });

  it('reads its own rgb() output, so a mix can be mixed again', () => {
    const grey = mix('#000000', '#ffffff', 0.5);
    expect(mix(grey, '#ffffff', 0.5)).toBe('rgb(192, 192, 192)');
    expect(mix('#ffffff', grey, 1)).toBe(grey);
  });

  it('carries alpha, and only writes rgba() when the result is translucent', () => {
    // Nocturne's glass wall: its own neon, faint at the foot.
    const foot = 'rgba(87, 220, 255, 0.15)';
    expect(mix(foot, '#57dcff', 0)).toBe('rgba(87, 220, 255, 0.15)');
    expect(mix(foot, '#57dcff', 0.5)).toBe('rgba(87, 220, 255, 0.575)');
    expect(mix(foot, '#57dcff', 1)).toBe('rgb(87, 220, 255)');
    expect(mix('#000000', 'hsl(0 100% 50% / 0.4)', 1)).toBe('rgba(255, 0, 0, 0.4)');
  });
});

describe('ramp', () => {
  it('walks towards a pitch colour rather than towards black', () => {
    expect(ramp('#000000', tone(0, 100, 50), 2)).toEqual(['rgb(0, 0, 0)', 'rgb(128, 0, 0)', 'rgb(255, 0, 0)']);
  });
});
