import type { Theme } from './types';

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace';

/**
 * The look the app has always had, now with a name.
 *
 * Every value here was lifted verbatim from where it used to be hardcoded, so
 * this theme renders the table byte-for-byte as it did before there were
 * themes. That is deliberate: it makes the extraction provable, and it means
 * anyone who liked PianoBall as it was keeps it by changing nothing.
 */
export const NOCTURNE: Theme = {
  id: 'nocturne',
  name: 'Nocturne',
  blurb: 'Cool neon on deep blue. The original.',

  palette: {
    void: '#04050d',
    floorNear: '#1a2145',
    floorFar: '#080c1e',
    floorDeep: '#03040c',
    neon: '#57dcff',
    neon2: '#a678ff',
    accent: '#ffc978',
    rail: '#232c52',
    railTop: '#8494cf',
    ink: '#e3ebff',
    dim: '#8593c4',
    panel: 'rgba(10, 14, 30, 0.82)',
    stroke: 'rgba(132, 148, 207, 0.22)',
    ok: '#45e2a0',
    warn: '#ffc978',
    danger: '#ff5470',
    verdict: {
      perfect: '#9be7ff',
      good: '#7fe0b0',
      ok: '#ffc978',
      miss: '#ff7a92',
      wrong: '#ffb46b',
    },
  },

  keys: {
    whiteSide: '#171d33',
    whiteTop: '#cfd8f0',
    whiteFaceHi: '#f2f5ff',
    whiteFaceLo: '#9aa6cb',
    blackSide: '#05060f',
    blackTop: '#1b2038',
    blackFaceHi: '#2a3150',
    blackFaceLo: '#0b0e1c',
  },

  walls: {
    rail: ['#232c52', '#8494cf'],
    wood: ['#20160f', '#8a6a4a'],
    metal: ['#141a30', '#a9bbe8'],
    rubber: ['#2b0f2c', '#ff7fae'],
    // Was `withAlpha(pal.neon, 0.15)`, written out so a theme can move the
    // glass wall independently of its neon.
    neon: ['rgba(87, 220, 255, 0.15)', '#57dcff'],
    sling: ['#2b0f2c', '#ff9ec0'],
  },

  // The five colours Aurora's silkscreen was drawn in when it was hardcoded.
  decals: {
    primary: '#57dcff',
    secondary: '#a678ff',
    deep: '#3a5cff',
    guide: '#8494cf',
    danger: '#ff5470',
  },

  elements: {
    postLo: '#1a1030',
    postHi: '#3b2a58',
    sleeveLo: '#61245a',
    sleeveHi: '#ff86b4',
    sleeveCap: '#ffd0e4',
    bumperLo: '#171c38',
    bumperHi: '#39406e',
    slingLo: '#2b0f2c',
    slingHi: '#ff7fae',
    slingFlash: '#ffd9e8',
    targetLo: '#101534',
    rolloverLo: '#1d2444',
    spinnerLo: '#161b33',
    spinnerHi: '#93a6dc',
  },

  ball: {
    body: ['#ffffff', '#e8efff', '#93a4c9', '#2d3450', '#0d1122', '#05070f'],
    edge: '#04060e',
    seam: '#0b1020',
    streak: '#94c6ff',
    rim: '#9fd0ff',
    save: '#63ffc4',
  },

  // Identity: this theme is the baseline every other one is measured against.
  tone: { hueShift: 0, satScale: 1, lightScale: 1, sat: 78, light: 62 },

  outline: null,
  bloom: { alphaA: 0.62, alphaB: 0.5 },
  glow: { coreLight: 96, midLight: 74, midSat: 92, midAlpha: 0.42 },
  pool: { strength: 0.85, radius: 3.2 },
  glass: { sheen: '#bed7ff', vignette: 0.82 },
  fonts: { display: FONT, ui: FONT, mono: MONO },
};
