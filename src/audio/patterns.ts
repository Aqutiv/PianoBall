import type { DrumVoice } from './drums';

/**
 * The pattern library.
 *
 * Each lane is one character per step, which is the only way thirty-odd
 * patterns stay readable in one file — and it is the same trick the PlayTune
 * notation uses for melodies. Reading a lane tells you what it sounds like.
 *
 *   `X` accent   `x` normal   `-` ghost   `.` rest
 */
export const STEP_LEVELS: Record<string, number> = { X: 1, x: 0.72, '-': 0.32, '.': 0 };

/** Every character a lane may contain, for the library's own sanity check. */
export const STEP_CHARS = 'Xx-.';

export interface RhythmPattern {
  id: string;
  name: string;
  /** Groups the picker. Patterns are listed in family order. */
  family: string;
  /** Quarter-notes in a bar. Three for a waltz, and three for a 6/8 bar too. */
  beats: number;
  /** Steps in a bar. Four per beat is sixteenths, three is eighth triplets. */
  steps: number;
  /**
   * Swing already written into the feel, on top of which the player's trim is
   * added. Patterns notated in triplets carry their swing in the notation and
   * leave this at zero.
   */
  swing: number;
  /**
   * Whether the odd steps are off-sixteenths that a shuffle should push late.
   * False for anything in triplets or in compound time, where delaying every
   * other step would not swing the pattern but wreck it.
   */
  swings: boolean;
  lanes: Partial<Record<DrumVoice, string>>;
}

/** A straight sixteenth-note bar: the shape most of the library is written in. */
const sixteenths = (
  id: string, name: string, family: string,
  lanes: Partial<Record<DrumVoice, string>>, swing = 0,
): RhythmPattern => ({ id, name, family, beats: 4, steps: 16, swing, swings: true, lanes });

/** Eighth-note triplets across four beats: the jazz grid. */
const triplets = (
  id: string, name: string, family: string,
  lanes: Partial<Record<DrumVoice, string>>,
): RhythmPattern => ({ id, name, family, beats: 4, steps: 12, swing: 0, swings: false, lanes });

