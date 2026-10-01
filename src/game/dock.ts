import { clamp, clamp01 } from '../core/math';
import { isBlackKey } from '../midi/notes';

/**
 * The music modes' piano: a straight row of keys docked along the bottom of
 * the screen, in CSS pixels.
 *
 * Pinball's keybed is a crown on the near edge of a raked table, and that is
 * right for pinball — the crown is what keeps a landed ball rolling. Freestyle
 * and PlayTune have no ball, and drawing their keys through the same camera
 * made them a small fan at the foot of a portrait table: twelve pixels a key on
 * a phone held sideways. Here the keyboard owns its own strip of the screen
 * instead, laid out the way PianoBallDesktop lays out its music keyboard, so a
 * key is something a finger can actually find.
 *
 * Everything in this file is pure geometry and policy. Nothing touches the DOM,
 * so all of it is testable without a browser.
 */

/** How large the player wants the keys on a touch screen. */
export type KeySize = 'compact' | 'comfortable' | 'large';

/**
 * The narrowest white key each size will accept on a touch screen, in CSS
 * pixels. The window grows by whole octaves only while every white key stays at
 * least this wide, so the size is a floor rather than a fixed width.
 */
export const KEY_TARGET: Readonly<Record<KeySize, number>> = { compact: 34, comfortable: 42, large: 54 };

/** Black keys as a share of a white key, as on PianoBallDesktop. */
export const BLACK_WIDTH = 0.64;
export const BLACK_LENGTH = 0.62;

export interface Rect { x: number; y: number; w: number; h: number }

/** One contiguous run of keys, inclusive at both ends. */
export interface DockRowSpec { low: number; high: number }

/** Where the dock sits on the screen, before any keys are placed in it. */
export interface DockFrame {
  width: number;
  height: number;
  /** Clear space either side of the keys. */
  marginX: number;
  /** Strip above the keys for captions and the octave bar. */
  header: number;
  /** Length of a white key in each row. */
  keyHeight: number;
  /** Space between stacked rows, which holds the second row's caption. */
  rowGap: number;
  /** Space under the keys: the status line on desktop. */
  footer: number;
  /** Breathing room between the keys and the bottom edge of the screen. */
  inset: number;
}

export interface DockKey {
  note: number;
  black: boolean;
  /** Which row the key is in, counting from the top. */
  row: number;
  rect: Rect;
  /** Centre of the key's lane: where a falling note lands, where a ribbon rises. */
  laneX: number;
}

export interface DockRow extends DockRowSpec {
  top: number;
  height: number;
  whiteW: number;
  keys: DockKey[];
}

export interface DockLayout {
  frame: DockFrame;
  /** Rows from the top of the screen down. */
  rows: DockRow[];
  /** Every key, in note order. */
  keys: DockKey[];
  byNote: Map<number, DockKey>;
  /** Top of the header strip: everything above this belongs to the stage. */
  top: number;
  /** Top of the first row of keys. */
  keysTop: number;
  /** Bottom of the last row of keys. */
  bottom: number;
  left: number;
  right: number;
  low: number;
  high: number;
  /** Identity of the geometry, for caches and the bake key. */
  key: string;
}

/** What the range policy needs to know about the device and the player. */
export interface DockEnv {
  /** A touch screen with no MIDI keyboard: size the window for fingers. */
  touch: boolean;
  keySize: KeySize;
  /** The C the touch window is built around. */
  center: number;
}

/** The mapped controller window, as `NoteMapping` reports it. */
export interface MappedRange { low: number; high: number }

/** Lowest and highest notes a touch window may reach: C1 to C8. */
const WINDOW_LOW = 24;
const WINDOW_HIGH = 108;
/** The ends of a full piano, A0 and C8, which no row may pass. */
const PIANO_LOW = 21;
const PIANO_HIGH = 108;

/** Side margin: a finger needs less than a desktop's breathing room. */
export function dockMargin(width: number, touch: boolean): number {
  return touch ? clamp(width * 0.015, 8, 16) : clamp(width * 0.03, 16, 42);
}

/**
 * The dock's frame for a viewport.
 *
 * A short screen is a phone on its side, where the keys are the instrument and
 * deserve about a third of the height. Anywhere taller, a quarter, clamped the
 * way the desktop app clamps it. Two stacked rows each get a little less, so
 * the pair still leaves the stage room to breathe.
 */
export function dockFrame(width: number, height: number, o: { rows: 1 | 2; touch: boolean; header: number }): DockFrame {
  const short = height < 520;
  const keyHeight = o.rows === 2
    ? clamp(height * (short ? 0.26 : 0.17), 96, 190)
    : clamp(height * (short ? 0.32 : 0.24), 110, 245);
  return {
    width,
    height,
    marginX: dockMargin(width, o.touch),
    header: o.header,
    keyHeight,
    rowGap: o.rows === 2 ? 18 : 0,
    footer: o.touch ? 0 : 30,
    inset: o.touch ? 4 : 0,
  };
}

