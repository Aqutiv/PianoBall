import type { InputEvent } from './types';

/**
 * Tracker-style computer-keyboard piano: two rows of white keys with the
 * blacks above them. Not a nicety — Safari has no Web MIDI at all, and this is
 * how the game is playable and testable without hardware.
 */
const SEMITONES: Record<string, number> = {
  // Lower octave
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6,
  KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  // Upper octave
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18,
  KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
  KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28,
  BracketLeft: 29, Equal: 30, BracketRight: 31,
};

export interface KeyboardOptions {
  /** Supplies the current lowest mapped note. */
  baseNote: () => number;
  emit: (e: InputEvent) => void;
  /** Octave shift, from the bracket keys. */
  shiftOctave: (dir: number) => void;
}

export class KeyboardFallback {
  enabled = true;
  private held = new Set<string>();
  private opts: KeyboardOptions;
  private bendTarget = 0;
  /** Held ramp for the mod wheel: the arrow keys have no travel of their own. */
  private modLevel = 0;

  constructor(opts: KeyboardOptions) { this.opts = opts; }

  attach(target: Window | HTMLElement = window): () => void {
    const down = (ev: Event) => this.onDown(ev as KeyboardEvent);
    const up = (ev: Event) => this.onUp(ev as KeyboardEvent);
    const blur = () => this.releaseAll();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  private onDown(e: KeyboardEvent): void {
    if (!this.enabled || e.repeat || e.metaKey || e.ctrlKey) return;
    const now = performance.now();

    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      this.bendTarget = e.code === 'ArrowLeft' ? -1 : 1;
      this.opts.emit({ type: 'bend', value: this.bendTarget, time: now, source: 'keyboard' });
      e.preventDefault();
      return;
    }
    // Up and down step the mod wheel. A keyboard has no continuous control, so
    // it gets five detents rather than a sweep.
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const step = e.code === 'ArrowUp' ? 0.25 : -0.25;
      this.modLevel = Math.max(0, Math.min(1, this.modLevel + step));
      this.opts.emit({ type: 'cc', controller: 1, value: this.modLevel, time: now, source: 'keyboard' });
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
      this.opts.emit({ type: 'cc', controller: 64, value: 1, time: now, source: 'keyboard' });
      e.preventDefault();
      return;
    }
    if (e.code === 'Minus') { this.opts.shiftOctave(-1); return; }

    const semi = SEMITONES[e.code];
    if (semi === undefined || this.held.has(e.code)) return;
    this.held.add(e.code);
    // Shift and Alt stand in for hitting the key harder or softer.
    const raw = e.shiftKey ? 122 : e.altKey ? 42 : 92;
    this.opts.emit({
      type: 'noteon', note: this.opts.baseNote() + semi,
      velocity: raw, raw, time: now, source: 'keyboard',
    });
    e.preventDefault();
  }

  private onUp(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      this.bendTarget = 0;
      this.opts.emit({ type: 'bend', value: 0, time: now, source: 'keyboard' });
      return;
    }
    if (e.code === 'Space') {
      this.opts.emit({ type: 'cc', controller: 64, value: 0, time: now, source: 'keyboard' });
      return;
    }
    const semi = SEMITONES[e.code];
    if (semi === undefined || !this.held.has(e.code)) return;
    this.held.delete(e.code);
    this.opts.emit({ type: 'noteoff', note: this.opts.baseNote() + semi, time: now, source: 'keyboard' });
  }

  releaseAll(): void {
    const now = performance.now();
    for (const code of this.held) {
      const semi = SEMITONES[code];
      if (semi !== undefined) {
        this.opts.emit({ type: 'noteoff', note: this.opts.baseNote() + semi, time: now, source: 'keyboard' });
      }
    }
    this.held.clear();
    if (this.bendTarget !== 0) {
      this.bendTarget = 0;
      this.opts.emit({ type: 'bend', value: 0, time: now, source: 'keyboard' });
    }
    if (this.modLevel !== 0) {
      this.modLevel = 0;
      this.opts.emit({ type: 'cc', controller: 1, value: 0, time: now, source: 'keyboard' });
    }
  }
}
