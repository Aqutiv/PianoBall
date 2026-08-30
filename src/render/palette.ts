import { pitchClass } from '../midi/notes';
import { getTheme } from './themes';

/**
 * Pitch classes get their own hue, walking the circle of fifths rather than
 * chromatically. Notes that sound related end up next to each other in colour,
 * so the table reads as a harmony rather than a rainbow.
 */
const FIFTHS_POSITION = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export function pitchHue(note: number): number {
  const idx = FIFTHS_POSITION.indexOf(pitchClass(note));
  return ((idx < 0 ? 0 : idx) / 12) * 360;
}

export function pitchColor(note: number, sat?: number, light?: number, alpha = 1): string {
  const t = getTheme().tone;
  return tone(pitchHue(note), sat ?? t.sat, light ?? t.light, alpha);
}

/**
 * An `hsl()` colour, bent by the active theme.
 *
 * Nearly every emissive thing on the canvas is pitch-coloured — ribbons,
 * blooms, auras, key highlights, the piano roll — and each call site used to
 * carry its own saturation and lightness. Routing them all through here means
 * a theme moves the whole emissive field with three numbers instead of needing
 * a token per call site, and Nocturne's identity curve leaves every one of
 * them exactly as it was.
 */
export function tone(hue: number, sat: number, light: number, alpha = 1): string {
  const t = getTheme().tone;
  const h = (hue + t.hueShift) % 360;
  const s = Math.min(100, Math.max(0, sat * t.satScale));
  const l = Math.min(100, Math.max(0, light * t.lightScale));
  return alpha >= 1 ? `hsl(${h} ${s}% ${l}%)` : `hsl(${h} ${s}% ${l}% / ${alpha})`;
}

/**
 * Colour-blind-safe pitch hue.
 *
 * Walks blue to violet to magenta to orange, the long way round the wheel, so
 * it never crosses the red/green axis that the common deficiencies confuse.
 * Twelve pitches still get twelve distinguishable colours.
 */
export function pitchHueSafe(note: number): number {
  const idx = FIFTHS_POSITION.indexOf(pitchClass(note));
  return (200 + ((idx < 0 ? 0 : idx) / 12) * 205) % 360;
}

export function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return hex;
}

export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Direction the virtual key light comes from, in table space. */
export const LIGHT = { x: -0.42, y: 0.72, z: 0.55 };