/** How many white keys a run of notes holds. */
export function whiteCount(low: number, high: number): number {
  let n = 0;
  for (let note = low; note <= high; note++) if (!isBlackKey(note)) n++;
  return n;
}

/**
 * One row of keys across `[left, right]`.
 *
 * Every white key is the same width. A run that starts or ends on a black key
 * gets half a white key of room at that end so the black key is not cut in
 * half. Black keys sit exactly on the line between their two white neighbours,
 * as on the desktop app: no realistic nudge, because a lane that lands on the
 * boundary is easier to read than one a few pixels off it.
 */
function layoutRow(spec: DockRowSpec, row: number, left: number, right: number, top: number, height: number): DockRow {
  const padL = isBlackKey(spec.low) ? 0.5 : 0;
  const padR = isBlackKey(spec.high) ? 0.5 : 0;
  const whiteW = (right - left) / Math.max(1, whiteCount(spec.low, spec.high) + padL + padR);
  const keys: DockKey[] = [];
  let index = padL;
  for (let note = spec.low; note <= spec.high; note++) {
    const black = isBlackKey(note);
    const rect: Rect = black
      ? { x: left + (index - BLACK_WIDTH / 2) * whiteW, y: top, w: whiteW * BLACK_WIDTH, h: height * BLACK_LENGTH }
      : { x: left + index * whiteW, y: top, w: whiteW, h: height };
    keys.push({ note, black, row, rect, laneX: rect.x + rect.w / 2 });
    if (!black) index++;
  }
  return { ...spec, top, height, whiteW, keys };
}

/** Lay rows of keys into a frame, from the bottom of the screen up. */
export function layoutDock(frame: DockFrame, rows: readonly DockRowSpec[]): DockLayout {
  const left = frame.marginX;
  const right = frame.width - frame.marginX;
  const tops: number[] = [];
  let bottomOfRow = frame.height - frame.footer - frame.inset;
  for (let i = rows.length - 1; i >= 0; i--) {
    tops[i] = bottomOfRow - frame.keyHeight;
    bottomOfRow = tops[i] - frame.rowGap;
  }
  const laid = rows.map((spec, i) => layoutRow(spec, i, left, right, tops[i], frame.keyHeight));
  const keys = laid.flatMap((r) => r.keys).sort((a, b) => a.note - b.note);
  const keysTop = tops[0] ?? frame.height - frame.footer - frame.inset;
  return {
    frame,
    rows: laid,
    keys,
    byNote: new Map(keys.map((k) => [k.note, k])),
    top: keysTop - frame.header,
    keysTop,
    bottom: frame.height - frame.footer - frame.inset,
    left,
    right,
    low: keys.length ? keys[0].note : 0,
    high: keys.length ? keys[keys.length - 1].note : 0,
    key: [
      frame.width, frame.height, frame.header, frame.footer, frame.marginX.toFixed(2), frame.keyHeight.toFixed(2),
      rows.map((r) => `${r.low}-${r.high}`).join(','),
    ].join('|'),
  };
}

/**
 * The key under a point, or null.
 *
 * Black keys win, because they sit on top. Below a black key's tip the white
 * key underneath owns the point, as on a real keyboard. `slop` extends the top
 * row upwards, so a finger landing just above the keys still plays — larger
 * while sliding, when the finger is already committed to the keyboard. A point
 * in the side margin plays the nearest end key rather than nothing.
 */
export function pickDock(layout: DockLayout, x: number, y: number, slop = 6): DockKey | null {
  const { rows } = layout;
  const gap = layout.frame.rowGap;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const above = i === 0 ? slop : gap / 2;
    const below = i === rows.length - 1 ? 4 : gap / 2;
    if (y < row.top - above || y > row.top + row.height + below) continue;
    const px = clamp(x, layout.left, layout.right);
    for (const k of row.keys) {
      if (k.black && px >= k.rect.x && px <= k.rect.x + k.rect.w && y <= k.rect.y + k.rect.h) return k;
    }
    let nearest: DockKey | null = null;
    let nearestD = Infinity;
    for (const k of row.keys) {
      if (k.black) continue;
      if (px >= k.rect.x && px < k.rect.x + k.rect.w) return k;
      const d = Math.abs(px - k.laneX);
      if (d < nearestD) { nearestD = d; nearest = k; }
    }
    // Only the half-key of room at a black end lands here.
    return nearest;
  }
  return null;
}

