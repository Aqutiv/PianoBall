import type { Vec2 } from '../../physics/vec2';
import type { TablePalette } from '../../render/theme';
import type { Collider } from '../../physics/colliders';

export type ElementKind =
  | 'bumper' | 'sling' | 'target' | 'rollover' | 'spinner'
  | 'post' | 'drain' | 'gate' | 'lane';

/**
 * A scoring feature on the playfield. Everything the game reacts to and the
 * renderer draws as a discrete object lives here, so the two never drift apart.
 */
export interface TableElement {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  /** Radius for round features. */
  r: number;
  /** Endpoints for linear features. */
  a: Vec2;
  b: Vec2;
  /** Height above the playfield, for the extruded look. */
  z: number;
  /** The pitch this feature is tuned to. Pressing it on the keyboard energises it. */
  note: number | null;
  score: number;
  group: string | null;

  // ---- runtime state ----
  /** Simulation time of the last ball hit. Drives flashes and combos. */
  hitAt: number;
  /** Simulation time until which the matching key press has this energised. */
  energisedUntil: number;
  /** Dropped drop-targets and disabled features. */
  down: boolean;
  enabled: boolean;
  /** Spinner rotation and rate. */
  spin: number;
  spinRate: number;
  /** Decaying 0..1 used for the hit flash. */
  flash: number;
  colliders: Collider[];
}

export type WallStyle = 'rail' | 'wood' | 'metal' | 'rubber' | 'neon' | 'sling';

/** Visual description of static geometry. Physics reads the colliders instead. */
export interface WallSpec {
  kind: 'poly' | 'arc';
  points?: Vec2[];
  closed?: boolean;
  c?: Vec2;
  r?: number;
  a0?: number;
  a1?: number;
  thickness: number;
  /** Extrusion height. */
  height: number;
  style: WallStyle;
}

/** Painted playfield art: no physics, drawn into the baked layer. */
export interface DecalSpec {
  kind: 'arcband' | 'glow' | 'inset' | 'line' | 'text';
  x: number;
  y: number;
  r?: number;
  a0?: number;
  a1?: number;
  w?: number;
  h?: number;
  angle?: number;
  color: string;
  alpha?: number;
  text?: string;
  size?: number;
}

export interface MusicDef {
  /** MIDI note of the tonic. */
  root: number;
  bpm: number;
  /**
   * The scale and chord loop the table is written in, by `MODES` id. This is
   * the default only: the player can pick another, and the game retunes the
   * playfield to match.
   */
  mode: string;
}

export type ChordQuality = 'min' | 'maj' | 'min7' | 'maj7' | 'sus2' | 'sus4' | 'dom7' | 'dim';

export type { TablePalette };

export interface TableDef {
  id: string;
  name: string;
  width: number;
  height: number;
  music: MusicDef;
  /** Where a new ball is held before the player serves it. */
  serve: Vec2;
  /**
   * Closed outline of the playfield surface. The renderer fills and clips the
   * floor to this, so painted art never spills past the cabinet.
   */
  outline: Vec2[];
  /** Keybed overrides for this table. */
  keybed?: Record<string, number>;
  build(b: TableBuilder): void;
}

import {
  segment, arc as arcCollider, circle, polyline, MATERIALS, type Material,
} from '../../physics/colliders';
import { v2 } from '../../physics/vec2';

interface ElementInit {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  r?: number;
  a?: Vec2;
  b?: Vec2;
  z?: number;
  note?: number | null;
  score?: number;
  group?: string | null;
}

/**
 * Constructs a table. Every helper emits the physics collider, the visual
 * description and the gameplay element together, which is what keeps a table
 * definition short enough to read in one sitting.
 */
export class TableBuilder {
  readonly colliders: Collider[] = [];
  readonly walls: WallSpec[] = [];
  readonly decals: DecalSpec[] = [];
  readonly elements: TableElement[] = [];

  constructor(readonly def: TableDef) {}

  private element(init: ElementInit, colliders: Collider[]): TableElement {
    const el: TableElement = {
      id: init.id,
      kind: init.kind,
      x: init.x,
      y: init.y,
      r: init.r ?? 0,
      a: init.a ?? v2(init.x, init.y),
      b: init.b ?? v2(init.x, init.y),
      z: init.z ?? 0,
      note: init.note ?? null,
      score: init.score ?? 0,
      group: init.group ?? null,
      hitAt: -99,
      energisedUntil: -99,
      down: false,
      enabled: true,
      spin: 0,
      spinRate: 0,
      flash: 0,
      colliders,
    };
    this.elements.push(el);
    return el;
  }

  /** Inert boundary geometry: outer walls, guide rails, lane dividers. */
  wall(points: Vec2[], opts: { thickness?: number; height?: number; style?: WallStyle; closed?: boolean; material?: Material } = {}): void {
    const thickness = opts.thickness ?? 7;
    const cols = polyline(points, thickness, {
      closed: opts.closed ?? false,
      material: opts.material ?? MATERIALS.rail,
    });
    this.colliders.push(...cols);
    this.walls.push({
      kind: 'poly', points: points.map((p) => ({ ...p })), closed: opts.closed ?? false,
      thickness, height: opts.height ?? 34, style: opts.style ?? 'rail',
    });
  }

