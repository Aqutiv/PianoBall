import { MidiInput } from './midiInput';
import { NoteMapping } from './mapping';
import { KeyboardFallback } from './keyboardFallback';
import { DEFAULT_VELOCITY, mapVelocity, VelocityHistogram, type VelocitySettings } from './velocityCurve';
import type { InputEvent, InputListener, RawMessage } from './types';
import { load, save } from '../core/storage';

const MONITOR_CAP = 240;

/**
 * Single place every kind of input converges: hardware MIDI, the computer
 * keyboard, on-screen touch, and the scripted debug hook. The game only ever
 * sees normalised events, so all four paths are exercised by the same code.
 */
export class InputHub {
  readonly midi = new MidiInput();
  readonly mapping = new NoteMapping();
  readonly histogram = new VelocityHistogram();
  readonly keyboard: KeyboardFallback;

  velocity: VelocitySettings = { ...DEFAULT_VELOCITY, ...load('velocity', {}) };
  /** Raw pitch-bend position, -1..1. Smoothing happens in the tilt model. */
  bend = 0;
  /** Mod wheel position, 0..1. What it does is the current mode's business. */
  mod = 0;
  sustain = false;
  /** Notes currently held, whatever the source. */
  readonly held = new Set<number>();
  /** Rolling raw-message log for the monitor panel. */
  readonly monitor: RawMessage[] = [];

  private listeners: InputListener[] = [];

  constructor() {
    this.keyboard = new KeyboardFallback({
      baseNote: () => this.mapping.settings.baseNote,
      emit: (e) => this.dispatch(e),
      shiftOctave: (d) => this.mapping.shiftOctave(d),
    });
    this.midi.onEvent = (e) => this.dispatch(e);
    this.midi.onRaw = (m) => {
      this.monitor.push(m);
      if (this.monitor.length > MONITOR_CAP) this.monitor.shift();
    };
  }

  /** Live subscribers. The mode teardown test asserts on this. */
  get listenerCount(): number { return this.listeners.length; }

  on(fn: InputListener): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  /** Normalise, record, then fan out. */
  dispatch(e: InputEvent): void {
    switch (e.type) {
      case 'noteon':
        this.histogram.add(e.raw);
        this.held.add(e.note);
        break;
      case 'noteoff':
        this.held.delete(e.note);
        break;
      case 'bend':
        this.bend = e.value;
        break;
      case 'cc':
        if (e.controller === 1) this.mod = e.value;
        if (e.controller === 64) this.sustain = e.value >= 0.5;
        break;
      default:
        break;
    }
    for (const fn of this.listeners) fn(e);
  }

  /** Strike force for a raw MIDI velocity, under the current curve. */
  force(raw: number): number { return mapVelocity(raw, this.velocity); }

  setVelocitySettings(v: Partial<VelocitySettings>): void {
    this.velocity = { ...this.velocity, ...v };
    save('velocity', this.velocity);
  }

  resetVelocitySettings(): void {
    this.velocity = { ...DEFAULT_VELOCITY };
    save('velocity', this.velocity);
  }

  /** Synthesise a press from touch or from the debug hook. */
  press(note: number, force01: number, source: 'pointer' | 'debug' = 'debug'): void {
    const raw = Math.round(Math.max(1, Math.min(127, force01 * 127)));
    this.dispatch({ type: 'noteon', note, velocity: raw, raw, time: performance.now(), source });
  }

  release(note: number, source: 'pointer' | 'debug' = 'debug'): void {
    this.dispatch({ type: 'noteoff', note, time: performance.now(), source });
  }

  releaseAll(): void {
    for (const note of [...this.held]) this.release(note);
    this.keyboard.releaseAll();
  }

  clearMonitor(): void { this.monitor.length = 0; }

  async initMidi(): Promise<void> { await this.midi.init(); }
}
