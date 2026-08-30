import type { Theme, TablePalette } from './types';
import { NOCTURNE } from './nocturne';
import { RUSH } from './rush';
import { VELVET } from './velvet';
import { TOYBOX } from './toybox';

export type { Theme, TablePalette, KeyMaterial, WallColors, ToneCurve } from './types';
export { NOCTURNE } from './nocturne';
export { RUSH } from './rush';
export { VELVET } from './velvet';
export { TOYBOX } from './toybox';

/** Every theme the picker offers, in display order. */
export const THEMES: readonly Theme[] = [NOCTURNE, RUSH, VELVET, TOYBOX];

export const DEFAULT_THEME = NOCTURNE;

export function findTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/**
 * The theme in force right now.
 *
 * A module-level holder rather than a parameter threaded through every draw
 * call: `tone()` is reached from a dozen files deep inside per-frame rendering,
 * and passing a theme down to each of them would be a much larger change than
 * the theming itself. `applyTheme` is the only writer.
 */
let active: Theme = DEFAULT_THEME;

export function getTheme(): Theme { return active; }

/**
 * Colour tokens as CSS custom properties.
 *
 * Named so the flat palette keys keep the variable names `styles.css` already
 * used — `--void`, `--ink`, `--neon` — and the widened ones get obvious kebab
 * spellings. Everything is pushed, which is the point: the old `applyPalette`
 * wrote five of them and silently overrode whatever the stylesheet had said,
 * so any colour it missed could drift from the canvas.
 */
function cssVars(theme: Theme): [string, string][] {
  const p: TablePalette = theme.palette;
  return [
    ['--void', p.void],
    ['--floor-near', p.floorNear],
    ['--floor-far', p.floorFar],
    ['--floor-deep', p.floorDeep],
    ['--neon', p.neon],
    ['--neon2', p.neon2],
    ['--accent', p.accent],
    ['--rail', p.rail],
    ['--rail-top', p.railTop],
    ['--ink', p.ink],
    ['--dim', p.dim],
    ['--panel', p.panel],
    ['--stroke', p.stroke],
    ['--ok', p.ok],
    ['--warn', p.warn],
    ['--danger', p.danger],
    ['--v-perfect', p.verdict.perfect],
    ['--v-good', p.verdict.good],
    ['--v-ok', p.verdict.ok],
    ['--v-miss', p.verdict.miss],
    ['--v-wrong', p.verdict.wrong],
    ['--font-display', theme.fonts.display],
    ['--font-ui', theme.fonts.ui],
    ['--font-mono', theme.fonts.mono],
    // The names the stylesheet used before there were display faces.
    ['--font', theme.fonts.ui],
    ['--mono', theme.fonts.mono],
  ];
}

/**
 * Make a theme current: canvas, DOM chrome and the browser's own UI together.
 *
 * A no-op outside a browser, so the headless tests can import this freely.
 */
export function applyTheme(theme: Theme): void {
  active = theme;
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  for (const [name, value] of cssVars(theme)) root.style.setProperty(name, value);
  // The address bar and the OS task switcher follow the theme too.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.palette.void);
}