export const PATTERNS: readonly RhythmPattern[] = [
  // ------------------------------------------------------------ straight ---
  sixteenths('four-floor', 'Four on the Floor', 'Straight', {
    kick:    'X...x...X...x...',
    hat:     '..x...x...x...x.',
    clap:    '....X.......X...',
  }),
  sixteenths('house', 'House', 'Straight', {
    kick:    'X...X...X...X...',
    openhat: '..x...x...x...x.',
    clap:    '....X.......X...',
    shaker:  'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('techno', 'Techno', 'Straight', {
    kick:    'X...X...X...X...',
    hat:     'x.x.x.x.x.x.x.x.',
    openhat: '......x.......x.',
    rim:     '..x.......x.....',
  }),
  sixteenths('disco', 'Disco', 'Straight', {
    kick:    'X...X...X...X...',
    snare:   '....X..-....X..-',
    openhat: '..x...x...x...x.',
    hat:     'x...x...x...x...',
  }),
  sixteenths('trance', 'Trance', 'Straight', {
    kick:    'X...X...X...X...',
    hat:     'x-x-x-x-x-x-x-x-',
    openhat: '..x...x...x...x.',
    clap:    '....X.......X...',
  }),
  sixteenths('motorik', 'Motorik', 'Straight', {
    kick:    'X.......X.X.....',
    snare:   '....X.......X.-.',
    hat:     'x.x.x.x.x.x.x.x.',
  }),

  // ------------------------------------------------------------ backbeat ---
  sixteenths('rock', 'Rock', 'Backbeat', {
    kick:    'X.......X.......',
    snare:   '....X.......X...',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('pop', 'Pop', 'Backbeat', {
    kick:    'X.....x.X.....x.',
    snare:   '....X..-....X.-.',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('stadium', 'Stadium', 'Backbeat', {
    kick:    'X.X.....X.X.....',
    clap:    '....X.......X...',
  }),
  sixteenths('ballad', 'Ballad', 'Backbeat', {
    kick:    'X.......X.......',
    rim:     '....X.....-.X...',
    hat:     'x...x...x...x...',
  }),
  sixteenths('half-time', 'Half-Time', 'Backbeat', {
    kick:    'X.....x.........',
    snare:   '........X....-..',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('train', 'Train Beat', 'Backbeat', {
    kick:    'X.......X.......',
    snare:   'X-x-X-x-X-x-X-x-',
  }),
  sixteenths('bo-diddley', 'Bo Diddley', 'Backbeat', {
    tomLo:   'X..X..X...X.X...',
    rim:     '....x.......x...',
    shaker:  'x.x.x.x.x.x.x.x.',
  }),

  // -------------------------------------------------------------- broken ---
  sixteenths('boom-bap', 'Boom Bap', 'Broken', {
    kick:    'X........x......',
    snare:   '....X..-....X..-',
    hat:     'x.x.x.x.x.x.x.x.',
  }, 0.2),
  sixteenths('trap', 'Trap', 'Broken', {
    kick:    'X.......x..x....',
    snare:   '........X.......',
    hat:     'x.x.xxx.x.x.xxxx',
  }),
  sixteenths('breakbeat', 'Breakbeat', 'Broken', {
    kick:    'X..x....x..X....',
    snare:   '....X.-.....X.-.',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('dnb', 'Drum and Bass', 'Broken', {
    kick:    'X.........X.....',
    snare:   '....X..-....X.-.',
    hat:     'x.x.x.x.x.x.x.x.',
    ride:    '..x...x...x...x.',
  }),
  sixteenths('garage', '2-Step Garage', 'Broken', {
    kick:    'X......x....x...',
    snare:   '....X.......X...',
    hat:     'x-x-x-x-x-x-x-x-',
    shaker:  '..x...x...x...x.',
  }, 0.25),
  sixteenths('funk-16', 'Funk Sixteenths', 'Broken', {
    kick:    'X..x..X...x..X..',
    snare:   '....X..-....X-..',
    hat:     'X-x-X-x-X-x-X-x-',
  }),
  sixteenths('songo', 'Songo', 'Broken', {
    kick:    '......x.......x.',
    snare:   '....X..-....X...',
    ride:    'x.x.x.x.x.x.x.x.',
    cowbell: '..x.......x.....',
  }),

  // -------------------------------------------------------- swing & jazz ---
  triplets('jazz-ride', 'Jazz Ride', 'Swing and Jazz', {
    ride:    'X..x.xX..x.x',
    hat:     '...x.....x..',
    kick:    '-.....-.....',
    snare:   '.....-.....-',
  }),
  triplets('brushes', 'Brushes', 'Swing and Jazz', {
    shaker:  'x.xx.xx.xx.x',
    snare:   '...-.....-..',
    kick:    'x...........',
  }),
  triplets('shuffle', 'Shuffle', 'Swing and Jazz', {
    kick:    'X.....X.....',
    snare:   '...X.....X..',
    hat:     'x.xx.xx.xx.x',
  }),
  sixteenths('second-line', 'Second Line', 'Swing and Jazz', {
    kick:    'X..x....X.x.....',
    snare:   '....X..x....X..x',
    rim:     '..x.......x.....',
  }, 0.15),

  // --------------------------------------------------------------- latin ---
  sixteenths('bossa', 'Bossa Nova', 'Latin', {
    kick:    'X.....x.X.....x.',
    rim:     'x..x..x...x.x...',
    shaker:  'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('samba', 'Samba', 'Latin', {
    kick:    '....X.......X...',
    tomLo:   'x.......x.......',
    shaker:  'xxxxxxxxxxxxxxxx',
    rim:     'x..x..x...x.x...',
  }),
  sixteenths('tresillo', 'Tresillo', 'Latin', {
    kick:    'X.....X.....X...',
    clap:    '........X.......',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('rumba', 'Rumba Clave', 'Latin', {
    rim:     'x..x...x..x.x...',
    kick:    'X.......X.......',
    shaker:  'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('cha-cha', 'Cha-Cha', 'Latin', {
    cowbell: 'x.x.x.x.x.x.x.x.',
    kick:    'X.....x.X.....x.',
    rim:     '....x.......x...',
    snare:   '............X.X.',
  }),
  sixteenths('reggaeton', 'Reggaeton', 'Latin', {
    kick:    'X...x...X...x...',
    snare:   '...x..x....x..x.',
    hat:     'x.x.x.x.x.x.x.x.',
  }),
  sixteenths('afrobeat', 'Afrobeat', 'Latin', {
    kick:    'X..x..X...x.X...',
    shaker:  'x.xxx.xxx.xxx.xx',
    rim:     '..x...x...x...x.',
  }),

  // -------------------------------------------------------------- sparse ---
  sixteenths('pulse', 'Pulse', 'Sparse', {
    rim:     'X...x...x...x...',
  }),
  sixteenths('heartbeat', 'Heartbeat', 'Sparse', {
    kick:    'X.x.....X.x.....',
  }),
  sixteenths('offbeat', 'Off-Beat', 'Sparse', {
    kick:    'X.......X.......',
    openhat: '..x...x...x...x.',
  }),
  sixteenths('clave', 'Clave Only', 'Sparse', {
    rim:     'x..x..x...x.x...',
  }),
  sixteenths('shaker-only', 'Shaker Only', 'Sparse', {
    shaker:  'x-x-x-x-x-x-x-x-',
  }),
  {
    id: 'waltz', name: 'Waltz', family: 'Sparse',
    beats: 3, steps: 12, swing: 0, swings: true,
    lanes: {
      kick:  'X...........',
      snare: '....x...x...',
      hat:   'x.x.x.x.x.x.',
    },
  },
  {
    // Six eighths to the bar, which is three quarter-notes long — so the bar
    // still measures in the beats the tempo control counts.
    id: 'six-eight', name: 'Six-Eight', family: 'Sparse',
    beats: 3, steps: 12, swing: 0, swings: false,
    lanes: {
      kick:  'X.....x.....',
      snare: '......X.....',
      hat:   'x.x.x.x.x.x.',
    },
  },
];

/** Families in the order the picker should group them. */
export const PATTERN_FAMILIES: readonly string[] =
  [...new Set(PATTERNS.map((p) => p.family))];

/** A pattern by id. A stale saved preference falls back to the first one. */
export function findPattern(id: string): RhythmPattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}
