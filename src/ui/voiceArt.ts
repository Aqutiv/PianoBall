/**
 * Where a voice's preview picture lives.
 *
 * The pictures come in two languages, because the bank does. Something you
 * could photograph is photographed — a Rhodes, a marimba, a ribbon microphone.
 * A voice with no object behind it is drawn as its own waveform, built as a
 * sculpture in steel and glass under the same light and on the same base, so a
 * saw still reads differently from a sine at the size these are shown.
 *
 * Files are 400px JPEGs in `public/instruments`. JPEG rather than PNG on
 * purpose: the workbox config precaches `**\/*.png` from the build, and half a
 * megabyte of instrument art has no business in a player's service worker
 * cache when the picker may never be opened.
 */

/** Bed voices that reuse a lead voice's picture under a different id. */
const ALIASES: Record<string, string> = {
  // The bed's "Organ" is the same instrument as the lead bank's "Drawbar";
  // only the name differs, and drawing a second console would be a lie.
  'bed-organ': 'drawbar',
};

/**
 * The art id for a voice id.
 *
 * Most bed voices are a lead voice with `bed-` on the front — `bed-harp` is
 * the harp — so stripping the prefix resolves all but the aliases above.
 */
export function artId(voiceId: string): string {
  return ALIASES[voiceId] ?? voiceId.replace(/^bed-/, '');
}

/** Every art id that ships, so a test can hold the bank and the folder together. */
export const ART_IDS: readonly string[] = [
  'signature', 'grand', 'electric-piano', 'wurlitzer', 'clavinet', 'felt-piano', 'toy-piano',
  'drawbar', 'rock-organ', 'pipe-organ', 'reed-organ',
  'choir', 'vox-pad', 'breath-flute', 'glass', 'solo-string',
  'music-box', 'marimba', 'vibraphone', 'glockenspiel', 'tubular-bell', 'harp',
  'saw-lead', 'square-lead', 'supersaw', 'bright-poly', 'sub-bass',
  'warm', 'strings', 'glass-pad', 'analog-brass', 'nylon-guitar',
  'square-pad', 'saw-swell', 'sine-bed',
];

const HAVE = new Set(ART_IDS);

/**
 * The URL for a voice's picture, or null if it has none.
 *
 * Relative, like every other asset the app loads, because the build is
 * deployed under a path rather than at a domain root.
 */
export function artUrl(voiceId: string): string | null {
  const id = artId(voiceId);
  return HAVE.has(id) ? `./instruments/${id}.jpg` : null;
}
