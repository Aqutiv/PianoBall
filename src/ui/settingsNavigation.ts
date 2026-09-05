import type { GameModeId } from '../app/mode';

export const SETTINGS_CATEGORIES = [
  { id: 'sound', label: 'Sound & music', description: 'Volume, backing and musical key' },
  { id: 'controls', label: 'Controls', description: 'Connect and set up your keyboard' },
  { id: 'appearance', label: 'Appearance', description: 'Theme, table size and graphics' },
  { id: 'accessibility', label: 'Accessibility', description: 'Motion, colours and note labels' },
  { id: 'modes', label: 'Game modes', description: 'Pinball, Freestyle and PlayTune' },
  { id: 'data', label: 'Data & reset', description: 'Defaults and earned progress' },
] as const;

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]['id'];

/** Session-only navigation. Never mixed into saved game preferences. */
export class SettingsNavigation {
  category: SettingsCategory = 'sound';
  mode: GameModeId | null = null;
  index = false;
  readonly expanded = new Set<string>();
  readonly scroll = new Map<string, number>();
  focusId = '';

  enter(narrow: boolean, mode: GameModeId | null): void {
    this.index = narrow;
    this.mode ??= mode ?? 'pinball';
    this.focusId = '';
  }

  select(category: SettingsCategory): void {
    this.category = category;
    this.index = false;
    this.focusId = '';
  }

  /** True when Back was consumed by the mobile category hierarchy. */
  back(narrow: boolean): boolean {
    if (!narrow || this.index) return false;
    this.index = true;
    this.focusId = `settings-nav-${this.category}`;
    return true;
  }

  returnFromCalibration(): void {
    this.select('controls');
    this.focusId = 'cal';
  }

  get pageKey(): string {
    return this.category === 'modes' ? `modes-${this.mode}` : this.category;
  }
}
