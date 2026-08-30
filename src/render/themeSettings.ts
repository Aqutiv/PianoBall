import { load, save } from '../core/storage';
import { DEFAULT_THEME, findTheme, type Theme } from './themes';

const KEY = 'theme';

export interface ThemeSettings {
  /** Id of the chosen theme. Falls back to the default if it no longer exists. */
  id: string;
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { id: DEFAULT_THEME.id };

let current: ThemeSettings = { ...DEFAULT_THEME_SETTINGS, ...load(KEY, {}) };

export function themeSettings(): ThemeSettings { return current; }

/** The chosen theme, resolved. Never null: an unknown id lands on the default. */
export function currentTheme(): Theme { return findTheme(current.id); }

export function setThemeId(id: string): void {
  current = { id };
  save(KEY, current);
}

/**
 * Part of the panel's "reset everything".
 *
 * Deliberately a settings module of its own rather than a field on
 * `RenderQuality`: quality is about what the machine can afford to draw, and
 * the theme is about what the player wants to look at. They also reset through
 * different paths — `Stage.resetSettings` is called by the adaptive pass's
 * owner, and a theme should survive that.
 */
export function resetThemeSettings(): void {
  current = { ...DEFAULT_THEME_SETTINGS };
  save(KEY, current);
}
