import { afterEach, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { findLeadVoice, findBedVoice, DEFAULT_LEAD_VOICE, DEFAULT_BED_VOICE } from '../src/audio/voices';
import { artUrl } from '../src/ui/voiceArt';
import { LE_TEMPS_DES_CERISES as french, HAVA_NAGILA as hava } from '../src/modes/playtune/library/accordionTunes';
import { lastBeat } from '../src/modes/playtune/chart';
import { ROLES } from '../src/modes/playtune/role';
import { compilePublishedCatalog } from '../src/content/export';
import { validateCatalog } from '../src/content/schema';
import { setFreestyleSettings, resetFreestyleSettings, DEFAULT_FREESTYLE } from '../src/modes/freestyle/settings';

afterEach(() => vi.unstubAllGlobals());
it('registers both accordion banks and the provenance-verified 400px artwork', async () => {
  expect(findLeadVoice('accordion')).toMatchObject({ id: 'accordion', name: 'Accordion' });
  expect(findBedVoice('bed-accordion')).toMatchObject({ id: 'bed-accordion', name: 'Accordion' });
  expect(artUrl('accordion')).toBe('./instruments/accordion.jpg');
  expect(artUrl('bed-accordion')).toBe(artUrl('accordion'));
  const file = readFileSync('public/instruments/accordion.jpg');
  expect(await sharp(file).metadata()).toMatchObject({ width: 400, height: 400, format: 'jpeg' });
  const provenance = JSON.parse(readFileSync('assets/accordion.provenance.json', 'utf8'));
  expect(createHash('sha256').update(file).digest('hex')).toBe(provenance.sha256);
});

it('persists accordion choices without changing default instruments', () => {
  const saved = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) });
  setFreestyleSettings({ voiceId: 'accordion', bedVoiceId: 'bed-accordion' });
  expect(JSON.parse(saved.get('pianoball.freestyleSettings')!)).toMatchObject({ voiceId: 'accordion', bedVoiceId: 'bed-accordion' });
  expect(DEFAULT_FREESTYLE).toMatchObject({ voiceId: DEFAULT_LEAD_VOICE, bedVoiceId: DEFAULT_BED_VOICE });
  expect(DEFAULT_LEAD_VOICE).not.toBe('accordion');
  expect(DEFAULT_BED_VOICE).not.toBe('bed-accordion');
  resetFreestyleSettings();
});

it('retains the French pickup, long tie, final reprise and tonic cadence', () => {
  expect(french).toMatchObject({ bpm: 108, beatsPerBar: 3, pickup: 1, root: 60 });
  expect(lastBeat(french)).toBe(88);
  expect(french.melody[0]).toMatchObject({ beat: 0, note: 67, len: 1 });
  expect(french.melody.find(n => n.beat === 28)).toMatchObject({ note: 76, len: 7 });
  expect(french.melody.some(n => n.beat > 28 && n.beat < 36)).toBe(false);
  expect(french.melody.find(n => n.beat === 63)).toMatchObject({ note: 67, len: 1 });
  expect(french.melody.at(-1)).toMatchObject({ beat: 85, len: 3, note: 72 });
  expect(french.backingNotes![0].beat).toBe(1);
});

it('keeps Hava Nagila AABB and the entire third section, with declared modal pitches', () => {
  expect(hava).toMatchObject({ bpm: 108, root: 62, borrows: [1, 4] });
  expect(lastBeat(hava)).toBe(96);
  const phrase = (start: number, len: number) => hava.melody.filter(n => n.beat >= start && n.beat < start + len).map(n => [n.beat - start, n.note, n.len]);
  expect(phrase(0, 16)).toEqual(phrase(16, 16));
  expect(phrase(32, 16)).toEqual(phrase(48, 16));
  expect(hava.melody.find(n => n.beat === 64)).toMatchObject({ note: 69, len: 4 });
  expect(hava.melody.at(-1)).toMatchObject({ beat: 94, note: 62, len: 2 });
  for (const note of [63, 65, 66, 70, 72, 74]) expect(hava.melody.some(n => n.note === note)).toBe(true);
});

it('exports four correctly routed roles after La Bamba and excludes the deferred song', () => {
  const catalog = JSON.parse(JSON.stringify(compilePublishedCatalog({ sourceCommit: null, sourceDirty: null })));
  expect(() => validateCatalog(catalog)).not.toThrow();
  for (const role of Object.values(ROLES)) {
    expect(role.order.slice(role.order.indexOf('la-bamba') + 1, role.order.indexOf('la-bamba') + 3)).toEqual([french.id, hava.id]);
    for (const tune of [french, hava]) {
      expect(role.card(tune).difficulty).toBe(3);
      const entry = catalog.entries.find((e: { id: string; role: string }) => e.id === tune.id && e.role === role.id);
      expect(entry.voices).toEqual(role.voices(tune));
      expect(entry.drumEvents).toBeUndefined();
      expect(entry.playerNotes.length).toBeGreaterThan(0);
      expect(role.backing(tune).notes).toBe(role.id === 'melody' ? tune.backingNotes : tune.melody);
    }
  }
  expect(ROLES.melody.voices(french)).toEqual({ keyVoicing: 'lead', keys: 'accordion', backing: 'bed-accordion' });
  expect(ROLES.chords.voices(french)).toEqual({ keyVoicing: 'lead', keys: 'accordion', backing: 'bed-accordion' });
  expect(ROLES.melody.voices(hava)).toEqual({ keyVoicing: 'lead', keys: 'accordion', backing: 'nylon-guitar' });
  expect(ROLES.chords.voices(hava)).toEqual({ keyVoicing: 'bed', keys: 'nylon-guitar', backing: 'bed-accordion' });
  expect(JSON.stringify(catalog)).not.toMatch(/ravorombazaha|iny-hono/i);
});
