import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ALL_TUNES } from '../src/modes/playtune/library';
import { CHORD_CURVE } from '../src/modes/playtune/library/chordcurve';
import { SCALES } from '../src/audio/music';
import { compilePublishedCatalog } from '../src/content/export';
import type { CourseEntryV1 } from '../src/content/schema';
import { REVISED_BACKING_IDS, REVISED_MELODY_IDS } from '../src/modes/playtune/chartRevisions';
import previous from './fixtures/playable-signatures-9840971.json';

// Freeze the OLD playable contract only. The new score checks live in the
// musical-*.test.ts files; expression and orchestration never invalidate bests.
function signature(e: CourseEntryV1) {
  return createHash('sha256').update(JSON.stringify({ bpm: e.bpm, beatsPerBar: e.beatsPerBar,
    pickup: e.pickup, pass: e.pass, notes: e.playerNotes.map(({ beat, len, note }) => ({ beat, len, note })) })).digest('hex');
}

it('preserves every track ID, role and course position from 9840971', () => {
  const entries = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries;
  expect(entries.map(({ id, role }) => ({ id, role }))).toEqual(previous.entries.map(({ id, role }) => ({ id, role })));
  expect(new Set(entries.map(e => e.id)).size).toBe(21);
});

it('archives exactly the roles with changed playable notes, rhythm, tempo or pass marks', () => {
  const entries = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries;
  for (const role of ['melody', 'chords'] as const) {
    const changed = entries.filter(e => e.role === role && signature(e) !== previous.entries.find(p => p.id === e.id && p.role === role)!.signature).map(e => e.id).sort();
    expect([...(role === 'melody' ? REVISED_MELODY_IDS : REVISED_BACKING_IDS)].sort(), role).toEqual(changed);
  }
});

it('declares every accidental in both written parts across the full catalog', () => {
  for (const tune of ALL_TUNES) {
    const allowed = new Set<number>([...SCALES[tune.scaleId], ...(tune.borrows ?? [])]);
    for (const n of [...tune.melody, ...(tune.backingNotes ?? [])]) {
      expect(allowed.has((n.note - tune.root + 1200) % 12), tune.id + ' pitch ' + n.note).toBe(true);
    }
  }
});

it('shapes every computer-played melody while retaining graded durations', () => {
  for (const { tune } of CHORD_CURVE) {
    expect(new Set(tune.melody.map(n => n.gain)).size, tune.id).toBeGreaterThan(1);
    for (const n of tune.melody) {
      expect(n.gain, tune.id).toBeGreaterThan(0);
      expect(n.gain, tune.id).toBeLessThanOrEqual(tune.id === 'drunken-sailor' ? 0.1 : 0.05);
      expect(n.soundingLen, tune.id).toBeGreaterThan(0);
    }
  }
});
