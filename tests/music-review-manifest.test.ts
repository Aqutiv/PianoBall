import { describe, expect, it } from 'vitest';
import { retainRepeatCheck, validateReviewSampleRate } from '../scripts/music-review-manifest';

const entry = (id: string, role = 'melody', sampleRate = 48000) => ({ id, role, stems: [{ sampleRate }, { sampleRate }, { sampleRate }] });
const repeat = { id: 'fur-elise', role: 'melody', expectedSha256: 'original', actualSha256: 'repeat', withinTolerance: true };

describe('partial audio review evidence', () => {
  it('accepts matching rates and a new full-render manifest', () => {
    expect(() => validateReviewSampleRate({ sampleRate: 48000, entries: [entry('fur-elise')] }, 48000)).not.toThrow();
    expect(() => validateReviewSampleRate(null, 24000)).not.toThrow();
  });
  it.each([24000, 44100])('rejects changing a prior 48 kHz manifest to %i Hz', sampleRate => {
    expect(() => validateReviewSampleRate({ sampleRate: 48000, entries: [entry('fur-elise')] }, sampleRate)).toThrow('across sample rates');
  });
  it('rejects a manifest whose top-level rate hides mixed-rate WAV stems', () => {
    const mixed = entry('first-light');
    mixed.stems[1].sampleRate = 24000;
    expect(() => validateReviewSampleRate({ sampleRate: 48000, entries: [entry('fur-elise'), mixed] }, 48000)).toThrow('across sample rates');
  });
  it('keeps repeat evidence when its exact role entry is retained', () => {
    expect(retainRepeatCheck(repeat, [entry('fur-elise'), entry('first-light')])).toBe(repeat);
  });
  it('drops the old repeat check when the checked arrangement is rerendered', () => {
    expect(retainRepeatCheck(repeat, [entry('first-light')])).toBeUndefined();
    expect(repeat.expectedSha256).toBe('original');
  });
  it('does not transfer a repeat check to the other role of the same tune', () => {
    expect(retainRepeatCheck(repeat, [entry('fur-elise', 'chords')])).toBeUndefined();
  });
  it('drops checks for retired entries and leaves absent checks absent', () => {
    expect(retainRepeatCheck(repeat, [])).toBeUndefined();
    expect(retainRepeatCheck(undefined, [entry('fur-elise')])).toBeUndefined();
  });
});
