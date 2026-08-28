import type { TableDef } from '../schema';
import { v2, type Vec2 } from '../../../physics/vec2';


const W = 1024;
const H = 1408;

// Outer shell: straight sides into a rounded top, like a real cabinet.
const WALL_L = 16;
const WALL_R = W - 16;
const TOP_Y = 1394;
const CORNER_R = 180;
const CORNER_CY = TOP_Y - CORNER_R;

// The orbit lane that rings the upper playfield.
const LANE = 136;
const IN_L = WALL_L + LANE;
const IN_R = WALL_R - LANE;
const IN_TOP = TOP_Y - LANE;
const IN_CORNER_R = CORNER_R - LANE;
const RAIL_BOTTOM = 700;

const PI = Math.PI;

/** Tessellated arc, for building the shell outline. */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(v2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return out;
}

/** The cabinet shape, walked clockwise from the bottom-left. */
const SHELL: Vec2[] = [
  v2(WALL_L, 0),
  v2(WALL_L, CORNER_CY),
  ...arcPts(WALL_L + CORNER_R, CORNER_CY, CORNER_R, PI, PI / 2),
  ...arcPts(WALL_R - CORNER_R, CORNER_CY, CORNER_R, PI / 2, 0),
  v2(WALL_R, CORNER_CY),
  v2(WALL_R, 0),
];

/** D minor pentatonic: five notes that cannot clash, whatever the player does. */
const D3 = 50, A3 = 57;
const D4 = 62, F4 = 65, G4 = 67, A4 = 69, C5 = 72;
const D5 = 74, F5 = 77, G5 = 79;

