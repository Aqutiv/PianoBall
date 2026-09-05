import { SCALES } from '../audio/music';
import { BED_VOICES, LEAD_VOICES } from '../audio/voices';
import type { RoleId } from '../modes/playtune/role';

export const ROLE_ORDER = ['melody', 'chords'] as const;
export const MAX_MANIFEST_BYTES = 16_384;
export const MAX_CATALOG_BYTES = 8_388_608;
export const MAX_EXPANDED_NOTES = 250_000;

export interface Provenance {
  sourceCommit: string | null;
  sourceDirty: boolean | null;
}
export interface ManifestV1 {
  schemaVersion: 1;
  revision: string;
  url: string;
  sha256: string;
}
export interface PlayerNoteV1 {
  beat: number;
  len: number;
  note: number;
}
export interface BackingEventV1 {
  beat: number;
  len: number;
  notes: number[];
  gain: number;
  /** Beats, as are beat, len and offset. */
  attack: number;
  part: 'chord' | 'bass' | 'wash' | 'melody';
  /** Original chord-relative offset; beat is already absolute. */
  offset?: number;
}
export interface CourseEntryV1 {
  id: string;
  role: RoleId;
  title: string;
  composer: string;
  bpm: number;
  beatsPerBar: number;
  pickup: number;
  root: number;
  scaleId: string;
  difficulty: number;
  teaches: string;
  pass: number;
  voices: { keyVoicing: 'lead' | 'bed'; keys: string; backing: string };
  playerNotes: PlayerNoteV1[];
  backingEvents: BackingEventV1[];
}
export interface CatalogV1 extends Provenance {
  schemaVersion: 1;
  entries: CourseEntryV1[];
}

export function requireValue(ok: unknown, path: string, message: string): asserts ok {
  if (!ok) throw new Error(`${path}: ${message}`);
}
export function record(value: unknown, path: string): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'expected an object');
  return value as Record<string, unknown>;
}
export function array(value: unknown, path: string, min: number, max: number): unknown[] {
  requireValue(Array.isArray(value), path, 'expected an array');
  requireValue(value.length >= min && value.length <= max, path, `expected ${min}–${max} elements`);
  for (let i = 0; i < value.length; i++) {
    requireValue(Object.hasOwn(value, i), `${path}[${i}]`, 'missing array element');
  }
  return value;
}
export function number(value: unknown, path: string, min: number, max: number, integer = false): asserts value is number {
  requireValue(typeof value === 'number' && Number.isFinite(value), path, 'expected a finite number');
  requireValue(value >= min && value <= max && (!integer || Number.isInteger(value)),
    path, `expected ${integer ? 'an integer ' : ''}within [${min}, ${max}]`);
}
export function text(value: unknown, path: string, min: number, max: number): asserts value is string {
  requireValue(typeof value === 'string', path, 'expected a string');
  requireValue(value.length >= min && value.length <= max, path, `expected ${min}–${max} UTF-16 code units`);
  requireValue(!/[\u0000-\u001f]/.test(value), path, 'control characters below U+0020 are forbidden');
}
export function identifier(value: unknown, path: string): asserts value is string {
  text(value, path, 1, 100);
  requireValue(/^[A-Za-z0-9_-]+$/.test(value), path, 'expected only ASCII letters, digits, _ or -');
}

export function validatePlayerNotes(value: unknown, path: string): void {
  let previous = -1;
  array(value, path, 1, 20_000).forEach((raw, index) => {
    const at = `${path}[${index}]`, note = record(raw, at);
    number(note.beat, `${at}.beat`, 0, 65_536);
    requireValue(note.beat >= previous, `${at}.beat`, 'must be in nondecreasing order');
    previous = note.beat;
    number(note.len, `${at}.len`, 0.001, 1_024);
    number(note.note, `${at}.note`, 0, 127, true);
  });
}

