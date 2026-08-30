/**
 * Pre-baked additive glow sprites.
 *
 * Building a radial gradient per particle is the single most expensive thing a
 * Canvas 2D particle system can do. These are rendered once per hue/size and
 * then blitted, which is what keeps a few thousand sparks affordable.
 */
import { getTheme } from './themes';

const cache = new Map<string, HTMLCanvasElement>();

const HUE_STEPS = 24;

export function glowSprite(hue: number, size: number, softness = 1): HTMLCanvasElement {
  const theme = getTheme();
  /*
   * The same hue shift the solid colours get.
   *
   * Callers pass a raw pitch hue, and the objects those halos sit behind are
   * painted through `tone()`, which rotates the wheel by the theme's shift.
   * Leaving it off here put Velvet's glow 18 degrees away from the ribbon it
   * was supposed to be the light of.
   */
  const shifted = hue + theme.tone.hueShift;
  const h = Math.round((((shifted % 360) + 360) % 360) / (360 / HUE_STEPS)) * (360 / HUE_STEPS);
  const s = Math.max(8, Math.round(size));
  // The theme is in the key too: it sets the ramp below, so a sprite baked
  // under one look must not be handed back under another.
  const gl = theme.glow;
  const key = `${h}|${s}|${softness.toFixed(2)}|${theme.id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const r = s / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  // A hot near-white core reading out to saturated colour is what makes an
  // additive sprite look like light rather than a coloured blob.
  g.addColorStop(0, `hsl(${h} 100% ${gl.coreLight}% / 1)`);
  g.addColorStop(0.18, `hsl(${h} 96% ${gl.midLight}% / 0.95)`);
  g.addColorStop(0.45 * softness, `hsl(${h} ${gl.midSat}% 56% / ${gl.midAlpha})`);
  g.addColorStop(1, `hsl(${h} 90% 48% / 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  cache.set(key, canvas);
  return canvas;
}

/** Soft shadow blob used under balls and raised parts. */
export function shadowSprite(size = 96): HTMLCanvasElement {
  const key = `shadow|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.24)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, canvas);
  return canvas;
}
