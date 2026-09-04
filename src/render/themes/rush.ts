import type { Theme } from './types';

const DISPLAY = 'Archivo, ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

/**
 * The same cyan and violet, with the restraint taken out.
 *
 * The closest of the four to Nocturne on paper, and the furthest from it in
 * feel: the palette barely moves but everything skews, the emissive field is
 * driven harder, and the bloom is turned up past the point Nocturne would
 * consider tasteful. Which is the whole idea.
 */
export const RUSH: Theme = {
  id: 'rush',
  name: 'Neon Rush',
  blurb: 'Hard edges, acid lime, everything on a slant.',

  palette: {
    void: '#05030f',
    floorNear: '#120a2e',
    floorFar: '#0b0620',
    floorDeep: '#05030f',
    neon: '#2ff6ff',
    neon2: '#8b5cff',
    accent: '#c4ff3d',
    rail: '#2a1a5e',
    railTop: '#a98cff',
    ink: '#ffffff',
    dim: '#8f88b8',
    panel: 'rgba(8, 4, 22, 0.93)',
    stroke: 'rgba(47, 246, 255, 0.28)',
    ok: '#c4ff3d',
    warn: '#ffb038',
    danger: '#ff2fa0',
    verdict: {
      perfect: '#2ff6ff',
      good: '#c4ff3d',
      ok: '#ffb038',
      miss: '#ff2fa0',
      wrong: '#8b5cff',
    },
  },

  keys: {
    whiteSide: '#1a1030',
    whiteTop: '#dfe6ff',
    whiteFaceHi: '#ffffff',
    whiteFaceLo: '#93a0c4',
    blackSide: '#08040f',
    blackTop: '#241a44',
    blackFaceHi: '#3a2a70',
    blackFaceLo: '#08040f',
  },

  walls: {
    rail: ['#2a1a5e', '#a98cff'],
    // Nothing in this world is made of wood; the style still has to resolve,
    // so it reads as another run of violet rather than as a missing material.
    wood: ['#1c1030', '#6a4fa8'],
    metal: ['#0e1430', '#8fd4ff'],
    rubber: ['#3a0a26', '#ff2fa0'],
    neon: ['rgba(47, 246, 255, 0.18)', '#2ff6ff'],
    sling: ['#3a0a26', '#ff6ec4'],
  },

  decals: {
    primary: '#2ff6ff',
    secondary: '#8b5cff',
    deep: '#4a1fd0',
    guide: '#c4ff3d',
    danger: '#ff2fa0',
  },

  elements: {
    postLo: '#1a1030',
    postHi: '#4a2a8a',
    sleeveLo: '#7a0a4c',
    sleeveHi: '#ff2fa0',
    sleeveCap: '#ffd6ec',
    bumperLo: '#120a2e',
    bumperHi: '#3a2a78',
    slingLo: '#3a0a26',
    slingHi: '#ff2fa0',
    slingFlash: '#ffffff',
    targetLo: '#0e1a3a',
    rolloverLo: '#1a1440',
    spinnerLo: '#12103a',
    spinnerHi: '#a98cff',
  },

  ball: {
    body: ['#ffffff', '#d9f7ff', '#7fbfd8', '#2a2a58', '#0d0a22', '#05030f'],
    edge: '#03020a',
    seam: '#0a0820',
    streak: '#2ff6ff',
    rim: '#2ff6ff',
    save: '#c4ff3d',
  },

  // Pushed past Nocturne rather than moved away from it: same hues, more of them.
  tone: { hueShift: 0, satScale: 1.15, lightScale: 1.02, sat: 88, light: 64 },

  outline: null,
  bloom: { strength: 0.56, spread: 0.72 },
  glow: { coreLight: 98, midLight: 78, midSat: 100, midAlpha: 0.5 },
  pool: { strength: 1, radius: 3.6 },
  glass: { sheen: '#7fe8ff', vignette: 0.88 },
  fonts: { display: DISPLAY, ui: DISPLAY, mono: MONO },
};
