import type { Cadences, Step } from './music';
import { EventBus } from '../core/events';
import { clamp } from '../core/math';
import { load, save } from '../core/storage';
import { MODES, findMode, type ActiveMusic, type MusicMode } from './music';

/** What the player picked in settings: a `MODES` id, or 'random'. */
export const RANDOM = 'random';

/** A key preference: a pitch class, or a fresh one drawn each game. */
export type KeyChoice = number | typeof RANDOM;

/** A key select's value back to a preference. */
export const toKeyChoice = (value: string): KeyChoice =>
  (value === RANDOM ? RANDOM : Number(value));

/** Travel of the tempo control: a slow ballad through to hardcore. */
export const MIN_BPM = 50;
export const MAX_BPM = 200;

/**
 * The nearest place a pitch class sits to a given note.
 *
 * Moving the key by a semitone should move the music by a semitone. Folding
 * the interval to 0..11 and always subtracting sends everything above the
 * tonic down an octave instead — from D, that is D# through G landing eleven
 * semitones below where they were asked for.
 */
function nearestRoot(base: number, pitchClass: number): number {
  const want = ((pitchClass % 12) + 12) % 12;
  const up = ((want - base) % 12 + 12) % 12;
  return up <= 6 ? base + up : base + up - 12;
}

export interface MusicStateEvents {
  /** The key, scale or tempo changed. Modes retune on this. */
  change: ActiveMusic;
  /**
   * The tempo alone moved.
   *
   * Separate from `change` because retuning is expensive to hear: it restarts
   * the chord progression and wipes what is on screen. That is right when the
   * key changes and quite wrong when somebody is dragging a tempo slider.
   */
  tempo: number;
}

interface StoredMusic {
  mode: string;
  /** Pitch class of the tonic, or `RANDOM` to draw one each game. */
  key: number | string | null;
}

export interface MusicDefaults {
  root: number;
  bpm: number;
  /** `MODES` id used when the saved preference names something unknown. */
  mode: string;
}

/**
 * Musical preferences and their resolved key and scale.
 *
 * Pinball and Freestyle each own an instance and a separate storage key.
 * PlayTune temporarily tunes the Pinball instance to the song it is playing.
 *
 * Key and scale are each a *preference* — `keyChoice` and `choice`, either of
 * which may be `RANDOM` — resolved into the concrete `root` and `scale` that
 * everything downstream reads.
 */
export class MusicState {
  readonly bus = new EventBus<MusicStateEvents>();
  /** The saved preference, which may be `RANDOM`. */
  choice: string;
  /** The saved key, which may be `RANDOM`. */
  keyChoice: KeyChoice;

  root: number;
  bpm: number;
  id = MODES[0].id as string;
  label = MODES[0].label;
  scale: number[] = [...MODES[0].scale];
  progression = MODES[0].progression;
  variation: Step[] | undefined = MODES[0].variation;
  turnaround: Step | undefined = MODES[0].turnaround;
  cadences: Cadences | undefined = MODES[0].cadences;

  private readonly defaults: MusicDefaults;

  constructor(defaults: MusicDefaults, private readonly storageKey = 'music') {
    this.defaults = defaults;
    this.bpm = defaults.bpm;
    // Random by default, the key as well as the scale: a fresh player should
    // meet a different colour each game rather than the one the table happens
    // to be authored in. A saved pitch class is a deliberate pin and is kept —
    // a record written before the key had a random option, or one holding
    // anything out of range, falls to random with everybody else.
    const stored = load<StoredMusic>(this.storageKey, { mode: RANDOM, key: RANDOM });
    this.choice = stored.mode;
    this.keyChoice = typeof stored.key === 'number' && stored.key >= 0 && stored.key < 12
      ? stored.key
      : RANDOM;
    this.root = this.resolveKey();
    this.set(this.resolve(), true);
  }

  get active(): ActiveMusic {
    return {
      root: this.root, bpm: this.bpm,
      id: this.id, label: this.label,
      scale: this.scale, progression: this.progression,
      variation: this.variation, turnaround: this.turnaround, cadences: this.cadences,
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
   * Pin the tonic to a pitch class, or hand it back to chance.
   *
   * A pinned key stays in the register the app is written around rather than
   * leaping an octave to reach it, and so does a drawn one.
   */
  setKey(choice: KeyChoice): void {
    this.keyChoice = choice;
    this.persist();
    const root = this.resolveKey();
    if (root === this.root) return;
    this.root = root;
    this.bus.emit('change', this.active);
  }

  private persist(): void {
    save(this.storageKey, { mode: this.choice, key: this.keyChoice });
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
    this.variation = mode.variation;
    this.turnaround = mode.turnaround;
    this.cadences = mode.cadences;
    if (!quiet) this.bus.emit('change', this.active);
  }

  /** Place the music at a different tonic and tempo. PlayTune uses this. */
  setTuning(root: number, bpm: number): void {
    if (root === this.root && bpm === this.bpm) return;
    this.root = root;
    this.bpm = bpm;
    this.bus.emit('change', this.active);
  }

  /** Move the tempo without the retune a new key or scale forces. */
  setBpm(bpm: number): void {
    const next = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
    if (next === this.bpm) return;
    this.bpm = next;
    this.bus.emit('tempo', next);
  }

  /**
   * Forget the key and the scale together.
   *
   * `setChoice` alone would write the current key straight back out, so a
   * "reset everything" that went through it left the tonic exactly where the
   * player had put it.
   */
  resetSettings(): void {
    this.choice = RANDOM;
    this.keyChoice = RANDOM;
    this.bpm = this.defaults.bpm;
    this.persist();
    this.redraw();
  }

  /** Back to the tempo the app starts in, and the tonic the player asked for. */
  resetTuning(): void {
    this.setTuning(this.resolveKey(), this.defaults.bpm);
  }

  /** Re-draw whatever the player left to chance. */
  roll(): void {
    if (this.choice === RANDOM || this.keyChoice === RANDOM) this.redraw();
  }

  /**
   * The die: hand the scale back to chance and draw again.
   *
   * Re-picking the option already selected fires no change event, so this is
   * the only way to ask for another draw without leaving the mode. It forces
   * the scale and re-draws the key only if the key was already on random — a
   * deliberate pin belongs to the player, not to the die.
   */
  drawAgain(): void {
    this.choice = RANDOM;
    this.persist();
    this.redraw();
  }

  /**
   * Resolve both preferences, and announce them as a single `change`.
   *
   * Not two: the bed tears its progression down on that event, and doing that
   * twice at the top of a game is audible.
   */
  private redraw(): void {
    this.root = this.resolveKey();
    this.set(this.resolve());
  }

  private resolve(): string {
    // Deliberately not a seeded rng: that one exists so a run can be replayed,
    // whereas which scale you land in should genuinely vary.
    if (this.choice === RANDOM) return MODES[Math.floor(Math.random() * MODES.length)].id;
    return this.choice;
  }

  /** The same draw, whichever the key came from: pinned, or off the top. */
  private resolveKey(): number {
    const pitchClass = this.keyChoice === RANDOM
      ? Math.floor(Math.random() * 12)
      : this.keyChoice;
    return nearestRoot(this.defaults.root, pitchClass);
  }
}
