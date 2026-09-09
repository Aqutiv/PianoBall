import { describe, expect, it, vi } from 'vitest';
import { BED_VOICES, LEAD_VOICES } from '../src/audio/voices';
import { compilePublishedCatalog } from '../src/content/export';
import { validateCatalog } from '../src/content/schema';
import { validate } from '../src/modes/playtune/chart';
import { chordProblems } from '../src/modes/playtune/chords';
import { FIXED_PAIRINGS, backingInstruments } from '../src/modes/playtune/fixedPairings';
import { findChordEntry } from '../src/modes/playtune/library/chordcurve';
import { ROLES, type RoleId } from '../src/modes/playtune/role';
import handoff from './fixtures/playtune-fixed-pairings.json';

const provenance = { sourceCommit: null, sourceDirty: null };

describe('fixed PlayTune handoff assignments', () => {
  it('retains all 48 role entries in the supplied order with exact native-compatible wire voices', () => {
    const published = compilePublishedCatalog(provenance);
    expect(published.schemaVersion).toBe(1);
    expect(published.entries).toHaveLength(48);
    expect(published.entries.map(({ id, role, title, voices }) => ({ id, role, title, voices }))).toEqual(handoff.entries);
    expect(() => validateCatalog(published)).not.toThrow();
    for (const role of Object.values(ROLES)) {
      expect(Object.keys(FIXED_PAIRINGS[role.id])).toEqual(role.order);
    }
  });

  it.each(handoff.entries)('$role:$id authors the exact source voices before validation and runtime selection', ({ id, role: roleId, voices }) => {
    const role = ROLES[roleId as RoleId];
    const tune = role.tunes.find(t => t.id === id)!;
    expect(role.voices(tune)).toEqual(voices);
    if (role.id === 'melody') {
      expect(tune).toMatchObject({ voiceId: voices.keys, bedVoiceId: voices.backing });
    } else {
      const authored = findChordEntry(id)!.role;
      expect(authored).toMatchObject({ keyVoicing: voices.keyVoicing, keysVoiceId: voices.keys, melodyVoiceId: voices.backing });
      expect(chordProblems(tune, authored)).toEqual([]);
    }
    expect(validate(tune)).toEqual([]);
    const bank = voices.keyVoicing === 'lead' ? LEAD_VOICES : BED_VOICES;
    expect(bank.find(v => v.id === voices.keys)?.id).toBe(voices.keys);
    expect(BED_VOICES.find(v => v.id === voices.backing)?.id).toBe(voices.backing);
  });

  it('requires explicit Backing choices and never uses inherited object properties as instrument entries', () => {
    expect(() => backingInstruments('unassigned-piece')).toThrow('No fixed Backing instruments');
    expect(() => backingInstruments('toString')).toThrow('No fixed Backing instruments');
  });

  it('exports the same choices on retries without consulting random selection', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('Unexpected instrument randomization'); });
    try {
      expect(JSON.stringify(compilePublishedCatalog(provenance))).toBe(JSON.stringify(compilePublishedCatalog(provenance)));
    } finally {
      random.mockRestore();
    }
  });
});
