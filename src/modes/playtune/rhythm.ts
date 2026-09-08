import { DRUM_SPECS, type DrumVoice } from '../../audio/drums';
import type { Scheduled } from '../../audio/engine';
import { PATTERNS, STEP_LEVELS } from '../../audio/patterns';
import type { RhythmHit, TuneRhythm } from './chart';
import type { Transport } from './transport';

/** Problems in an authored drum arrangement, without silently falling back. */
export function rhythmProblems(rhythm: TuneRhythm, beatsPerBar: number, end: number): string[] {
  const out: string[] = [];
  let previousEnd = 0;
  const validGain = (gain: number) => Number.isFinite(gain) && gain >= 0 && gain <= 1;
  for (const section of rhythm.sections) {
    const pattern = PATTERNS.find((p) => p.id === section.patternId);
    if (!pattern) out.push(`unknown rhythm pattern "${section.patternId}"`);
    else if (pattern.beats !== beatsPerBar) out.push(`rhythm pattern "${pattern.id}" does not match ${beatsPerBar} beats per bar`);
    if (!Number.isFinite(section.beat) || section.beat < 0 || section.beat >= end) {
      out.push(`rhythm section at beat ${section.beat} is outside the chart`);
    }
    if (!Number.isFinite(section.len) || section.len <= 0 || section.beat + section.len > end) {
      out.push(`rhythm section at beat ${section.beat} has an invalid length`);
    }
    if (section.beat < previousEnd) out.push(`rhythm sections overlap or are unsorted at beat ${section.beat}`);
    if (!validGain(section.gain)) out.push(`rhythm section at beat ${section.beat} has an invalid gain`);
    previousEnd = section.beat + section.len;
  }
  const seen = new Set<string>();
  let previousBeat = -1;
  for (const hit of rhythm.hits ?? []) {
    if (!Number.isFinite(hit.beat) || hit.beat < 0 || hit.beat >= end) {
      out.push(`rhythm hit at beat ${hit.beat} is outside the chart`);
    }
    if (hit.beat < previousBeat) out.push(`rhythm hits are not sorted at beat ${hit.beat}`);
    if (!Object.hasOwn(DRUM_SPECS, hit.voice)) out.push(`unknown drum voice "${hit.voice}"`);
    if (!validGain(hit.gain)) out.push(`rhythm hit at beat ${hit.beat} has an invalid gain`);
    const key = `${hit.voice}@${hit.beat}`;
    if (seen.has(key)) out.push(`duplicate rhythm hit ${key}`);
    seen.add(key);
    previousBeat = hit.beat;
  }
  return out;
}

/**
 * Expand the Freestyle pattern notation into this tune's beat coordinates.
 * Sections use the tune's bar phase, so changing texture halfway through a bar
 * preserves the downbeat. Written fills can replace a pattern hit or mute it
 * with gain zero; gaps between sections are allowed to breathe.
 */
export function rhythmEvents(rhythm: TuneRhythm | undefined, pickup = 0): RhythmHit[] {
  if (!rhythm) return [];
  const events = new Map<string, RhythmHit>();
  const put = (hit: RhythmHit) => events.set(`${hit.voice}@${hit.beat}`, hit);
  for (const section of rhythm.sections) {
    const pattern = PATTERNS.find((p) => p.id === section.patternId);
    if (!pattern) continue;
    const step = pattern.beats / pattern.steps;
    const firstBar = Math.floor((section.beat - pickup) / pattern.beats);
    const sectionEnd = section.beat + section.len;
    for (let bar = firstBar; pickup + bar * pattern.beats < sectionEnd; bar++) {
      for (let index = 0; index < pattern.steps; index++) {
        const swing = pattern.swings && index % 2 ? pattern.swing * step * 0.66 : 0;
        const beat = pickup + bar * pattern.beats + index * step + swing;
        if (beat < section.beat || beat >= sectionEnd) continue;
        for (const [voice, lane] of Object.entries(pattern.lanes)) {
          const gain = STEP_LEVELS[lane[index]] * section.gain;
          if (gain > 0) put({ beat, voice: voice as DrumVoice, gain });
        }
      }
    }
  }
  for (const hit of rhythm.hits ?? []) put(hit);
  return [...events.values()].filter((hit) => hit.gain > 0).sort((a, b) => a.beat - b.beat);
}

export interface TuneDrumSink {
  readonly now: number;
  readonly running: boolean;
  drum(voice: DrumVoice, gain: number, at: number): Scheduled;
}

const TICK_MS = 40;
const LOOKAHEAD = 0.15;
// Keep cancellable handles while their sources can still sound. This is a
// conservative ceiling; velocity only shortens the drum bank's decay times.
const MAX_TAIL = Math.max(...Object.values(DRUM_SPECS).map((spec) => Math.max(
  spec.noiseAttack + spec.noiseDecay + spec.bursts * spec.burstGap,
  ...spec.tone.map((tone) => spec.toneDecay * tone[2]),
  spec.metal?.decay ?? 0, spec.wires?.decay ?? 0, spec.click?.decay ?? 0,
))) + 0.1;

/** A finite drum arrangement on the same audio clock as the notes and judge. */
export class TuneDrums {
  private timer: ReturnType<typeof setInterval> | null = null;
  private clock: Transport | null = null;
  private events: RhythmHit[] = [];
  private next = 0;
  private placed: { endsAt: number; sound: Scheduled }[] = [];

  private readonly sink: TuneDrumSink;

  constructor(sink: TuneDrumSink) { this.sink = sink; }

  start(rhythm: TuneRhythm | undefined, clock: Transport, pickup = 0): void {
    this.stop();
    this.events = rhythmEvents(rhythm, pickup);
    if (!this.events.length) return;
    this.clock = clock;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  /** Cancel both the future lookahead and any drum still ringing. */
  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const hit of this.placed) hit.sound.cancel();
    this.placed = [];
    this.events = [];
    this.next = 0;
    this.clock = null;
  }

  private tick(): void {
    const clock = this.clock;
    if (!clock?.running) { this.stop(); return; }
    if (!this.sink.running) return;
    const now = this.sink.now;
    this.placed = this.placed.filter((hit) => hit.endsAt > now);
    while (this.next < this.events.length) {
      const hit = this.events[this.next];
      const at = clock.timeOf(hit.beat);
      if (at > now + LOOKAHEAD) break;
      this.next++;
      // A stalled tab skips elapsed beats instead of playing a catch-up burst.
      if (at < now) continue;
      this.placed.push({
        endsAt: at + MAX_TAIL,
        sound: this.sink.drum(hit.voice, hit.gain, at),
      });
    }
    // Let the ending decay before releasing the scheduler's last handles.
    if (this.next === this.events.length && !this.placed.length) this.stop();
  }
}