  arcWall(c: Vec2, r: number, a0: number, a1: number, opts: { thickness?: number; height?: number; style?: WallStyle; material?: Material } = {}): void {
    const thickness = opts.thickness ?? 7;
    this.colliders.push(arcCollider(c, r, a0, a1, thickness, {
      material: opts.material ?? MATERIALS.rail,
    }));
    this.walls.push({
      kind: 'arc', c: { ...c }, r, a0, a1,
      thickness, height: opts.height ?? 34, style: opts.style ?? 'rail',
    });
  }

  /** Rubber-sleeved post. Lively and forgiving to hit. */
  post(id: string, x: number, y: number, r = 12): TableElement {
    const col = circle(v2(x, y), r, { material: MATERIALS.post, owner: id });
    this.colliders.push(col);
    return this.element({ id, kind: 'post', x, y, r, z: 30 }, [col]);
  }

  /** Pop bumper: fires the ball away with a fixed impulse and sounds its note. */
  bumper(id: string, x: number, y: number, r: number, note: number, score: number): TableElement {
    const col = circle(v2(x, y), r, { material: MATERIALS.bumper, owner: id, note });
    this.colliders.push(col);
    return this.element({ id, kind: 'bumper', x, y, r, z: 40, note, score }, [col]);
  }

  /** Slingshot face. The two inert sides of its triangle are added as walls. */
  sling(id: string, a: Vec2, b: Vec2, note: number, score: number): TableElement {
    const col = segment(a, b, 8, { material: MATERIALS.sling, owner: id, note });
    this.colliders.push(col);
    return this.element({
      id, kind: 'sling', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      a: { ...a }, b: { ...b }, z: 30, note, score,
    }, [col]);
  }

  /** Drop target: hit it and it falls, disabling its collider until reset. */
  target(id: string, x: number, y: number, halfW: number, angle: number, note: number, score: number, group: string): TableElement {
    const dx = Math.cos(angle) * halfW, dy = Math.sin(angle) * halfW;
    const a = v2(x - dx, y - dy), b = v2(x + dx, y + dy);
    const col = segment(a, b, 5, { material: MATERIALS.target, owner: id, note });
    this.colliders.push(col);
    return this.element({ id, kind: 'target', x, y, r: halfW, a, b, z: 36, note, score, group }, [col]);
  }

  /** Rollover button: a sensor the ball passes over. */
  rollover(id: string, x: number, y: number, r: number, note: number, score: number, group: string | null = null): TableElement {
    const col = circle(v2(x, y), r, { sensor: true, owner: id, note, material: MATERIALS.dead });
    this.colliders.push(col);
    return this.element({ id, kind: 'rollover', x, y, r, z: 3, note, score, group }, [col]);
  }

  /** Spinner: a sensor gate that whirls and scores per pass. */
  spinner(id: string, a: Vec2, b: Vec2, note: number, score: number): TableElement {
    const col = segment(a, b, 10, { sensor: true, owner: id, note, material: MATERIALS.metal });
    this.colliders.push(col);
    return this.element({
      id, kind: 'spinner', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      a: { ...a }, b: { ...b }, z: 44, note, score,
    }, [col]);
  }

  /** One-way gate: passable from the front face only. */
  gate(id: string, a: Vec2, b: Vec2): TableElement {
    const col = segment(a, b, 4, { material: MATERIALS.metal, owner: id, oneSided: true });
    this.colliders.push(col);
    return this.element({
      id, kind: 'gate', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      a: { ...a }, b: { ...b }, z: 26,
    }, [col]);
  }

  /** The one place a ball is lost. */
  drain(id: string, a: Vec2, b: Vec2, r = 22): TableElement {
    const col = segment(a, b, r, { sensor: true, owner: id, material: MATERIALS.dead });
    this.colliders.push(col);
    return this.element({
      id, kind: 'drain', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      a: { ...a }, b: { ...b }, z: 0,
    }, [col]);
  }

  decal(d: DecalSpec): void { this.decals.push(d); }
}

export interface BuiltTable {
  def: TableDef;
  elements: TableElement[];
  byId: Map<string, TableElement>;
  /** Element lookup by the owner string carried on contacts. */
  byOwner: Map<string, TableElement>;
  walls: WallSpec[];
  decals: DecalSpec[];
  colliders: Collider[];
}

export function buildTable(def: TableDef): BuiltTable {
  const b = new TableBuilder(def);
  def.build(b);
  const byId = new Map<string, TableElement>();
  const byOwner = new Map<string, TableElement>();
  for (const el of b.elements) {
    byId.set(el.id, el);
    byOwner.set(el.id, el);
  }
  return {
    def, elements: b.elements, byId, byOwner,
    walls: b.walls, decals: b.decals, colliders: b.colliders,
  };
}
