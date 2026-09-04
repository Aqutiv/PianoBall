import type { WallStyle } from '../../game/table/schema';

/**
 * Every colour the app names, in one shape.
 *
 * Widened from the original nine: the DOM chrome carried another dozen as
 * literals in `styles.css`, and the canvas carried eighty more inline. A theme
 * cannot be a theme while half its colours are unreachable, so they all live
 * here and `applyTheme` pushes every one of them into CSS.
 */
export interface TablePalette {
  /** Deep background outside the playfield. */
  void: string;
  /** Playfield surface, near and far, for the vertical gradient. */
  floorNear: string;
  floorFar: string;
  /** Below `floorFar` — the darkest point the table reaches at the horizon. */
  floorDeep: string;
  /** Primary and secondary neon. */
  neon: string;
  neon2: string;
  /** Warm accent used sparingly for high-value features. */
  accent: string;
  rail: string;
  railTop: string;
  ink: string;
  /** Secondary text and micro-labels. */
  dim: string;
  /** Panel fill and hairline, both translucent. */
  panel: string;
  stroke: string;
  /** Status semantics. `warn` is usually `accent`, but need not be. */
  ok: string;
  warn: string;
  danger: string;
  /** The five PlayTune verdicts, in judgement order. */
  verdict: {
    perfect: string;
    good: string;
    ok: string;
    miss: string;
    wrong: string;
  };
}

/**
 * The extruded piano keys along the near edge.
 *
 * `side` is the wall of the extrusion, `top` the colour it climbs toward, and
 * the two `face` stops the gradient across the surface the ball strikes. Pitch
 * colour is mixed into all four as a key lights, which is why these are the
 * unlit ends rather than finished colours.
 */
export interface KeyMaterial {
  whiteSide: string;
  whiteTop: string;
  whiteFaceHi: string;
  whiteFaceLo: string;
  blackSide: string;
  blackTop: string;
  blackFaceHi: string;
  blackFaceLo: string;
}

/** Bottom and top colour of an extruded wall. */
export type WallColors = [string, string];

/**
 * The silkscreen printed on the playfield, by role rather than by colour.
 *
 * A table names the part its markings play — the lane guides, the deep glow
 * behind the keybed, the red around the outlanes — and the theme decides what
 * those look like. Storing hex on the decal itself is what left the baked
 * playfield wearing Nocturne's cyan under every other theme.
 */
export type DecalTint = 'primary' | 'secondary' | 'deep' | 'guide' | 'danger';

export type DecalPalette = Record<DecalTint, string>;

/**
 * How a theme tilts every `hsl()` in the app at once.
 *
 * Nearly all emissive colour is pitch-derived — ribbons, blooms, auras, key
 * highlights, the piano roll — and each call site had its own saturation and
 * lightness baked in. Rather than tokenising twenty of those separately, every
 * call now goes through `tone()` and a theme moves them together: Velvet pulls
 * the whole field warmer and calmer, Neon Rush drives it harder.
 *
 * Identity is `{ hueShift: 0, satScale: 1, lightScale: 1 }`, which is what
 * Nocturne uses — so the mechanism is a no-op until a theme asks for something.
 */
export interface ToneCurve {
  /** Degrees added to every pitch hue. */
  hueShift: number;
  satScale: number;
  lightScale: number;
  /** Defaults for `pitchColor()` when a call site does not say. */
  sat: number;
  light: number;
}

/** Materials for the discrete scoring features on the playfield. */
export interface ElementMaterials {
  /** Post: shaft, then the rubber sleeve, then its lit cap. */
  postLo: string;
  postHi: string;
  sleeveLo: string;
  sleeveHi: string;
  sleeveCap: string;
  /** Bumper body, before pitch colour is mixed into the top. */
  bumperLo: string;
  bumperHi: string;
  /** Slingshot rubber, and the colour it flashes to on a hit. */
  slingLo: string;
  slingHi: string;
  slingFlash: string;
  /** Unlit ends of the target and rollover gradients. */
  targetLo: string;
  rolloverLo: string;
  /** Spinner end posts. */
  spinnerLo: string;
  spinnerHi: string;
}

/** The chrome ball and the effects drawn on and around it. */
export interface BallMaterial {
  /** Six radial-gradient stops, light limb to dark. */
  body: [string, string, string, string, string, string];
  /** Outline, equator seam, motion streak, rim kick and the save ring. */
  edge: string;
  seam: string;
  streak: string;
  rim: string;
  save: string;
}

/**
 * A complete look: colour, material, type and light.
 *
 * One object per theme, and nothing branches on `id` — a fifth theme is a new
 * file in this directory plus a `[data-theme]` block in `styles.css`.
 */
export interface Theme {
  id: string;
  /** Shown in the picker. */
  name: string;
  /** One line under the name, in the player's terms. */
  blurb: string;
  palette: TablePalette;
  keys: KeyMaterial;
  walls: Record<WallStyle, WallColors>;
  decals: DecalPalette;
  elements: ElementMaterials;
  ball: BallMaterial;
  tone: ToneCurve;
  /**
   * A hard stroke around every drawn element.
   *
   * Null for every theme but Toybox, whose whole read depends on it. Kept as a
   * material rather than a flag so the width and colour travel together.
   */
  outline: { color: string; width: number } | null;
  /** Additive bloom strength for the two downscale passes. */
  bloom: { alphaA: number; alphaB: number };
  /** The glow sprite ramp: how a point of light falls off. */
  glow: { coreLight: number; midLight: number; midSat: number; midAlpha: number };
  /**
   * How hard a lit thing throws light onto the playfield around it.
   *
   * Null for a look that does not want it. Additive light needs somewhere dark
   * to land, so a theme with a bright playfield saturates to white almost at
   * once — and a theme whose read depends on hard outlines does not want a
   * glow softening the ground under them. `radius` is in table units, per unit
   * of the thing's own radius.
   */
  pool: { strength: number; radius: number } | null;
  /** The pane of glass: diagonal sheen tint, and how hard the vignette closes. */
  glass: { sheen: string; vignette: number };
  /** Pushed to CSS as `--font-display` / `--font-ui` / `--font-mono`, and used
   *  by the canvas for its own text so the two cannot disagree. */
  fonts: { display: string; ui: string; mono: string };
}
