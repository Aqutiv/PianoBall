import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BED_VOICES, LEAD_VOICES } from '../src/audio/voices';
import { ART_IDS, artId, artUrl } from '../src/ui/voiceArt';

const DIR = resolve(__dirname, '../public/instruments');

/**
 * The bank and the picture folder have to be kept together by something other
 * than memory. Adding a voice is a one-line change in `voices.ts`, and nothing
 * about that line suggests a picture is owed — so the picker would quietly
 * show a caption over a blank square months later.
 */
describe('instrument art', () => {
  const voices = [...LEAD_VOICES, ...BED_VOICES];

  it('covers every voice in both banks', () => {
    const missing = voices
      .filter((v) => artUrl(v.id) === null)
      .map((v) => `${v.id} (${v.name})`);
    expect(missing).toEqual([]);
  });

  it('ships a file for every id it claims', () => {
    const onDisk = new Set(
      readdirSync(DIR).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)),
    );
    expect([...ART_IDS].filter((id) => !onDisk.has(id))).toEqual([]);
  });

  it('carries no picture nothing points at', () => {
    const wanted = new Set(voices.map((v) => artId(v.id)));
    const orphans = readdirSync(DIR)
      .filter((f) => f.endsWith('.jpg'))
      .map((f) => f.slice(0, -4))
      .filter((id) => !wanted.has(id));
    expect(orphans).toEqual([]);
  });

  it('resolves a bed voice to the lead voice it reuses', () => {
    expect(artId('bed-harp')).toBe('harp');
    expect(artId('bed-electric-piano')).toBe('electric-piano');
    // The bed's "Organ" and the lead bank's "Drawbar" are one instrument.
    expect(artId('bed-organ')).toBe('drawbar');
  });

  it('asks for a relative url, because the build is deployed under a path', () => {
    expect(artUrl('vibraphone')).toBe('./instruments/vibraphone.jpg');
  });

  it('says no rather than guessing for an unknown voice', () => {
    expect(artUrl('no-such-voice')).toBeNull();
  });

  it('stays out of the service worker precache by not being a png', () => {
    // vite.config.ts globs `**/*.{js,css,html,svg,png,woff2}` into the
    // precache. Half a megabyte of instrument art has no business there.
    const pngs = readdirSync(DIR).filter((f) => f.endsWith('.png'));
    expect(pngs).toEqual([]);
  });
});
