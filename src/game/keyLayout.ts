import { isBlackKey, whiteIndexOf, blackKeyNudge } from '../midi/notes';

export interface KeybedLayout {
  /** Table x of the left edge of the first white key. */
  left: number;
  right: number;
  /** Width of one white key. Derived. */
  whiteW: number;
  /** Table y of the striking surface at the centre of the keybed. */
  baseY: number;
  /**
   * How far the outer keys sit below the middle one. The keybed is a shallow
   * crown, so a ball that lands on it always rolls towards an outlane instead
   * of resting — that rolling window is the reaction time the player gets.
   */
  crown: number;
  /** Black key width as a fraction of a white key. */
  blackWidth: number;
  /** Depth of the key bodies, away from the playfield. Visual only. */
  whiteDepth: number;
  blackDepth: number;
  /** Extruded height of each rank. Visual only. */
  whiteZ: number;
  blackZ: number;
}

export const DEFAULT_KEYBED: KeybedLayout = {
  left: 84,
  right: 940,
  whiteW: 0,
  baseY: 172,
  crown: 44,
  blackWidth: 0.55,
  whiteDepth: 138,
  blackDepth: 92,
  whiteZ: 26,
  blackZ: 50,
};

export interface KeyGeom {
  lane: number;
  note: number;
  black: boolean;
  /** Centre of this key's striking slot. */
  cx: number;
  cy: number;
  /** Half-width of the striking slot. Slots tile the keybed exactly. */
  halfW: number;
  /** Centre and half-width of the drawn key, which is wider than the slot. */
  drawCx: number;
  drawCy: number;
  drawHalfW: number;
  /** Unit normal of the striking face, pointing into the playfield. */
  nx: number;
  ny: number;
  /** Rotation of the key, following the crown so the keybed fans outwards. */
  tilt: number;
  depth: number;
  z: number;
}

/**
 * Blend of a tent and a dome.
 *
 * A pure parabola is flat at its apex, so a ball landing dead centre parks
 * there and the clock stops. Mixing in a linear term guarantees a minimum
 * slope everywhere, which is what keeps the ball always rolling and the
 * player always on it.
 */
const LINEAR_SHARE = 0.55;

/** Height of the crown at a given x, as an offset from `baseY`. */
export function crownAt(x: number, L: KeybedLayout): number {
  const mid = (L.left + L.right) / 2;
  const half = (L.right - L.left) / 2;
  const t = (x - mid) / half;
  return -L.crown * (LINEAR_SHARE * Math.abs(t) + (1 - LINEAR_SHARE) * t * t);
}

/** Slope of the crown at a given x, used to sit each key flush on it. */
export function crownSlope(x: number, L: KeybedLayout): number {
  const mid = (L.left + L.right) / 2;
  const half = (L.right - L.left) / 2;
  const t = (x - mid) / half;
  const sign = t === 0 ? 0 : Math.sign(t);
  return (-L.crown * (LINEAR_SHARE * sign + 2 * (1 - LINEAR_SHARE) * t)) / half;
}

/**
 * Turn a contiguous run of MIDI notes into playfield geometry.
 *
 * Every key gets a striking slot, and the slots tile the keybed without gaps or
 * overlaps: a black key owns its own width, and the white keys either side own
 * whatever is left. That is exactly what a piano looks like from above, and it
 * means the ball's x position always names one specific key to press.
 */
export function buildKeyLayout(baseNote: number, count: number, layout: Partial<KeybedLayout> = {}): {
  keys: KeyGeom[];
  layout: KeybedLayout;
} {
  const L: KeybedLayout = { ...DEFAULT_KEYBED, ...layout };

  let whiteCount = 0;
  for (let i = 0; i < count; i++) if (!isBlackKey(baseNote + i)) whiteCount++;
  if (whiteCount === 0) whiteCount = 1;

  L.whiteW = (L.right - L.left) / whiteCount;
  const firstWhite = whiteIndexOf(baseNote);
  const halfBlack = (L.whiteW * L.blackWidth) / 2;
  const inRange = (n: number) => n >= baseNote && n < baseNote + count;

  /** Drawn centre of a key, in table units. */
  const centreOf = (note: number): number => {
    const wi = whiteIndexOf(note) - firstWhite;
    return isBlackKey(note)
      ? L.left + (wi + 1 + blackKeyNudge(note)) * L.whiteW
      : L.left + (wi + 0.5) * L.whiteW;
  };

  const keys: KeyGeom[] = [];
  for (let i = 0; i < count; i++) {
    const note = baseNote + i;
    const black = isBlackKey(note);
    const drawCx = centreOf(note);

    let slotL: number, slotR: number, drawHalf: number;
    if (black) {
      drawHalf = halfBlack;
      slotL = drawCx - halfBlack;
      slotR = drawCx + halfBlack;
    } else {
      drawHalf = L.whiteW / 2;
      slotL = drawCx - drawHalf;
      slotR = drawCx + drawHalf;
      // Give up whatever the neighbouring black keys cover.
      if (isBlackKey(note - 1) && inRange(note - 1)) slotL = Math.max(slotL, centreOf(note - 1) + halfBlack);
      if (isBlackKey(note + 1) && inRange(note + 1)) slotR = Math.min(slotR, centreOf(note + 1) - halfBlack);
    }

    const cx = (slotL + slotR) / 2;
    const slope = crownSlope(cx, L);
    const tilt = Math.atan(slope);

    keys.push({
      lane: i,
      note,
      black,
      cx,
      cy: L.baseY + crownAt(cx, L),
      halfW: Math.max(4, (slotR - slotL) / 2),
      drawCx,
      drawCy: L.baseY + crownAt(drawCx, L),
      drawHalfW: drawHalf,
      nx: -Math.sin(tilt),
      ny: Math.cos(tilt),
      tilt,
      depth: black ? L.blackDepth : L.whiteDepth,
      z: black ? L.blackZ : L.whiteZ,
    });
  }

  return { keys, layout: L };
}
