import { EventBus } from '../core/events';
import { load, save } from '../core/storage';
import { MODES, findMode, type ActiveMusic, type MusicMode } from './music';

const STORAGE_KEY = 'music';

/** What the player picked in settings: a `MODES` id, or 'random'. */
export const RANDOM = 'random';

export interface MusicStateEvents {
  /** The key, scale or tempo changed. Modes retune on this. */
  change: ActiveMusic;
}

interface StoredMusic {
  mode: string;
  /** Pitch class of the tonic, or null to follow whatever names the default. */
  key: number | null;
}

export interface MusicDefaults {
  root: number;
  bpm: number;
  /** `MODES` id used when the saved preference names something unknown. */
  mode: string;
}

/**
 * The key everything is playing in, shared by all three modes.
 *
 * Scale choice used to belong to the pinball table, which meant it could not
 * follow the player into a mode that has no table. It lives here instead: the
 * settings panel writes to it, and whichever mode is running listens.
 */
export class MusicState {
  readonly bus = new EventBus<MusicStateEvents>();
  /** The saved preference, which may be `RANDOM`. */
  choice: string;

  root: number;
  bpm: number;
  id = MODES[0].id as string;
  label = MODES[0].label;
  scale: number[] = [...MODES[0].scale];
  progression = MODES[0].progression;

  private readonly defaults: MusicDefaults;

  constructor(defaults: MusicDefaults) {
    this.defaults = defaults;
    this.root = defaults.root;
    this.bpm = defaults.bpm;
    // Random by default: a fresh player should meet a different colour each
    // game rather than the one the table happens to be authored in. The key is
    // remembered as a plain pitch class so a saved D survives whatever octave
    // the table happens to be authored in.
    const stored = load<StoredMusic>(STORAGE_KEY, { mode: RANDOM, key: null });
    this.choice = stored.mode;
    if (stored.key !== null && stored.key >= 0 && stored.key < 12) {
      this.root = defaults.root - ((defaults.root - stored.key) % 12 + 12) % 12;
    }
    this.set(this.resolve(), true);
  }

  get active(): ActiveMusic {
    return {
      root: this.root, bpm: this.bpm,
      id: this.id, label: this.label,
      scale: this.scale, progression: this.progression,
    };
  }

  /** The mode a table or a tune is authored in, for retuning away from it. */
  get fallback(): MusicMode {
    return findMode(this.defaults.mode) ?? MODES[0];
  }

  /** Remember what the player picked, and apply it now so they can hear it. */
  setChoice(choice: string): void {
    this.choice = choice;
    this.persist();
    this.set(this.resolve());
  }

  /**
   * Move the tonic to a pitch class, staying in the register the app is
   * written around rather than leaping an octave to reach it.
   */
  setRoot(pitchClass: number): void {
    const want = ((pitchClass % 12) + 12) % 12;
    const base = this.defaults.root;
    const root = base - ((base - want) % 12 + 12) % 12;
    if (root === this.root) return;
    this.root = root;
    this.persist();
    this.bus.emit('change', this.active);
  }

  private persist(): void {
    save(STORAGE_KEY, { mode: this.choice, key: ((this.root % 12) + 12) % 12 });
  }

  /**
   * Move to a named scale. Unknown ids fall back to the default, which is what
   * a stale saved preference looks like.
   */
  set(id: string, quiet = false): void {
    const mode = findMode(id) ?? this.fallback;
    this.id = mode.id;
    this.label = mode.label;
    this.scale = mode.scale;
    this.progression = mode.progression;
    if (!quiet) this.bus.emit('change', this.active);
  }

  /** Place the music at a different tonic and tempo. PlayTune uses this. */
  setTuning(root: number, bpm: number): void {
    if (root === this.root && bpm === this.bpm) return;
    this.root = root;
    this.bpm = bpm;
    this.bus.emit('change', this.active);
  }

  /** Back to the tonic and tempo the app starts in. */
  resetTuning(): void {
    this.setTuning(this.defaults.root, this.defaults.bpm);
    this.persist();
  }

  /** Re-draw the scale. Under `RANDOM` this is a fresh one; otherwise a no-op. */
  roll(): void {
    if (this.choice === RANDOM) this.set(this.resolve());
  }

  private resolve(): string {
    // Deliberately not a seeded rng: that one exists so a run can be replayed,
    // whereas which scale you land in should genuinely vary.
    if (this.choice === RANDOM) return MODES[Math.floor(Math.random() * MODES.length)].id;
    return this.choice;
  }
}