export const AURORA: TableDef = {
  id: 'aurora',
  name: 'Aurora',
  width: W,
  height: H,
  serve: v2(W / 2, 1216),
  outline: SHELL,
  keybed: { left: 84, right: 940, baseY: 176, crown: 46 },
  music: {
    root: D4,
    scale: [0, 3, 5, 7, 10],
    bpm: 96,
    progression: [
      { degree: 0, quality: 'min' },
      { degree: 3, quality: 'maj' },
      { degree: 4, quality: 'min7' },
      { degree: 2, quality: 'maj' },
    ],
  },
  palette: {
    void: '#04050d',
    floorNear: '#1a2145',
    floorFar: '#080c1e',
    neon: '#57dcff',
    neon2: '#a678ff',
    accent: '#ffc978',
    rail: '#232c52',
    railTop: '#8494cf',
    ink: '#e3ebff',
  },

  build(b) {
    // ---- Outer shell ----
    b.wall([v2(WALL_L, 0), v2(WALL_L, CORNER_CY)], { thickness: 8, height: 46, style: 'rail' });
    b.wall([v2(WALL_R, 0), v2(WALL_R, CORNER_CY)], { thickness: 8, height: 46, style: 'rail' });
    b.arcWall(v2(WALL_L + CORNER_R, CORNER_CY), CORNER_R, PI / 2, PI, { thickness: 8, height: 46 });
    b.arcWall(v2(WALL_R - CORNER_R, CORNER_CY), CORNER_R, 0, PI / 2, { thickness: 8, height: 46 });
    b.wall([v2(WALL_L + CORNER_R, TOP_Y), v2(WALL_R - CORNER_R, TOP_Y)], { thickness: 8, height: 46 });

    // ---- Orbit lane inner boundary: the outer shell, offset inwards ----
    b.wall([v2(IN_L, RAIL_BOTTOM), v2(IN_L, CORNER_CY)], { thickness: 7, height: 38, style: 'metal' });
    b.wall([v2(IN_R, RAIL_BOTTOM), v2(IN_R, CORNER_CY)], { thickness: 7, height: 38, style: 'metal' });
    b.arcWall(v2(WALL_L + CORNER_R, CORNER_CY), IN_CORNER_R, PI / 2, PI, { thickness: 7, height: 38, style: 'metal' });
    b.arcWall(v2(WALL_R - CORNER_R, CORNER_CY), IN_CORNER_R, 0, PI / 2, { thickness: 7, height: 38, style: 'metal' });
    b.wall([v2(WALL_L + CORNER_R, IN_TOP), v2(WALL_R - CORNER_R, IN_TOP)], { thickness: 7, height: 38, style: 'metal' });

    // Rounded rail ends so a ball entering the orbit is guided, not stopped.
    b.post('rail-cap-l', IN_L, RAIL_BOTTOM, 10);
    b.post('rail-cap-r', IN_R, RAIL_BOTTOM, 10);

    // ---- Slingshots above each outlane ----
    // The vertical side of each triangle forms the inner wall of the outlane,
    // so the only way to drain is to roll off the end of the keybed.
    b.wall([v2(80, 344), v2(80, 206), v2(174, 206)], { thickness: 7, height: 32, style: 'rubber' });
    b.sling('sling-l', v2(80, 344), v2(174, 208), D3, 220);
    b.wall([v2(944, 344), v2(944, 206), v2(850, 206)], { thickness: 7, height: 32, style: 'rubber' });
    b.sling('sling-r', v2(944, 344), v2(850, 208), A3, 220);

    // ---- Pop bumpers, tuned to the tonic triad ----
    b.bumper('bumper-a', 420, 1006, 36, D4, 520);
    b.bumper('bumper-b', 604, 1006, 36, F4, 520);
    b.bumper('bumper-c', 512, 1148, 36, A4, 520);

    // ---- Drop target bank: one target per scale degree ----
    const bankNotes = [D4, F4, G4, A4, C5];
    for (let i = 0; i < 5; i++) {
      b.target(`drop-${i}`, 342 + i * 85, 764, 32, 0, bankNotes[i], 900, 'bank');
    }

    // ---- Rollovers under the dome ----
    const roll = [D5, F5, G5, C5];
    for (let i = 0; i < 4; i++) {
      b.rollover(`roll-${i}`, 372 + i * 93, 1236, 21, roll[i], 340, 'lanes');
    }

    // ---- Standup targets against the side walls ----
    b.target('stand-l', 148, 496, 40, PI / 2 - 0.30, D4, 680, 'side');
    b.target('stand-r', 876, 496, 40, PI / 2 + 0.30, A4, 680, 'side');

    // ---- Spinner in the left orbit ----
    b.spinner('spinner', v2(30, 952), v2(138, 952), A3, 160);

    // ---- Posts: the scatter that keeps the middle unpredictable ----
    b.post('post-l', 244, 556, 13);
    b.post('post-r', 780, 556, 13);
    b.post('post-c', 512, 578, 15);
    b.post('post-ul', 332, 424, 12);
    b.post('post-ur', 692, 424, 12);
    // Save posts at the outlane mouths: a slow ball can still be rescued here.
    b.post('save-l', 214, 300, 11);
    b.post('save-r', 810, 300, 11);

    // ---- The only way to lose a ball ----
    b.drain('drain', v2(0, 26), v2(W, 26), 26);

    // ---- Painted playfield art ----
    b.decal({ kind: 'arcband', x: W / 2, y: 1006, r: 250, a0: 0, a1: PI * 2, color: '#57dcff', alpha: 0.06 });
    b.decal({ kind: 'arcband', x: W / 2, y: 1006, r: 170, a0: 0, a1: PI * 2, color: '#a678ff', alpha: 0.07 });
    b.decal({ kind: 'glow', x: W / 2, y: 900, r: 460, color: '#3a5cff', alpha: 0.10 });
    b.decal({ kind: 'glow', x: W / 2, y: 210, r: 400, color: '#a678ff', alpha: 0.08 });
    for (let i = 0; i < 5; i++) {
      b.decal({ kind: 'inset', x: 342 + i * 85, y: 764, w: 62, h: 16, angle: 0, color: '#57dcff', alpha: 0.16 });
    }
    b.decal({ kind: 'line', x: W / 2, y: 470, w: 560, h: 3, angle: 0, color: '#8494cf', alpha: 0.16 });
    // Outlane mouths, marked so the danger reads at a glance.
    for (const x of [48, 976]) {
      b.decal({ kind: 'glow', x, y: 120, r: 150, color: '#ff5470', alpha: 0.16 });
      b.decal({ kind: 'inset', x, y: 168, w: 44, h: 7, angle: 0, color: '#ff5470', alpha: 0.4 });
      b.decal({ kind: 'inset', x, y: 128, w: 34, h: 6, angle: 0, color: '#ff5470', alpha: 0.28 });
      b.decal({ kind: 'inset', x, y: 96, w: 24, h: 5, angle: 0, color: '#ff5470', alpha: 0.18 });
    }
    b.decal({ kind: 'arcband', x: W / 2, y: 1006, r: 320, a0: 0, a1: PI * 2, color: '#57dcff', alpha: 0.045 });


  },
};
