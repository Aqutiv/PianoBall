/**
 * The one place the app's colours are written down.
 *
 * Tables carry their own palette, but every mode that is not a table needs the
 * same colours, and the DOM chrome needs them too. Declaring them here and
 * pushing them into CSS custom properties means the canvas and the panels can
 * never drift apart.
 *
 * The declarations themselves moved into `themes/`, one file per look, once
 * there was more than one look to declare. This stays as the entry point so
 * `game/table/schema.ts` and the renderer keep importing from where they
 * always have.
 */
export type {
  Theme,
  TablePalette,
  KeyMaterial,
  WallColors,
  ToneCurve,
} from './themes';

export {
  THEMES,
  DEFAULT_THEME,
  NOCTURNE,
  findTheme,
  getTheme,
  applyTheme,
} from './themes';

import { DEFAULT_THEME } from './themes';

/** The default theme's colours. Kept for callers that only want a palette. */
export const DEFAULT_PALETTE = DEFAULT_THEME.palette;
