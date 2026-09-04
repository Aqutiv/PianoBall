import type { Theme } from './types';

const UI = 'Fredoka, ui-rounded, "Segoe UI Variable", ui-sans-serif, system-ui, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

/**
 * Big, round, saturated. The friendliest reading of the same machine.
 *
 * The only theme that uses `outline`: every drawn element gets a hard dark
 * stroke, which is what turns the table from a lit surface into a set of
 * objects sitting on one. That also means the bloom stops carrying the shapes
 * and becomes decoration, so it is turned well down — a glow behind an
 * outlined object reads as fog rather than as light.
 */
export const TOYBOX: Theme = {
  id: 'toybox',
  name: 'Toybox',
  blurb: 'Chunky, bright and outlined. Everything looks pressable.',

  palette: {
    void: '#241b4d',
    floorNear: '#4a3aa0',
    floorFar: '#35289b',
    floorDeep: '#241b4d',
    neon: '#3ec6ff',
    neon2: '#a05cff',
    accent: '#ffab2e',
    rail: '#1a1030',
    railTop: '#ff5ea8',
    ink: '#fff6e5',
    dim: '#b9a8ff',
    panel: '#fff6e5',
    stroke: '#1a1030',
    ok: '#7ee34a',
    warn: '#ffab2e',
    danger: '#ff5ea8',
    verdict: {
      perfect: '#6fdcff',
      good: '#7ee34a',
      ok: '#ffab2e',
      miss: '#ff5ea8',
      wrong: '#c9a0ff',
    },
  },

  keys: {
    whiteSide: '#1a1030',
    whiteTop: '#fff6e5',
    whiteFaceHi: '#fffdf6',
    whiteFaceLo: '#d8c6a8',
    blackSide: '#120a24',
    blackTop: '#3a2a70',
    blackFaceHi: '#4a3690',
    blackFaceLo: '#1a1030',
  },

  walls: {
    rail: ['#1a1030', '#a05cff'],
    wood: ['#1a1030', '#ffab2e'],
    metal: ['#1a1030', '#6fdcff'],
    rubber: ['#1a1030', '#ff5ea8'],
    neon: ['rgba(62, 198, 255, 0.25)', '#6fdcff'],
    sling: ['#1a1030', '#ff8ac2'],
  },

  decals: {
    primary: '#6fdcff',
    secondary: '#a05cff',
    deep: '#7a3ae0',
    guide: '#7ee34a',
    danger: '#ff5ea8',
  },

  elements: {
    postLo: '#1a1030',
    postHi: '#7a4fd8',
    sleeveLo: '#1a1030',
    sleeveHi: '#ff5ea8',
    sleeveCap: '#ffe14d',
    bumperLo: '#1a1030',
    bumperHi: '#6a55d8',
    slingLo: '#1a1030',
    slingHi: '#ff5ea8',
    slingFlash: '#ffe14d',
    targetLo: '#1a1030',
    rolloverLo: '#1a1030',
    spinnerLo: '#1a1030',
    spinnerHi: '#7ee34a',
  },

  // A beach ball, not a bearing.
  ball: {
    body: ['#ffffff', '#ffe9f4', '#ff8ac2', '#c41f6c', '#5c0e33', '#1a1030'],
    edge: '#1a1030',
    seam: '#1a1030',
    streak: '#ffe14d',
    rim: '#ffffff',
    save: '#7ee34a',
  },

  // High-key and loud: the field is bright, so lightness goes up as well as
  // saturation rather than relying on bloom to carry it.
  tone: { hueShift: 0, satScale: 1.2, lightScale: 1.12, sat: 92, light: 66 },

  outline: { color: '#1a1030', width: 3 },
  // Turned down hard: glow behind an outlined shape muddies the outline.
  bloom: { strength: 0.22, spread: 0.46 },
  glow: { coreLight: 96, midLight: 80, midSat: 100, midAlpha: 0.3 },
  pool: null,
  grade: null,
  glass: { sheen: '#ffffff', vignette: 0.45 },
  fonts: { display: UI, ui: UI, mono: MONO },
};
