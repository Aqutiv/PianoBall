import { describe, expect, it } from 'vitest';
import type { RhythmHit } from '../src/modes/playtune/chart';
import { lastBeat, validate } from '../src/modes/playtune/chart';
import { HOPSCOTCH } from '../src/modes/playtune/library/hopscotch';
import { FIRST_LIGHT, TWO_HANDS } from '../src/modes/playtune/library/originals';
import { CHORD_GROUND, CHORD_MARCH, CHORD_THREE } from '../src/modes/playtune/library/studies';
import { repeatRhythm } from '../src/modes/playtune/library/rhythmNotation';
import { rhythmEvents } from '../src/modes/playtune/rhythm';

describe('rhythm notation in chart beat units', () => {
  const bar: readonly RhythmHit[] = Object.freeze([
    Object.freeze({ beat: 0, voice: 'kick' as const, gain: 0.2 }),
    Object.freeze({ beat: 3, voice: 'rim' as const, gain: 0.12 }),
    Object.freeze({ beat: 5, voice: 'hat' as const, gain: 0.06 }),
  ]);

  it('keeps a compound meter and fractional pickup without adding pickup percussion', () => {
    const rhythm = repeatRhythm({ beatsPerBar: 6, barOrigin: 0.5, endBeat: 12, hits: bar });
    expect(rhythm.sections).toEqual([]);
    expect(rhythm.hits?.map(hit => [hit.beat, hit.voice])).toEqual([
      [0.5, 'kick'], [3.5, 'rim'], [5.5, 'hat'],
      [6.5, 'kick'], [9.5, 'rim'], [11.5, 'hat'],
    ]);
  });

  it('clips a partial span without restarting its bar phase or sounding at the end', () => {
    const rhythm = repeatRhythm({
      beatsPerBar: 6, barOrigin: 0.5, startBeat: 2, endBeat: 6.5, hits: bar,
    });
    expect(rhythm.hits).toEqual([
      { beat: 3.5, voice: 'rim', gain: 0.12 },
      { beat: 5.5, voice: 'hat', gain: 0.06 },
    ]);
    expect(repeatRhythm({ beatsPerBar: 6, barOrigin: 0.5, startBeat: 0, endBeat: 0.5, hits: bar }).hits)
      .toEqual([]);
  });

  it('sorts simultaneous voices stably and owns its output without changing the bar', () => {
    const input: RhythmHit[] = [
      { beat: 1, voice: 'rim', gain: 0.1 },
      { beat: 0, voice: 'kick', gain: 0.2 },
      { beat: 0, voice: 'hat', gain: 0.05 },
    ];
    const original = structuredClone(input);
    const options = { beatsPerBar: 4, endBeat: 5, hits: input };
    const rhythm = repeatRhythm(options);
    expect(rhythm).toEqual(repeatRhythm(options));
    expect(rhythm.hits?.map(hit => [hit.beat, hit.voice])).toEqual([
      [0, 'kick'], [0, 'hat'], [1, 'rim'], [4, 'kick'], [4, 'hat'],
    ]);
    rhythm.hits![0].gain = 1;
    expect(input).toEqual(original);
  });

  it('rejects invalid bounds before generating an unbounded arrangement', () => {
    for (const options of [
      { beatsPerBar: 0, endBeat: 8, hits: bar },
      { beatsPerBar: 6, endBeat: Infinity, hits: bar },
      { beatsPerBar: 6, endBeat: 4, startBeat: 5, hits: bar },
      { beatsPerBar: 6, endBeat: 8, barOrigin: NaN, hits: bar },
      { beatsPerBar: Number.MIN_VALUE, endBeat: 8, hits: [bar[0]] },
      { beatsPerBar: 6, endBeat: 200_000, hits: bar },
    ]) expect(() => repeatRhythm(options)).toThrow(/Repeated rhythm/);
  });

  it('rejects duplicate voices, out-of-bar offsets, unknown voices, and invalid gains', () => {
    for (const hits of [
      [bar[0], bar[0]], [{ ...bar[0], beat: 6 }], [{ ...bar[0], beat: -1 }],
      [{ ...bar[0], gain: NaN }], [{ ...bar[0], gain: 1.01 }],
      [{ ...bar[0], voice: 'missing' as never }],
    ]) expect(() => repeatRhythm({ beatsPerBar: 6, endBeat: 12, hits })).toThrow(/Repeated rhythm/);
  });
});

describe('restrained original-track percussion', () => {
  it('gives First Light only a clear quarter-note rim pulse', () => {
    const hits = rhythmEvents(FIRST_LIGHT.rhythm);
    expect(hits).toHaveLength(32);
    expect(hits.map(hit => hit.beat)).toEqual(Array.from({ length: 32 }, (_, beat) => beat));
    expect(new Set(hits.map(hit => hit.voice))).toEqual(new Set(['rim']));
    expect(hits[0].gain).toBeGreaterThan(hits[1].gain);
  });

  it('gives Two Hands a steady backbeat and alternating light eighth-note hats', () => {
    const hits = rhythmEvents(TWO_HANDS.rhythm);
    expect(hits).toHaveLength(192);
    const firstBar = hits.filter(hit => hit.beat < 4);
    expect(firstBar.filter(hit => hit.voice === 'kick').map(hit => hit.beat)).toEqual([0, 2]);
    expect(firstBar.filter(hit => hit.voice === 'rim').map(hit => hit.beat)).toEqual([1, 3]);
    const hats = firstBar.filter(hit => hit.voice === 'hat');
    expect(hats.map(hit => hit.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(hats[0].gain).toBeGreaterThan(hats[1].gain);
  });

  it('supports the two Backing studies without subdivisions or added fills', () => {
    for (const [tune, count, voices] of [
      [CHORD_GROUND, 48, ['kick', 'hat']],
      [CHORD_MARCH, 64, ['kick', 'rim', 'hat']],
    ] as const) {
      const hits = rhythmEvents(tune.rhythm);
      expect(hits).toHaveLength(count);
      expect(new Set(hits.map(hit => hit.voice))).toEqual(new Set(voices));
      expect(hits.every(hit => Number.isInteger(hit.beat))).toBe(true);
      const firstBar = hits.filter(hit => hit.beat < 4);
      expect(firstBar.filter(hit => hit.voice === 'kick').map(hit => hit.beat)).toEqual([0, 2]);
      expect(firstBar.filter(hit => hit.voice === 'hat').map(hit => hit.beat)).toEqual([0, 1, 2, 3]);
    }
    expect(rhythmEvents(CHORD_MARCH.rhythm).filter(hit => hit.beat < 4 && hit.voice === 'rim')
      .map(hit => hit.beat)).toEqual([1, 3]);
  });

  it('keeps original arrangements finite and valid while preserving Hopscotch and the retired study', () => {
    expect(rhythmEvents(HOPSCOTCH.rhythm)).toHaveLength(194);
    expect(CHORD_THREE.rhythm).toBeUndefined();
    const hopscotchPeak = Math.max(...rhythmEvents(HOPSCOTCH.rhythm).map(hit => hit.gain));
    for (const tune of [FIRST_LIGHT, TWO_HANDS, CHORD_GROUND, CHORD_MARCH]) {
      expect(validate(tune), tune.id).toEqual([]);
      const hits = rhythmEvents(tune.rhythm);
      expect(hits[0].beat).toBe(0);
      expect(hits.every(hit => hit.beat >= 0 && hit.beat < lastBeat(tune) && hit.gain < hopscotchPeak)).toBe(true);
      expect(hits.at(-1)!.beat).toBeGreaterThanOrEqual(lastBeat(tune) - 1);
    }
  });
});
