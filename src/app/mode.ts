import type { Stage } from '../render/stage';
import type { InputHub } from '../midi/inputHub';
import type { AudioEngine } from '../audio/engine';
import type { ChordBed } from '../audio/bed';
import type { MusicState } from '../audio/musicState';
import type { Hud } from '../ui/hud';
import type { Screen } from '../ui/overlay';
import type { ModeResult } from './shell';
import type { KeyHit } from './pointerKeys';

export type GameModeId = 'freestyle' | 'pinball' | 'playtune';

/** Everything the shell lends a mode for as long as it is on screen. */
export interface ModeContext {
  stage: Stage;
  input: InputHub;
  audio: AudioEngine;
  bed: ChordBed;
  music: MusicState;
  hud: Hud;
  /** Ask the shell to open an overlay screen (results, song select, pause). */
  openScreen(screen: Screen): void;
  /** Hand the shell what the results screen should say about this run. */
  setResult(result: ModeResult): void;
}

/**
 * One playable thing.
 *
 * The contract that matters is `enter`/`exit`: a mode may subscribe to the
 * input hub, the music state and its own event bus in `enter`, and it must
 * release every one of those in `exit`. Nothing else tears them down, and a
 * mode that leaks a subscription keeps playing after the player has left it.
 * `ModeBase` exists so that is one line rather than a discipline.
 */
export interface GameMode {
  readonly id: GameModeId;
  enter(): void;
  exit(): void;
  step(dt: number): void;
  draw(alpha: number, frameDt: number): void;
  /** Per-frame HUD refresh. */
  hud(): void;
  /**
   * Which camera the stage draws this mode through: pinball's raked table, or
   * the flat stage above a docked keyboard. Read by the shell before `enter`.
   * Absent means the table.
   */
  readonly projection?: 'table' | 'flat';
  /** Simulated time multiplier. Only pinball's slow-motion uses this. */
  readonly timeScale?: number;
  /** Extra lines for the F3 panel. */
  debugLines?(): string;
  /**
   * The key under a point on the canvas, in CSS pixels, and how hard a tap
   * there strikes it. `moving` is true for a finger already sliding across the
   * keys, which may reach a little further than a fresh tap. The shell owns the
   * fingers themselves (see `PointerKeys`); a mode only says what is where.
   */
  keyAt?(x: number, y: number, moving: boolean): KeyHit | null;
  /** Whether a finger sliding across the keys plays each one it crosses. */
  readonly glide?: boolean;
  /**
   * Bumped whenever the keys move on screen. A finger that came down before
   * the move keeps its note but stops sliding.
   */
  readonly keyLayoutRevision?: number;
  /** Escape was pressed, or the mode is being suspended behind a menu. */
  pause?(): void;
  resume?(): void;
  /**
   * Backspace was pressed with the board in front of the player: begin the
   * current run again from the top. Returns whether there was one to begin.
   */
  restart?(): boolean;
}

/** Subscription bookkeeping, which is the whole of the teardown contract. */
export abstract class ModeBase {
  private offs: (() => void)[] = [];

  /** Register an unsubscribe closure to be run on `exit`. */
  protected track(off: () => void): void {
    this.offs.push(off);
  }

  /** Drop every subscription taken since the last `enter`. */
  protected release(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }

  /** How many subscriptions are outstanding. The teardown test reads this. */
  get tracked(): number { return this.offs.length; }
}
