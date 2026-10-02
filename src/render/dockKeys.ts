import { clamp01 } from '../core/math';
import type { DockKey, DockLayout } from '../game/dock';
import type { KeyDeck, KeyLit } from '../game/keys';
import { noteLabel } from '../midi/notes';
import { mix, tone, withAlpha } from './palette';
import type { Stage } from './stage';

/** What is baked into a docked keyboard: it changes with the music, not the frame. */
export interface DockLook {
  /**
   * The scale guide: 1 for a scale tone, 2 for the tonic, 0 otherwise. Scale
   * keys take the steel finish and the tonic gets its mark.
   */
  scale?: (note: number) => number;
  /** Manual backing: notes below this are chord keys. */
  chordSplit?: number;
  /** Lane lines from every key up to this screen y, for falling notes. */
  lanesTop?: number;
  /** Captions in the header stop short of this x, where the octave bar begins. */
  captionLimit?: number;
}

/** What changes from frame to frame, drawn over the baked keys. */
export interface DockMarks {
  /** Tones of the chord sounding now, rung on their keys. */
  chordTones?: readonly number[];
  chordRoot?: number;
  /** Extra light on a key, 0..1: PlayTune's assist pointing at the next note. */
  highlight?: (note: number) => number;
  /** Keys to ring as the next ones to play. */
  focus?: (note: number) => boolean;
  /** A wrong press still showing on a key, 0..1. */
  wrong?: (note: number) => number;
}

/** How long a struck key keeps its glow, in seconds. */
const GLOW_SECONDS = 0.5;
/** How far a key goes down under a finger, in pixels. */
const TRAVEL = 4;

const SHARP = /#/g;

/** A note's name the way a keyboard player writes it: C♯4, not C#4. */
function keyName(note: number): string {
  return noteLabel(note).replace(SHARP, '♯');
}

/** How far down a key is, 0..1, from the deck's press envelope. */
function pressOf(k: KeyLit | undefined): number {
  return k ? clamp01(k.pos / 6) : 0;
}

/** How much of a strike's glow is left, 0..1. */
function glowOf(deck: KeyDeck<KeyLit>, k: KeyLit | undefined): number {
  return k ? clamp01(1 - (deck.time - k.litAt) / GLOW_SECONDS) : 0;
}

/** The colours a key is painted in, resolved from the theme once per bake or frame. */
interface Finish {
  bed: string;
  whiteTop: string;
  whiteFace: string;
  whiteLip: string;
  whiteInk: string;
  steelTop: string;
  steelFace: string;
  steelLip: string;
  steelInk: string;
  blackTop: string;
  blackFace: string;
  blackLip: string;
  blackSteel: string;
  guide: string;
}

function finish(stage: Stage): Finish {
  const km = stage.theme.keys;
  const pal = stage.palette;
  const steel = mix(mix(km.whiteFaceLo, km.whiteSide, 0.45), pal.neon, 0.28);
  return {
    bed: mix(pal.void, pal.floorDeep, 0.6),
    whiteTop: mix(km.whiteFaceHi, km.whiteFaceLo, 0.35),
    whiteFace: km.whiteFaceHi,
    whiteLip: mix(km.whiteFaceLo, km.whiteSide, 0.3),
    whiteInk: mix(km.whiteFaceLo, km.whiteSide, 0.55),
    steelTop: mix(steel, km.whiteSide, 0.25),
    steelFace: steel,
    steelLip: mix(steel, km.whiteSide, 0.45),
    steelInk: pal.ink,
    blackTop: km.blackFaceLo,
    blackFace: km.blackFaceHi,
    blackLip: mix(km.blackTop, km.blackFaceHi, 0.5),
    blackSteel: mix(km.blackFaceLo, pal.neon, 0.14),
    guide: pal.neon,
  };
}

function roundedBottom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, [0, 0, r, r]);
  else ctx.rect(x, y, w, h);
}

/** Is this key drawn differently from how it was baked? */
function lively(deck: KeyDeck<KeyLit>, k: KeyLit | undefined, note: number, marks: DockMarks): boolean {
  if (!k) return false;
  return k.down || k.pos > 0.01 || glowOf(deck, k) > 0.02 || (marks.highlight?.(note) ?? 0) > 0.01;
}