/**
 * How hard a tap at `y` strikes a key.
 *
 * Nearer the front of the key is harder, like a drum pad and like the desktop
 * app. The span is the same 0.6 floor the table keyboard's `strikeForce` keeps,
 * so a pointer still cannot play a note too quiet to hear.
 */
export function dockForce(key: DockKey, y: number): number {
  return 0.6 + 0.35 * clamp01((y - key.rect.y) / key.rect.h);
}

/** Where a note's lane is, or null if the note is not on the keyboard. */
export function laneOf(layout: DockLayout, note: number): number | null {
  return layout.byNote.get(note)?.laneX ?? null;
}

// ----------------------------------------------------------- range policy ---

/**
 * How many octaves fit across a touch screen at the chosen key size.
 *
 * Counted C to C, so `k` octaves are `7k + 1` white keys. One octave always
 * fits; past that, an octave is only added while every white key stays at
 * least the target width.
 */
export function touchOctaves(width: number, size: KeySize, marginX = dockMargin(width, true)): 1 | 2 | 3 | 4 {
  const span = width - 2 * marginX;
  for (const k of [4, 3, 2] as const) if (span / (7 * k + 1) >= KEY_TARGET[size]) return k;
  return 1;
}

/** A C-to-C window of `k` octaves around `center`, kept within C1–C8. */
export function touchWindow(center: number, k: number): DockRowSpec {
  const span = 12 * k;
  let low = center - 12 * Math.floor(k / 2);
  low = clamp(low, WINDOW_LOW, WINDOW_HIGH - span);
  return { low, high: low + span };
}

/** The C nearest `note`, which is what a touch window is centred on. */
export function nearestC(note: number): number {
  return Math.round(note / 12) * 12;
}

/**
 * Freestyle's rows.
 *
 * With a MIDI keyboard or a mouse, the keyboard on screen is the mapped
 * controller window, so every physical key has its twin. On a touch screen the
 * window is sized for fingers instead.
 *
 * Manual backing reserves the window's lowest octave for chords. When a single
 * row holding that octave and two more for the melody would leave keys too thin
 * to play, the chord octave moves to its own row above the melody. Both shapes
 * hold the same notes, so turning a phone never moves a key out from under a
 * latched chord.
 */
export function freestyleRows(env: DockEnv, mapping: MappedRange, manual: boolean, width: number): DockRowSpec[] {
  if (!env.touch) return [{ low: mapping.low, high: mapping.high }];
  const margin = dockMargin(width, true);
  const k = touchOctaves(width, env.keySize, margin);
  if (!manual) return [touchWindow(env.center, k)];
  const pair = touchWindow(env.center, 2);
  const singleWidth = (width - 2 * margin) / whiteCount(pair.low, pair.high);
  if (k < 2 && singleWidth < KEY_TARGET[env.keySize] * 0.75) {
    return [
      { low: pair.low, high: pair.low + 11 },
      { low: pair.low + 12, high: pair.high },
    ];
  }
  return [k < 2 ? pair : touchWindow(env.center, k)];
}

/**
 * PlayTune's row.
 *
 * With a MIDI keyboard or a mouse, the mapped window, so the lanes line up with
 * the physical keys. On a touch screen, exactly the part being played, widened
 * to whole white keys and to at least an octave, plus a white key of breathing
 * room either side when that still leaves every key at the target width. It is
 * worked out once per run and kept, so a key never moves mid-song.
 */
export function playtuneRows(env: DockEnv, mapping: MappedRange, part: DockRowSpec | null, width: number): DockRowSpec[] {
  if (!env.touch) return [{ low: mapping.low, high: mapping.high }];
  // Between tunes, the same window Freestyle would show.
  if (!part) return [touchWindow(env.center, touchOctaves(width, env.keySize))];
  let low = part.low;
  let high = part.high;
  if (isBlackKey(low)) low--;
  if (isBlackKey(high)) high++;
  // An octave at least, grown upwards first: melodies sit above their tonic.
  for (let up = true; whiteCount(low, high) < 8; up = !up) {
    if (up && high < PIANO_HIGH) high = nextWhite(high, 1);
    else if (low > PIANO_LOW) low = nextWhite(low, -1);
    else high = nextWhite(high, 1);
  }
  const margin = dockMargin(width, true);
  const roomy = (width - 2 * margin) / (whiteCount(low, high) + 2) >= KEY_TARGET[env.keySize];
  if (roomy) {
    if (low > PIANO_LOW) low = nextWhite(low, -1);
    if (high < PIANO_HIGH) high = nextWhite(high, 1);
  }
  return [{ low, high }];
}

/** The next white key above (`dir` 1) or below (`dir` -1) a note. */
function nextWhite(note: number, dir: 1 | -1): number {
  let n = note + dir;
  while (isBlackKey(n)) n += dir;
  return n;
}
