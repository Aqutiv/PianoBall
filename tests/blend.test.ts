import { describe, it, expect } from 'vitest';
import { blend } from '../src/render/palette';

describe('blend', () => {
  it('mixes hex colours', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(blend('#ff0000', '#0000ff', 0)).toBe('rgb(255, 0, 0)');
  });

  it('reads the hsl() colours tone() writes, rather than mixing towards black', () => {
    expect(blend('#ffffff', 'hsl(0 100% 50%)', 1)).toBe('rgb(255, 0, 0)');
    expect(blend('#ffffff', 'hsl(120 100% 50%)', 1)).toBe('rgb(0, 255, 0)');
    expect(blend('#ffffff', 'hsl(240 100% 25%)', 1)).toBe('rgb(0, 0, 128)');
    // Fractional hues and an alpha suffix both parse.
    expect(blend('#000000', 'hsl(30.5 100% 50% / 0.4)', 1)).toBe('rgb(255, 130, 0)');
  });

  it('reads its own output, so a blend can be blended again', () => {
    const grey = blend('#000000', '#ffffff', 0.5);
    expect(blend(grey, '#ffffff', 0.5)).toBe('rgb(192, 192, 192)');
  });
});
