/**
 * The one place the app's colours are written down.
 *
 * Tables carry their own palette, but every mode that is not a table needs the
 * same colours, and the DOM chrome needs them too. Declaring them here and
 * pushing them into CSS custom properties at boot means the canvas and the
 * panels can never drift apart.
 */
export interface TablePalette {
  /** Deep background outside the playfield. */
  void: string;
  /** Playfield surface, near and far, for the vertical gradient. */
  floorNear: string;
  floorFar: string;
  /** Primary and secondary neon. */
  neon: string;
  neon2: string;
  /** Warm accent used sparingly for high-value features. */
  accent: string;
  rail: string;
  railTop: string;
  ink: string;
}

export const DEFAULT_PALETTE: TablePalette = {
  void: '#04050d',
  floorNear: '#1a2145',
  floorFar: '#080c1e',
  neon: '#57dcff',
  neon2: '#a678ff',
  accent: '#ffc978',
  rail: '#232c52',
  railTop: '#8494cf',
  ink: '#e3ebff',
};

/** Palette keys that `styles.css` also declares as custom properties. */
const CSS_VARS: [keyof TablePalette, string][] = [
  ['void', '--void'],
  ['ink', '--ink'],
  ['neon', '--neon'],
  ['neon2', '--neon2'],
  ['accent', '--accent'],
];

/**
 * Push a palette onto the document root so the DOM chrome follows the canvas.
 * A no-op outside a browser, so the headless tests can import this freely.
 */
export function applyPalette(pal: TablePalette): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, cssVar] of CSS_VARS) root.style.setProperty(cssVar, pal[key]);
}
