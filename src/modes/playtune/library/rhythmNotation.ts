import { DRUM_SPECS } from '../../../audio/drums';
import type { RhythmHit, TuneRhythm } from '../chart';

export interface RepeatedRhythm {
  /** The chart's beat unit, including eighth-note beats in compound meter. */
  beatsPerBar: number;
  /** Exclusive end of the written arrangement, in absolute chart beats. */
  endBeat: number;
  /** Hits within one bar, with beat measured from that bar's downbeat. */
  hits: readonly RhythmHit[];
  /** First downbeat; set to the pickup length when the chart has a pickup. */
  barOrigin?: number;
  /** Inclusive start; defaults to barOrigin, leaving the pickup unaccompanied. */
  startBeat?: number;
}

/** Repeat a written bar into finite explicit hits without changing beat units. */
export function repeatRhythm({
  beatsPerBar, endBeat, hits, barOrigin = 0, startBeat = barOrigin,
}: RepeatedRhythm): TuneRhythm {
  if (![beatsPerBar, endBeat, barOrigin, startBeat].every(Number.isFinite)
    || beatsPerBar <= 0 || barOrigin < 0 || startBeat < 0 || endBeat < startBeat) {
    throw new Error('Repeated rhythm needs finite, nonnegative chart bounds and a positive meter');
  }
  const seen = new Set<string>();
  for (const hit of hits) {
    if (!Number.isFinite(hit.beat) || hit.beat < 0 || hit.beat >= beatsPerBar
      || !Number.isFinite(hit.gain) || hit.gain < 0 || hit.gain > 1
      || !Object.hasOwn(DRUM_SPECS, hit.voice)) {
      throw new Error('Repeated rhythm has an invalid bar hit');
    }
    const key = `${hit.voice}@${hit.beat}`;
    if (seen.has(key)) throw new Error(`Repeated rhythm has duplicate bar hit ${key}`);
    seen.add(key);
  }
  if (!hits.length || startBeat === endBeat) return { sections: [], hits: [] };

  const firstBar = Math.floor((startBeat - barOrigin) / beatsPerBar);
  const afterLastBar = Math.ceil((endBeat - barOrigin) / beatsPerBar);
  // Each complete bar contains at least one hit. Bound work before looping,
  // allowing the two edge bars whose hits can fall outside the requested span.
  if (!Number.isSafeInteger(firstBar) || !Number.isSafeInteger(afterLastBar)
    || afterLastBar - firstBar > 20_002) {
    throw new Error('Repeated rhythm exceeds 20000 written hits');
  }
  const written: RhythmHit[] = [];
  for (let bar = firstBar; bar < afterLastBar; bar++) {
    const downbeat = barOrigin + bar * beatsPerBar;
    for (const hit of hits) {
      const beat = downbeat + hit.beat;
      if (beat < startBeat || beat >= endBeat) continue;
      if (written.length >= 20_000) throw new Error('Repeated rhythm exceeds 20000 written hits');
      written.push({ beat, voice: hit.voice, gain: hit.gain });
    }
  }
  return { sections: [], hits: written.sort((a, b) => a.beat - b.beat) };
}