/** Validate before serialization: JSON would silently turn NaN/Infinity into null. */
export function validateCourse(value: unknown, path: string): asserts value is CourseEntryV1 {
  const entry = record(value, path);
  identifier(entry.id, `${path}.id`);
  requireValue(ROLE_ORDER.some((role) => role === entry.role), `${path}.role`, 'expected melody or chords');
  text(entry.title, `${path}.title`, 1, 256);
  text(entry.composer, `${path}.composer`, 0, 256);
  text(entry.teaches, `${path}.teaches`, 0, 1_024);
  number(entry.bpm, `${path}.bpm`, 20, 400);
  number(entry.beatsPerBar, `${path}.beatsPerBar`, 1, 16);
  number(entry.pickup, `${path}.pickup`, 0, 16);
  requireValue(entry.pickup < entry.beatsPerBar, `${path}.pickup`, 'must be less than beatsPerBar');
  number(entry.pass, `${path}.pass`, 0.01, 1);
  number(entry.difficulty, `${path}.difficulty`, 1, 10, true);
  number(entry.root, `${path}.root`, 0, 127, true);
  requireValue(typeof entry.scaleId === 'string' && Object.hasOwn(SCALES, entry.scaleId),
    `${path}.scaleId`, 'unknown source scale ID');
  const voices = record(entry.voices, `${path}.voices`);
  requireValue(voices.keyVoicing === 'lead' || voices.keyVoicing === 'bed',
    `${path}.voices.keyVoicing`, 'expected lead or bed');
  const bank = voices.keyVoicing === 'lead' ? LEAD_VOICES : BED_VOICES;
  requireValue(bank.some((voice) => voice.id === voices.keys), `${path}.voices.keys`, 'unknown voice ID in selected bank');
  requireValue(BED_VOICES.some((voice) => voice.id === voices.backing), `${path}.voices.backing`, 'unknown bed voice ID');
  validatePlayerNotes(entry.playerNotes, `${path}.playerNotes`);
  let previous = -1;
  array(entry.backingEvents, `${path}.backingEvents`, 0, 20_000).forEach((raw, index) => {
    const at = `${path}.backingEvents[${index}]`, event = record(raw, at);
    number(event.beat, `${at}.beat`, 0, 65_536);
    requireValue(event.beat >= previous, `${at}.beat`, 'must be in nondecreasing order');
    previous = event.beat;
    number(event.len, `${at}.len`, 0.001, 1_024);
    number(event.gain, `${at}.gain`, 0, 1);
    number(event.attack, `${at}.attack`, 0, Number.MAX_VALUE);
    if (Object.hasOwn(event, 'offset')) number(event.offset, `${at}.offset`, 0, Number.MAX_VALUE);
    requireValue(['chord', 'bass', 'wash', 'melody'].includes(event.part as string), `${at}.part`, 'unknown backing part');
    array(event.notes, `${at}.notes`, 1, 16).forEach((pitch, i) => number(pitch, `${at}.notes[${i}]`, 0, 127, true));
  });
}

export function validateCatalog(value: unknown): asserts value is CatalogV1 {
  const catalog = record(value, 'catalog');
  requireValue(catalog.schemaVersion === 1, 'catalog.schemaVersion', 'expected 1');
  requireValue(catalog.sourceCommit === null ||
    (typeof catalog.sourceCommit === 'string' && /^[a-f0-9]{40}$/.test(catalog.sourceCommit)),
  'catalog.sourceCommit', 'expected a full Git SHA or null');
  requireValue(catalog.sourceDirty === null || typeof catalog.sourceDirty === 'boolean',
    'catalog.sourceDirty', 'expected a boolean or null');
  const identities = new Set<string>();
  let expanded = 0, previousRole = 0;
  array(catalog.entries, 'catalog.entries', 1, 512).forEach((raw, i) => {
    const entry = record(raw, `catalog.entries[${i}]`);
    const path = `entries[${i}] (${entry.role}:${entry.id})`;
    validateCourse(entry, path);
    const identity = `${entry.role}:${entry.id}`;
    requireValue(!identities.has(identity), `${path}.id`, 'duplicate role/id');
    identities.add(identity);
    const roleIndex = ROLE_ORDER.indexOf(entry.role);
    requireValue(roleIndex >= previousRole, `${path}.role`, 'publish melody before chords');
    previousRole = roleIndex;
    expanded += entry.playerNotes.length + entry.backingEvents.reduce((sum, event) => sum + event.notes.length, 0);
    requireValue(expanded <= MAX_EXPANDED_NOTES, path, `expanded note count exceeds ${MAX_EXPANDED_NOTES}`);
  });
}

export function validateManifest(value: unknown): asserts value is ManifestV1 {
  const manifest = record(value, 'manifest');
  requireValue(manifest.schemaVersion === 1, 'manifest.schemaVersion', 'expected 1');
  requireValue(typeof manifest.revision === 'string' && /^[a-f0-9]{64}$/.test(manifest.revision),
    'manifest.revision', 'expected 64 lowercase SHA256 hex characters');
  requireValue(manifest.sha256 === manifest.revision, 'manifest.sha256', 'must equal revision');
  requireValue(manifest.url === `catalog.${manifest.revision}.json`, 'manifest.url', 'must be the digest-named filename only');
}