function drawWhite(
  ctx: CanvasRenderingContext2D, stage: Stage, f: Finish, dk: DockKey,
  steel: boolean, press: number, tint: number, labels: boolean, tonic: boolean,
): void {
  const hue = stage.hue(dk.note);
  const { x, y, w, h } = dk.rect;
  const dy = TRAVEL * press;
  const kx = x + 1, kw = w - 2, ky = y + dy, kh = h - dy;
  const r = Math.min(7, kw * 0.2);
  const lit = tone(hue, 72, 58);
  const top = mix(steel ? f.steelTop : f.whiteTop, tone(hue, 70, 48), tint);
  const face = mix(steel ? f.steelFace : f.whiteFace, lit, tint);
  const g = ctx.createLinearGradient(0, ky, 0, ky + kh);
  g.addColorStop(0, top);
  g.addColorStop(0.18, face);
  g.addColorStop(1, face);
  roundedBottom(ctx, kx, ky, kw, kh, r);
  ctx.fillStyle = g;
  ctx.fill();

  const lip = Math.min(5.5, kw * 0.18) * (1 - 0.35 * press);
  roundedBottom(ctx, kx, ky + kh - lip, kw, lip, r);
  ctx.fillStyle = mix(steel ? f.steelLip : f.whiteLip, tone(hue, 70, 38), tint);
  ctx.fill();

  const outline = stage.theme.outline;
  if (outline) {
    roundedBottom(ctx, kx, ky, kw, kh, r);
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = Math.max(1, outline.width * 0.5);
    ctx.stroke();
  }

  if (steel) {
    // A guide along the top of every scale key, heavier on the tonic.
    ctx.fillStyle = f.guide;
    ctx.fillRect(kx, ky, kw, tonic ? 3 : 1.5);
  }

  const size = Math.min(13, kw * 0.32);
  const labelY = ky + kh - lip - Math.max(11, kh * 0.1);
  if (tonic && kw > 14) {
    ctx.beginPath();
    ctx.arc(kx + kw / 2, labelY - size - 6, Math.min(4, kw * 0.09), 0, Math.PI * 2);
    ctx.fillStyle = f.guide;
    ctx.fill();
  }
  if (labels && kw > 19) {
    ctx.font = `${tint > 0.5 ? 700 : 500} ${size.toFixed(1)}px ${stage.theme.fonts.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tint > 0.5 ? '#0b1020' : steel ? f.steelInk : f.whiteInk;
    ctx.fillText(keyName(dk.note), kx + kw / 2, labelY);
  }
}

function drawBlack(
  ctx: CanvasRenderingContext2D, stage: Stage, f: Finish, dk: DockKey,
  steel: boolean, press: number, tint: number, labels: boolean,
): void {
  const hue = stage.hue(dk.note);
  const { x, y, w, h } = dk.rect;
  const dy = TRAVEL * press;
  // The strip a pressed key uncovers is the bed it went down into.
  if (dy > 0.2) {
    ctx.fillStyle = f.bed;
    ctx.fillRect(x, y, w, dy);
  }
  const r = Math.min(6, w * 0.2);
  const g = ctx.createLinearGradient(0, y + dy, 0, y + h);
  g.addColorStop(0, mix(f.blackTop, tone(hue, 70, 30), tint));
  g.addColorStop(1, mix(steel ? f.blackSteel : f.blackFace, tone(hue, 70, 46), tint));
  roundedBottom(ctx, x, y + dy, w, h - dy, r);
  ctx.fillStyle = g;
  ctx.fill();

  const lip = Math.min(4.5, w * 0.18) * (1 - 0.35 * press);
  ctx.fillStyle = mix(f.blackLip, tone(hue, 75, 64), tint);
  ctx.fillRect(x + 2, y + h - lip - 3, w - 4, lip);

  const outline = stage.theme.outline;
  if (outline) {
    roundedBottom(ctx, x, y + dy, w, h - dy, r);
    ctx.strokeStyle = outline.color;
    ctx.lineWidth = Math.max(1, outline.width * 0.5);
    ctx.stroke();
  }

  // A black key is named only while it is down: thirteen names crowded onto
  // the narrow keys would make the whole keyboard harder to read.
  if (labels && press > 0.5 && w > 16) {
    const size = Math.min(12, w * 0.32);
    ctx.font = `700 ${size.toFixed(1)}px ${stage.theme.fonts.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f3f6ff';
    ctx.fillText(keyName(dk.note), x + w / 2, y + h - lip - 3 - Math.max(9, h * 0.1));
  }
}

/**
 * Paint everything about the docked keyboard that does not move: the stage
 * floor above it, the bed, every key at rest, the guides and the captions.
 *
 * Into the stage's static layer, so a frame where nothing is pressed costs one
 * blit. `drawDockKeys` then repaints only the keys that are doing something.
 */
export function bakeDock(ctx: CanvasRenderingContext2D, stage: Stage, layout: DockLayout, look: DockLook): void {
  const pal = stage.palette;
  const f = finish(stage);
  const w = stage.cssW;
  const top = layout.top;

  // The stage: a floor that falls away into the dark at the top of the screen,
  // lit faintly from the keyboard.
  const floor = ctx.createLinearGradient(0, top, 0, 0);
  floor.addColorStop(0, mix(pal.floorFar, pal.floorNear, 0.35));
  floor.addColorStop(0.55, pal.floorFar);
  floor.addColorStop(1, pal.floorDeep);
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, w, top);

  // Rings centred under the keyboard, as there were behind the table's: the
  // empty stage still has somewhere for the eye to go.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, top);
  ctx.clip();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = pal.railTop;
  ctx.lineWidth = 1;
  const reach = Math.hypot(w / 2, top + 60);
  for (let r = 90; r < reach; r += 70) {
    ctx.beginPath();
    ctx.arc(w / 2, top + 60, r, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  // Deterministic grain, so the surface never shimmers between resizes.
  let seed = 987654;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  ctx.globalAlpha = 0.045;
  const dots = Math.min(2600, Math.round((w * top) / 380));
  for (let i = 0; i < dots; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(rnd() * w, rnd() * top, 1.2, 1.2);
  }
  ctx.restore();

  if (look.lanesTop !== undefined) {
    // One faint line up from every key: where its notes will fall.
    const lane = mix(pal.rail, pal.railTop, 0.3);
    for (const k of layout.keys) {
      ctx.globalAlpha = k.black ? 0.1 : 0.25;
      ctx.fillStyle = lane;
      ctx.fillRect(Math.round(k.laneX) - 0.5, look.lanesTop, 1, layout.keysTop - 3 - look.lanesTop);
    }
    ctx.globalAlpha = 1;
  }

  // The bed the keys sit in.
  const bedTop = layout.keysTop - 8;
  const bedBottom = Math.min(layout.frame.height - 1, layout.bottom + 8);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(layout.left - 8, bedTop, layout.right - layout.left + 16, bedBottom - bedTop, 14);
  else ctx.rect(layout.left - 8, bedTop, layout.right - layout.left + 16, bedBottom - bedTop);
  ctx.fillStyle = f.bed;
  ctx.fill();
  ctx.strokeStyle = withAlpha(pal.railTop, 0.22);
  ctx.lineWidth = 1;
  ctx.stroke();
  // The hairline along the top of the keys.
  ctx.fillStyle = withAlpha(pal.neon, 0.28);
  ctx.fillRect(layout.left, layout.keysTop - 3, layout.right - layout.left, 1);

  const labels = stage.quality.labels;
  const steelOf = (note: number) => (look.chordSplit !== undefined && note < look.chordSplit) || (look.scale?.(note) ?? 0) > 0;
  for (const row of layout.rows) {
    for (const k of row.keys) {
      if (k.black) continue;
      drawWhite(ctx, stage, f, k, steelOf(k.note), 0, 0, labels, (look.scale?.(k.note) ?? 0) >= 2);
    }
    for (const k of row.keys) {
      if (k.black) drawBlack(ctx, stage, f, k, steelOf(k.note), 0, 0, labels);
    }
  }

  if (look.chordSplit !== undefined) drawSplit(ctx, stage, layout, look.chordSplit, look.captionLimit ?? Infinity);
}

/** The line and captions between Manual backing's chord keys and the melody. */
function drawSplit(ctx: CanvasRenderingContext2D, stage: Stage, layout: DockLayout, split: number, limit: number): void {
  const pal = stage.palette;
  const first = layout.byNote.get(split);
  const caption = (text: string, x: number, y: number, color: string) => {
    ctx.save();
    ctx.font = `600 11px ${stage.theme.fonts.ui}`;
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.14em';
    // A caption the octave bar would cover is left out: the split line and
    // the tinted chord keys already say where the zones are.
    if (x + ctx.measureText(text.toUpperCase()).width <= limit) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text.toUpperCase(), x, y);
    }
    ctx.restore();
  };
  const headerY = (layout.top + layout.keysTop - 8) / 2;
  caption('Chord keys', layout.left, headerY, pal.neon);
  if (layout.rows.length > 1) {
    const melody = layout.rows[1];
    caption('Melody', layout.left, melody.top - layout.frame.rowGap / 2, pal.dim);
    return;
  }
  if (!first) return;
  const x = first.rect.x;
  caption('Melody', x + 8, headerY, pal.dim);
  ctx.fillStyle = pal.neon;
  ctx.fillRect(x - 1, layout.top + 4, 2, layout.bottom - layout.top - 4);
}

