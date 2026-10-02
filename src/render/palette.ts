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

/**
 * `a` taken `t` of the way to `b`.
 *
 * Either end can be any colour the app writes: a theme's hex, the `hsl()` that
 * `tone` returns, or an `rgb()` this returned, so a mix can be mixed again. It
 * used to read hex alone and quietly mixed anything else towards black — every
 * key lit towards its pitch went dark grey instead.
 *
 * Alpha is carried as well, for the theme colours written as `rgba()`. Opaque
 * ends still give exactly the `rgb()` they always did, so no ramp moves.
 */
export function mix(a: string, b: string, t: number): string {
  const pa = parseColor(a), pb = parseColor(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  const al = pa[3] + (pb[3] - pa[3]) * t;
  return al >= 1 ? `rgb(${r}, ${g}, ${bl})` : `rgba(${r}, ${g}, ${bl}, ${Math.round(al * 1000) / 1000})`;
}

/**
 * `mix` for any colour the app writes: hex, `rgb()`, or the `hsl()` that
 * `tone` returns.
 *
 * `mix` reads hex only, because it is fed theme constants — and handed a
 * `tone()` colour it quietly mixes towards black instead. Anything that blends
 * towards a pitch colour, or blends a blend, comes through here.
 */
export function blend(a: string, b: string, t: number): string {
  const pa = parseAny(a), pb = parseAny(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Parsed colours for `blend`. Capped, because blends of blends are endless. */
const ANY = new Map<string, [number, number, number]>();

function parseAny(color: string): [number, number, number] {
  const hit = ANY.get(color);
  if (hit) return hit;
  let rgb: [number, number, number];
  if (color.startsWith('#')) {
    rgb = parseHex(color);
  } else {
    const n = (color.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    rgb = color.startsWith('hsl')
      ? hslToRgb(n[0] ?? 0, (n[1] ?? 0) / 100, (n[2] ?? 0) / 100)
      : [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
  }
  if (ANY.size > 4096) ANY.clear();
  ANY.set(color, rgb);
  return rgb;
}

function hslToRgb(hue: number, s: number, l: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * An evenly spaced `mix` from `a` to `b`, cached whole.
 *
 * The extrusions walk a gradient in fixed steps — a column is ten discs from
 * its bottom colour to its top — and every one of those steps was re-parsing
 * two hex strings and building a third. There are only a handful of distinct
 * (from, to, steps) triples in a theme, and they never change while it is the
 * theme, so the whole ramp is worth keeping.
 *
 * Exact rather than quantised: the returned entries are the same strings
 * `mix` would have produced at the same `t`, so nothing moves by a single bit.
 */
const RAMPS = new Map<string, readonly string[]>();

export function ramp(a: string, b: string, steps: number): readonly string[] {
  const key = `${a}|${b}|${steps}`;
  const hit = RAMPS.get(key);
  if (hit) return hit;
  const out: string[] = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) out[i] = mix(a, b, i / steps);
  RAMPS.set(key, out);
  return out;
}

/**
 * Parsed once per colour.
 *
 * Themes name a few dozen colours between them and `mix` was pulling every one
 * of them apart again on every call — a string replace, sometimes a split and
 * a join, and a parseInt, a few hundred times a frame.
 *
 * Capped, because not every colour is a theme's: `tone` writes a new string
 * for every frame of a flash fading out, and mixes of mixes hardly repeat.
 */
type Rgba = [number, number, number, number];
const PARSED = new Map<string, Rgba>();

function parseColor(color: string): Rgba {
  const hit = PARSED.get(color);
  if (hit) return hit;
  let rgba: Rgba;
  if (color.startsWith('#')) {
    rgba = parseHex(color);
  } else {
    // `rgb(r, g, b)`, `rgba(r, g, b, a)`, `hsl(h s% l%)` and `hsl(h s% l% / a)`
    // all list their numbers in the same order.
    const n = (color.match(NUMBER) ?? []).map(Number);
    const [r, g, b] = color.startsWith('hsl')
      ? hslToRgb(n[0] ?? 0, (n[1] ?? 0) / 100, (n[2] ?? 0) / 100)
      : [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
    rgba = [r, g, b, Math.min(1, Math.max(0, n[3] ?? 1))];
  }
  if (PARSED.size >= 4096) PARSED.clear();
  PARSED.set(color, rgba);
  return rgba;
}

/** A number as JavaScript prints one, exponent included. */
const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function parseHex(hex: string): Rgba {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

function hslToRgb(hue: number, s: number, l: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Direction the virtual key light comes from, in table space. */
export const LIGHT = { x: -0.42, y: 0.72, z: 0.55 };
