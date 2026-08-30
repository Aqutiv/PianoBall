import type { GameMode, GameModeId, ModeContext } from './mode';
import { PinballMode } from '../modes/pinball/pinball';
import { FreestyleMode } from '../modes/freestyle/freestyle';
import { PlayTuneMode } from '../modes/playtune/playtune';

export interface ModeInfo {
  id: GameModeId;
  title: string;
  /** One line on the mode card. */
  tagline: string;
  /** Two emoji-free glyphs drawn on the card, purely decorative. */
  glyph: string;
}

/** The order the home screen lists them in. */
export const MODE_INFO: readonly ModeInfo[] = [
  {
    id: 'freestyle',
    title: 'Freestyle',
    tagline: 'Play for the sound of it. Abstract light, no rules.',
    glyph: '◍',
  },
  {
    id: 'pinball',
    title: 'Pinball',
    tagline: 'Thirty-two flippers. Every key is a paddle.',
    glyph: '◉',
  },
  {
    id: 'playtune',
    title: 'PlayTune',
    tagline: 'Learn a melody, or learn the chords under one.',
    glyph: '◈',
  },
];

type Factory = (ctx: ModeContext) => GameMode;

/**
 * How each mode is built. Modes are constructed on first entry and kept, so
 * coming back to one is instant rather than rebuilding a physics world.
 */
export const FACTORIES: Partial<Record<GameModeId, Factory>> = {
  freestyle: (ctx) => new FreestyleMode(ctx),
  pinball: (ctx) => new PinballMode(ctx),
  playtune: (ctx) => new PlayTuneMode(ctx),
};

/** The modes that actually exist, in display order. */
export function availableModes(): ModeInfo[] {
  return MODE_INFO.filter((m) => FACTORIES[m.id] !== undefined);
}