/**
 * Repaint the keys that are doing something, over the baked keyboard, and put
 * their light on the emissive layer.
 *
 * A pressed white key is repainted from the bed up, which uncovers the black
 * keys either side of it, so those are repainted over it.
 */
export function drawDockKeys(
  ctx: CanvasRenderingContext2D, em: CanvasRenderingContext2D, stage: Stage,
  layout: DockLayout, deck: KeyDeck<KeyLit>, look: DockLook, marks: DockMarks = {},
): void {
  const f = finish(stage);
  const labels = stage.quality.labels;
  const steelOf = (note: number) => (look.chordSplit !== undefined && note < look.chordSplit) || (look.scale?.(note) ?? 0) > 0;
  const tintOf = (k: KeyLit | undefined, note: number) => Math.max(
    pressOf(k), glowOf(deck, k) * 0.6, (marks.highlight?.(note) ?? 0) * 0.45,
  );

  for (const row of layout.rows) {
    const keys = row.keys;
    for (let i = 0; i < keys.length; i++) {
      const dk = keys[i];
      if (dk.black) continue;
      const k = deck.byNote.get(dk.note);
      if (!lively(deck, k, dk.note, marks)) continue;
      ctx.fillStyle = f.bed;
      ctx.fillRect(dk.rect.x + 1, dk.rect.y, dk.rect.w - 2, dk.rect.h);
      drawWhite(ctx, stage, f, dk, steelOf(dk.note), pressOf(k), tintOf(k, dk.note), labels, (look.scale?.(dk.note) ?? 0) >= 2);
      for (const j of [i - 1, i + 1]) {
        const nb = keys[j];
        if (!nb?.black) continue;
        const nk = deck.byNote.get(nb.note);
        drawBlack(ctx, stage, f, nb, steelOf(nb.note), pressOf(nk), tintOf(nk, nb.note), labels);
      }
    }
    for (const dk of keys) {
      if (!dk.black) continue;
      const k = deck.byNote.get(dk.note);
      if (!lively(deck, k, dk.note, marks)) continue;
      drawBlack(ctx, stage, f, dk, steelOf(dk.note), pressOf(k), tintOf(k, dk.note), labels);
    }
  }

  // Light, on the emissive layer: a strike glows from the top of its key.
  for (const dk of layout.keys) {
    const k = deck.byNote.get(dk.note);
    const glow = glowOf(deck, k);
    const held = k?.down ? 0.35 : 0;
    const strength = Math.max(glow * (0.35 + (k?.velocity ?? 0) * 0.55), held);
    if (strength > 0.02) {
      stage.glowAt(em, dk.laneX, dk.rect.y, Math.max(48, dk.rect.w * 2.6), stage.hue(dk.note), strength);
    }
  }

  // Marks over the keys.
  const ring = (dk: DockKey, color: string, width: number, fill = false) => {
    const r = Math.max(3, Math.min(6, dk.rect.w * 0.18));
    const y = dk.rect.y + dk.rect.h - (dk.black ? 18 : Math.max(36, dk.rect.h * 0.3));
    ctx.beginPath();
    ctx.arc(dk.laneX, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = color; ctx.fill(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const pal = stage.palette;
  if (marks.chordTones) {
    for (const n of marks.chordTones) {
      const dk = layout.byNote.get(n);
      if (dk) ring(dk, pal.neon, 1.6, n === marks.chordRoot);
    }
  }
  if (marks.focus) {
    for (const dk of layout.keys) if (marks.focus(dk.note)) ring(dk, withAlpha(pal.ink, 0.9), 2);
  }
  if (marks.wrong) {
    for (const dk of layout.keys) {
      const a = marks.wrong(dk.note);
      if (a <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = a;
      ring(dk, pal.verdict.wrong, 3);
      ctx.restore();
    }
  }
}

/** The bake key for a docked keyboard: everything `bakeDock` paints from. */
export function dockBakeKey(stage: Stage, layout: DockLayout, look: DockLook, scaleSignature = ''): string {
  return [layout.key, stage.quality.labels, look.chordSplit ?? '-', look.lanesTop ?? '-', look.captionLimit ?? '-', scaleSignature].join('|');
}
