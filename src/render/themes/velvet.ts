import type { Theme } from './types';

const DISPLAY = '"Cormorant Garamond", ui-serif, Georgia, "Times New Roman", serif';
const UI = 'Jost, ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

/**
 * A recital hall rather than an arcade.
 *
 * The one theme that takes the piano half seriously. Its keys are genuine
 * ivory and ebony instead of lit plastic, its rails are brass, and its bloom
 * is candlelight — warm, and much softer than Nocturne's, because the light in
 * this room comes from a lamp rather than from the table itself.
 *
 * The tone curve does the rest: pitch hues are pulled a little warm and their
 * saturation dropped hard, so the field reads as jewelled rather than neon
 * while every note still gets its own distinguishable colour.
 */
export const VELVET: Theme = {
  id: 'velvet',
  name: 'Velvet & Brass',
  blurb: 'Brass on ebony. Engraved, warm, unhurried.',

  palette: {
    void: '#0d0a10',
    floorNear: '#3a1640',
    floorFar: '#1c0d16',
    floorDeep: '#0a060c',
    neon: '#d9a441',
    neon2: '#2f9e9e',
    accent: '#e8bd63',
    // The cabinet body is ebony; brass is the lip and the fittings, not the
    // whole machine. `walls.rail` carries the brass rail itself.
    rail: '#2a2018',
    railTop: '#c99a3e',
    ink: '#f4ece0',
    dim: '#8a7a5e',
    panel: 'rgba(23, 18, 28, 0.94)',
    stroke: 'rgba(217, 164, 65, 0.34)',
    ok: '#2f9e9e',
    warn: '#d9a441',
    danger: '#a8443a',
    verdict: {
      perfect: '#e8bd63',
      good: '#2f9e9e',
      ok: '#a6905f',
      miss: '#a8443a',
      wrong: '#7b5f8a',
    },
  },

  // Real ivory and real ebony: warm off-white over a felted, near-black wood.
  keys: {
    whiteSide: '#3a3229',
    whiteTop: '#fbf6ec',
    whiteFaceHi: '#fffdf7',
    whiteFaceLo: '#c9bda6',
    blackSide: '#0b090d',
    blackTop: '#241f28',
    blackFaceHi: '#332c38',
    blackFaceLo: '#0b090d',
  },

  walls: {
    rail: ['#4a3512', '#e8bd63'],
    wood: ['#2a1a10', '#8a6440'],
    metal: ['#3a2c14', '#d9a441'],
    // Rubber is felt here — the bumper trim on a good instrument.
    rubber: ['#2a0d20', '#a8443a'],
    neon: ['rgba(217, 164, 65, 0.18)', '#e8bd63'],
    sling: ['#2a0d20', '#c96a52'],
  },

  // Inlay rather than silkscreen: brass on ebony, with the peacock accent
  // standing in for the cool marking and oxblood around the outlanes.
  decals: {
    primary: '#d9a441',
    secondary: '#2f9e9e',
    deep: '#6a2a52',
    guide: '#c99a3e',
    danger: '#a8443a',
  },

  elements: {
    postLo: '#1a1220',
    postHi: '#5a4420',
    sleeveLo: '#4a2018',
    sleeveHi: '#a8443a',
    sleeveCap: '#e8c9a0',
    bumperLo: '#1a1220',
    bumperHi: '#5a4420',
    slingLo: '#2a0d20',
    slingHi: '#a8443a',
    slingFlash: '#f0d8b0',
    targetLo: '#1a1220',
    rolloverLo: '#221a2a',
    spinnerLo: '#1a1220',
    spinnerHi: '#d9a441',
  },

  // Brass rather than chrome: the light side goes warm before it goes white.
  ball: {
    body: ['#fff6e2', '#f0d9a8', '#c39a52', '#5c431c', '#251a0c', '#0f0a06'],
    edge: '#0a0705',
    seam: '#1a1208',
    streak: '#e8c98a',
    rim: '#f0d9a8',
    save: '#2f9e9e',
  },

  // Warmed and calmed: +18 degrees off the wheel, saturation well down,
  // lightness held so the field stays readable under a softer bloom.
  tone: { hueShift: 18, satScale: 0.6, lightScale: 0.96, sat: 52, light: 62 },

  outline: null,
  // Candlelight: present, but nothing like Nocturne's electric halo.
  bloom: { alphaA: 0.44, alphaB: 0.34 },
  glow: { coreLight: 92, midLight: 68, midSat: 62, midAlpha: 0.34 },
  glass: { sheen: '#ffe6b8', vignette: 0.9 },
  fonts: { display: DISPLAY, ui: UI, mono: MONO },
};
