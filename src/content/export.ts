import { ALL_PARTS, COMP_PATTERNS, compEvents } from '../audio/comp';
import { SCALES, chordNotes, degreeToNote, voiceLead } from '../audio/music';
import { BED_VOICES, DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../audio/voices';
import { soundsWithVoice, writtenNoteEvent } from '../audio/written';
import { harmonyProblems, validate, type ChartChord, type Tune } from '../modes/playtune/chart';
import { chordProblems } from '../modes/playtune/chords';
import { ALL_TUNES } from '../modes/playtune/library';
import { CHORD_CURVE } from '../modes/playtune/library/chordcurve';
import { ROLES, type TuneRole } from '../modes/playtune/role';
import {
  ROLE_ORDER, array, identifier, number, requireValue, validateCatalog, validateCourse, validatePlayerNotes,
  type BackingEventV1, type CatalogV1, type CourseEntryV1, type Provenance,
} from './schema';

function validateChords(chords: readonly ChartChord[], path: string): void {
  let previous = -1;
  array(chords, path, 0, 20_000);
  chords.forEach((chord, i) => {
    const at = `${path}[${i}]`;
    requireValue(chord && typeof chord === 'object', at, 'expected a chord');
    number(chord.beat, `${at}.beat`, 0, 65_536);
    requireValue(chord.beat >= previous, `${at}.beat`, 'must be in nondecreasing order');
    previous = chord.beat;
    // Check before compEvents/chordChart: an infinite length would never finish.
    number(chord.len, `${at}.len`, 0.001, 1_024);
    number(chord.degree, `${at}.degree`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true);
    try { chordNotes(60, chord.quality); }
    catch { throw new Error(`${at}.quality: unknown chord quality "${chord.quality}"`); }
  });
}

function header(tune: Tune, role: TuneRole): Omit<CourseEntryV1, 'playerNotes' | 'backingEvents'> {
  const card = role.card(tune);
  const voices = role.voices(tune);
  return {
    id: tune.id, role: role.id, title: tune.title, composer: tune.composer,
    bpm: tune.bpm, beatsPerBar: tune.beatsPerBar, pickup: tune.pickup ?? 0,
    root: tune.root, scaleId: tune.scaleId,
    difficulty: card.difficulty, teaches: card.teaches, pass: card.pass,
    voices: { keyVoicing: voices.keyVoicing, keys: voices.keys, backing: voices.backing },
  };
}

function validateTune(tune: Tune, path: string): void {
  if (tune.pickup !== undefined) number(tune.pickup, `${path}.pickup`, 0, 16);
  number(tune.difficulty, `${path}.difficulty`, 1, 5, true);
  validateCourse({
    id: tune.id, role: 'melody', title: tune.title, composer: tune.composer,
    bpm: tune.bpm, beatsPerBar: tune.beatsPerBar, pickup: tune.pickup ?? 0,
    root: tune.root, scaleId: tune.scaleId,
    difficulty: tune.difficulty, teaches: tune.teaches, pass: tune.pass,
    voices: {
      keyVoicing: 'lead', keys: tune.voiceId ?? DEFAULT_LEAD_VOICE,
      backing: tune.bedVoiceId ?? DEFAULT_BED_VOICE,
    },
    playerNotes: tune.melody, backingEvents: [],
  }, path);
  validateChords(tune.chords, `${path}.chords`);
  if (tune.borrows !== undefined) {
    array(tune.borrows, `${path}.borrows`, 0, 12)
      .forEach((pitch, i) => number(pitch, `${path}.borrows[${i}]`, 0, 11, true));
  }
  const problems = [...validate(tune), ...harmonyProblems(tune)];
  requireValue(problems.length === 0, path, problems.join('; '));
}

/** Pure compiler. Source role libraries are the only membership/progression list. */
export function compileCatalog(
  provenance: Provenance = { sourceCommit: null, sourceDirty: null },
  roles: readonly TuneRole[] = ROLE_ORDER.map((id) => ROLES[id]),
): CatalogV1 {
  const seenRoles = new Set<string>();
  for (const role of roles) {
    requireValue(ROLE_ORDER.some((id) => id === role.id), `role:${role.id}`, 'unknown role');
    requireValue(!seenRoles.has(role.id), `role:${role.id}`, 'duplicate role');
    seenRoles.add(role.id);
  }
  requireValue(seenRoles.size === ROLE_ORDER.length, 'roles', 'expected melody and chords');
  const entries: CourseEntryV1[] = [];
  for (const id of ROLE_ORDER) {
    const role = roles.find((candidate) => candidate.id === id)!;
    array(role.tunes, `${id}.tunes`, 0, 512);
    array(role.order, `${id}.order`, 0, 512);
    const byId = new Map<string, Tune>();
    for (const tune of role.tunes) {
      identifier(tune.id, `${id}:${tune.id}.id`);
      requireValue(!byId.has(tune.id), `${id}:${tune.id}.id`, 'duplicate tune ID');
      byId.set(tune.id, tune);
    }
    requireValue(role.order.length === byId.size, `${id}.order`, 'order and tunes membership must agree');
    const seen = new Set<string>();
    for (const tuneId of role.order) {
      const path = `${id}:${tuneId}`;
      identifier(tuneId, `${path}.order`);
      requireValue(!seen.has(tuneId), `${path}.order`, 'duplicate progression ID');
      seen.add(tuneId);
      const tune = byId.get(tuneId);
      requireValue(tune, `${path}.order`, 'progression ID is missing from tunes');
      validateTune(tune, path);
      const entry: CourseEntryV1 = { ...header(tune, role), playerNotes: role.chart(tune), backingEvents: [] };
      number(entry.difficulty, `${path}.difficulty`, 1, 5, true);
      validateCourse(entry, path);
      // Own the wire arrays. Never sort/mutate the authored charts.
      entry.playerNotes = entry.playerNotes.map(({ beat, len, note }) => ({ beat, len, note }));
      const backing = role.backing(tune);
      validateChords(backing.chords, `${path}.backing.chords`);
      requireValue(COMP_PATTERNS.includes(backing.pattern), `${path}.backing.pattern`, 'unknown accompaniment');
      array(backing.parts, `${path}.backing.parts`, 0, ALL_PARTS.length);
      requireValue(backing.parts.every((part) => ALL_PARTS.includes(part)), `${path}.backing.parts`, 'unknown part');
      const voice = BED_VOICES.find((candidate) => candidate.id === entry.voices.backing)!;
      let previousVoicing: number[] = [];
      const events: BackingEventV1[] = [];
      for (const chord of backing.chords) {
        const root = degreeToNote(chord.degree, tune.root, SCALES[tune.scaleId]) - 12;
        const voiced = voiceLead(previousVoicing, chordNotes(root, chord.quality));
        previousVoicing = voiced;
        for (const event of compEvents(backing.pattern, voiced, root, chord.len,
          tune.beatsPerBar, chord.beat - (tune.pickup ?? 0))) {
          if (!backing.parts.includes(event.part) || !soundsWithVoice(event, voice.spec)) continue;
          requireValue(events.length < 20_000, `${path}.backingEvents`, 'expected at most 20000 events');
          events.push({
            beat: chord.beat + event.offset, len: event.len, notes: [...event.notes],
            gain: event.gain, attack: event.attack, part: event.part, offset: event.offset,
          });
        }
      }
      if (backing.notes !== null) {
        array(backing.notes, `${path}.backing.notes`, 0, 20_000);
        if (backing.notes.length) validatePlayerNotes(backing.notes, `${path}.backing.notes`);
        for (const note of backing.notes) {
          const event = writtenNoteEvent(note);
          events.push({
            beat: note.beat, len: event.len, notes: event.notes,
            gain: event.gain, attack: event.attack, part: 'melody',
          });
        }
      }
      // ECMAScript stable sort retains generation order at equal onsets, including tails.
      entry.backingEvents = events.sort((a, b) => a.beat - b.beat);
      entries.push(entry);
    }
  }
  const catalog: CatalogV1 = {
    schemaVersion: 1, sourceCommit: provenance.sourceCommit, sourceDirty: provenance.sourceDirty, entries,
  };
  validateCatalog(catalog);
  return catalog;
}

/** Validate every authored tune and chord-curve entry, including non-Melody studies. */
export function compilePublishedCatalog(provenance: Provenance): CatalogV1 {
  for (const tune of ALL_TUNES) validateTune(tune, `source:${tune.id}`);
  for (const entry of CHORD_CURVE) {
    const path = `chords:${entry.tune.id}`;
    validateTune(entry.tune, path);
    number(entry.role.difficulty, `${path}.difficulty`, 1, 5, true);
    if (entry.role.register !== undefined) number(entry.role.register, `${path}.register`, 0, 127, true);
    if (entry.role.voicing !== undefined) {
      requireValue(entry.role.voicing === 'full' || entry.role.voicing === 'shell', `${path}.voicing`, 'unknown voicing');
    }
    const problems = chordProblems(entry.tune, entry.role);
    requireValue(problems.length === 0, path, problems.join('; '));
  }
  return compileCatalog(provenance);
}
