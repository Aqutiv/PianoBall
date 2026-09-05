import { describe, expect, it, vi } from 'vitest';
import { ChordBed } from '../src/audio/bed';
import { SCALES } from '../src/audio/music';
import { NOTE_ATTACK, NOTE_GAIN, writtenNoteEvent } from '../src/audio/written';
import { compileCatalog, compilePublishedCatalog } from '../src/content/export';
import { validateCatalog, validateManifest, type CatalogV1, type CourseEntryV1 } from '../src/content/schema';
import { ALL_TUNES } from '../src/modes/playtune/library';
import { ROLES, type TuneRole } from '../src/modes/playtune/role';

const provenance = { sourceCommit: null, sourceDirty: null };
const published = compilePublishedCatalog(provenance);
const minimal = (): CatalogV1 => ({
  ...provenance, schemaVersion: 1,
  entries: [{
    ...structuredClone(published.entries[0]), playerNotes: [{ beat: 0, len: 4, note: 60 }],
    backingEvents: [{ beat: 0, len: 4.2, notes: [48, 52, 55], gain: 0.055, attack: 0.02, part: 'chord' }],
  }],
});

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

describe('shared catalogue source membership', () => {
  it('exports exactly the role libraries in their progression order', () => {
    expect(published.entries.map((entry) => `${entry.role}:${entry.id}`)).toEqual(
      ['melody', 'chords'].flatMap((id) => ROLES[id as keyof typeof ROLES].order.map((tune) => `${id}:${tune}`)),
    );
    for (const role of Object.values(ROLES)) {
      for (const tune of role.tunes) {
        const entry = published.entries.find((e) => e.role === role.id && e.id === tune.id)!;
        expect(entry.playerNotes, `${role.id}:${tune.id}`).toEqual(role.chart(tune));
        expect(entry).toMatchObject({ ...role.card(tune), voices: role.voices(tune), root: tune.root, pickup: tune.pickup ?? 0 });
      }
    }
  });

  it('preserves pickups, sustained notes, simultaneous player chords and chord-only studies', () => {
    expect(published.entries.some((e) => e.pickup > 0 && e.playerNotes[0].beat === 0)).toBe(true);
    expect(published.entries.some((e) => e.playerNotes.some((n) => n.len >= 4))).toBe(true);
    expect(published.entries.some((e) => e.role === 'chords' &&
      e.playerNotes.some((n, i, notes) => i > 0 && n.beat === notes[i - 1].beat))).toBe(true);
    const melodyIds = new Set(ROLES.melody.order);
    const studies = ROLES.chords.order.filter((id) => !melodyIds.has(id));
    expect(studies.length).toBeGreaterThan(0);
    for (const id of studies) expect(published.entries.filter((e) => e.id === id).map((e) => e.role)).toEqual(['chords']);
  });

  it('discovers an added source-role course, follows order rather than array/alphabetic sorting, and owns its arrays', () => {
    const tune = freeze({ ...structuredClone(ROLES.melody.tunes[0]), id: 'zzz-fixture' });
    const role: TuneRole = {
      ...ROLES.melody, tunes: [...ROLES.melody.tunes, tune], order: [tune.id, ...ROLES.melody.order],
    };
    const inputBefore = JSON.stringify(ALL_TUNES);
    const result = compileCatalog(provenance, [ROLES.chords, role]);
    expect(result.entries[0].id).toBe(tune.id);
    expect(result.entries).toHaveLength(published.entries.length + 1);
    result.entries[0].playerNotes[0].note++;
    expect(tune.melody[0].note).not.toBe(result.entries[0].playerNotes[0].note);
    expect(JSON.stringify(ALL_TUNES)).toBe(inputBefore);
  });

  it('allows the same ID in different roles and rejects duplicated/missing progression membership', () => {
    expect(() => validateCatalog(published)).not.toThrow();
    const first = ROLES.melody.tunes[0];
    const badRoles: TuneRole[] = [
      { ...ROLES.melody, tunes: [...ROLES.melody.tunes, first] },
      { ...ROLES.melody, order: [...ROLES.melody.order, first.id] },
      { ...ROLES.melody, order: ROLES.melody.order.map((id, i) => i === 1 ? first.id : id) },
      { ...ROLES.melody, order: ROLES.melody.order.map((id, i) => i === 1 ? 'missing-id' : id) },
    ];
    for (const role of badRoles) expect(() => compileCatalog(provenance, [role, ROLES.chords])).toThrow(/melody.*(duplicate|agree|missing)/);
    expect(() => compileCatalog(provenance, [{ ...ROLES.melody, id: 'other' } as never, ROLES.chords])).toThrow(/unknown role/);
  });

  it.each([
    ['bpm', NaN], ['bpm', '96'], ['pickup', null], ['root', 128], ['difficulty', 6],
    ['scaleId', 'major'], ['voiceId', 'no-voice'], ['bedVoiceId', 'no-bed'],
  ])('rejects invalid source %s before compiling', (field, value) => {
    const tune = { ...structuredClone(ROLES.melody.tunes[0]), [field]: value };
    const role = { ...ROLES.melody, tunes: [tune], order: [tune.id] } as TuneRole;
    expect(() => compileCatalog(provenance, [role, ROLES.chords])).toThrow(/melody:first-light/);
  });

  it('rejects infinite chord lengths before entering a pattern generation loop', () => {
    const tune = structuredClone(ROLES.melody.tunes[0]);
    tune.chords[0].len = Infinity;
    expect(() => compileCatalog(provenance, [
      { ...ROLES.melody, tunes: [tune], order: [tune.id] }, ROLES.chords,
    ])).toThrow(/melody:first-light.chords\[0\].len.*finite/);
  });
});

/** Drive the real browser scheduler with a fake audio clock, recording what reaches pad. */
function scheduled(role: TuneRole, tune: TuneRole['tunes'][number], bedVoice = role.voices(tune).backing) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const pad = vi.fn();
  const engine = { running: true, get now() { return Date.now() / 1000; }, bedVoice, pad, setBedAudible: vi.fn() };
  const bed = new ChordBed(engine as never, { bpm: tune.bpm, bus: { on: vi.fn() } } as never);
  const beatSeconds = 0.5;
  const clock = { running: true, beatSeconds, beatsPerBar: tune.beatsPerBar, timeOf: (beat: number) => 1 + beat * beatSeconds };
  const backing = role.backing(tune);
  bed.setTrack(backing.chords, clock, tune.root, SCALES[tune.scaleId], backing.pattern, tune.pickup ?? 0, backing.parts);
  bed.setNoteTrack(backing.notes, clock);
  try {
    bed.start();
    const last = Math.max(0, ...backing.chords.map((c) => c.beat + c.len), ...(backing.notes ?? []).map((n) => n.beat + n.len));
    vi.advanceTimersByTime(1_300 + last * beatSeconds * 1_000);
    return pad.mock.calls.map(([notes, len, gain, at, attack]) => ({
      notes, len: len / beatSeconds, gain, beat: (at - 1) / beatSeconds, attack: attack / beatSeconds,
    }));
  } finally {
    bed.stop();
    vi.useRealTimers();
  }
}

const comparable = (events: { beat: number; len: number; notes: number[]; gain: number; attack: number }[]) =>
  events.map(({ beat, len, notes, gain, attack }) => JSON.stringify({
    beat: +beat.toFixed(8), len: +len.toFixed(8), notes, gain, attack: +attack.toFixed(8),
  })).sort();

describe('deterministic written backing parity', () => {
  it.each(published.entries.map((entry) => [entry.role, entry.id] as const))(
    'matches every event reaching the browser scheduler for %s:%s', (roleId, id) => {
      const role = ROLES[roleId], tune = role.tunes.find((t) => t.id === id)!;
      const exported = published.entries.find((e) => e.role === roleId && e.id === id)!;
      expect(comparable(exported.backingEvents)).toEqual(comparable(scheduled(role, tune)));
    },
  );

  it('uses the browser note helper, semantic melody part, and keeps the bass-plus-melody split', () => {
    const entry = published.entries.find((e) => e.role === 'chords')!;
    expect(new Set(entry.backingEvents.map((e) => e.part))).toEqual(new Set(['bass', 'melody']));
    const tune = ROLES.chords.tunes.find((t) => t.id === entry.id)!;
    expect(entry.backingEvents.filter((e) => e.part === 'melody')).toEqual(tune.melody.map((note) => {
      const { offset: _offset, ...event } = writtenNoteEvent(note);
      return { ...event, beat: note.beat, part: 'melody' };
    }));
    expect(NOTE_GAIN).toBe(0.05);
    expect(NOTE_ATTACK).toBe(0.02);
  });

  it('preserves same-beat generation order and pad tails past the next chord', () => {
    const entry = published.entries.find((e) => e.role === 'melody' && e.id === 'first-light')!;
    expect(entry.backingEvents.filter((e) => e.beat === 0).map((e) => e.part)).toEqual(['wash', 'wash', 'bass', 'chord']);
    expect(entry.backingEvents[0].len).toBe(4.2);
    expect(entry.backingEvents[0].beat + entry.backingEvents[0].len).toBeGreaterThan(ROLES.melody.tunes.find((t) => t.id === entry.id)!.chords[1].beat);
  });

  it('removes wash for plucked voices, retaining it for pads without altering other events', () => {
    const tune = { ...structuredClone(ROLES.melody.tunes[0]), accompaniment: 'pulse' as const, bedVoiceId: 'bed-harp' };
    const role = { ...ROLES.melody, tunes: [tune], order: [tune.id] };
    const plucked = compileCatalog(provenance, [role, ROLES.chords]).entries[0];
    expect(plucked.backingEvents.some((e) => e.part === 'wash')).toBe(false);
    expect(comparable(plucked.backingEvents)).toEqual(comparable(scheduled(role, tune)));
    const warm = { ...tune, bedVoiceId: 'warm' };
    const warmRole = { ...role, tunes: [warm] };
    const pad = compileCatalog(provenance, [warmRole, ROLES.chords]).entries[0];
    expect(pad.backingEvents.some((e) => e.part === 'wash')).toBe(true);
    expect(pad.backingEvents.filter((e) => e.part !== 'wash')).toEqual(plucked.backingEvents);
  });

  it('never consults random performance state', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('unexpected humanization'); });
    try { expect(compilePublishedCatalog(provenance)).toEqual(published); }
    finally { random.mockRestore(); }
  });
});

describe('native wire acceptance limits', () => {
  const changes: [string, (entry: CourseEntryV1) => void][] = [
    ['bpm', (e) => { e.bpm = NaN; }], ['bpm', (e) => { e.bpm = Infinity; }],
    ['bpm', (e) => { e.bpm = '96' as never; }], ['bpm', (e) => { e.bpm = 19; }],
    ['bpm', (e) => { e.bpm = 401; }], ['beatsPerBar', (e) => { e.beatsPerBar = 17; }],
    ['pickup', (e) => { e.pickup = e.beatsPerBar; }], ['pickup', (e) => { e.pickup = -1; }],
    ['pass', (e) => { e.pass = 70; }], ['pass', (e) => { e.pass = 0; }],
    ['difficulty', (e) => { e.difficulty = 1.5; }], ['difficulty', (e) => { e.difficulty = 11; }],
    ['id', (e) => { e.id = '../escape'; }], ['id', (e) => { e.id = 'a'.repeat(101); }],
    ['id', (e) => { e.id = ''; }], ['role', (e) => { e.role = 'unknown' as never; }],
    ['title', (e) => { e.title = ''; }], ['title', (e) => { e.title = '🎹'.repeat(129); }],
    ['title', (e) => { e.title = 'a\nb'; }], ['composer', (e) => { e.composer = '\u0000'; }],
    ['composer', (e) => { e.composer = 'a'.repeat(257); }], ['teaches', (e) => { e.teaches = '\t'; }],
    ['teaches', (e) => { e.teaches = 'a'.repeat(1025); }], ['root', (e) => { e.root = 60.5; }],
    ['scaleId', (e) => { e.scaleId = 'toString'; }],
    ['voices.keys', (e) => { e.voices.keys = 'missing'; }],
    ['voices.keys', (e) => { e.voices.keyVoicing = 'bed'; e.voices.keys = 'grand'; }],
    ['voices.keyVoicing', (e) => { e.voices.keyVoicing = 'other' as never; }],
    ['voices.backing', (e) => { e.voices.backing = 'missing'; }],
    ['playerNotes', (e) => { e.playerNotes = []; }],
    ['playerNotes', (e) => { e.playerNotes = Array(20_001).fill(e.playerNotes[0]); }],
    ['playerNotes[0].beat', (e) => { e.playerNotes[0].beat = -1; }],
    ['playerNotes[0].beat', (e) => { e.playerNotes[0].beat = 65_537; }],
    ['playerNotes[0].len', (e) => { e.playerNotes[0].len = 0; }],
    ['playerNotes[0].len', (e) => { e.playerNotes[0].len = 1_025; }],
    ['playerNotes[0].note', (e) => { e.playerNotes[0].note = 128; }],
    ['playerNotes[0].note', (e) => { e.playerNotes[0].note = 60.1; }],
    ['playerNotes[1].beat', (e) => { e.playerNotes = [{ beat: 1, len: 1, note: 60 }, { beat: 0, len: 1, note: 62 }]; }],
    ['backingEvents', (e) => { e.backingEvents = undefined as never; }],
    ['backingEvents', (e) => { e.backingEvents = Array(20_001).fill(e.backingEvents[0]); }],
    ['backingEvents[0].beat', (e) => { e.backingEvents[0].beat = NaN; }],
    ['backingEvents[0].len', (e) => { e.backingEvents[0].len = 0; }],
    ['backingEvents[0].gain', (e) => { e.backingEvents[0].gain = 1.01; }],
    ['backingEvents[0].gain', (e) => { e.backingEvents[0].gain = -0.01; }],
    ['backingEvents[0].notes', (e) => { e.backingEvents[0].notes = []; }],
    ['backingEvents[0].notes', (e) => { e.backingEvents[0].notes = Array(17).fill(60); }],
    ['backingEvents[0].notes[0]', (e) => { e.backingEvents[0].notes = [-1]; }],
    ['backingEvents[0].attack', (e) => { e.backingEvents[0].attack = Infinity; }],
    ['backingEvents[0].offset', (e) => { e.backingEvents[0].offset = -1; }],
    ['backingEvents[0].part', (e) => { e.backingEvents[0].part = 'other' as never; }],
    ['backingEvents[1].beat', (e) => { e.backingEvents = [{ ...e.backingEvents[0], beat: 1 }, e.backingEvents[0]]; }],
  ];
  it.each(changes)('rejects invalid %s with role, ID and field', (field, change) => {
    const catalog = minimal();
    change(catalog.entries[0]);
    expect(() => validateCatalog(catalog)).toThrow(field);
    expect(() => validateCatalog(catalog)).toThrow(/entries\[0\] \(.+:.*\)/);
  });

  it('accepts reader boundary values, fractional meters, equal onsets and empty backing', () => {
    const catalog = minimal(), entry = catalog.entries[0];
    Object.assign(entry, { bpm: 400, beatsPerBar: 1.5, pickup: 0.5, pass: 0.01, difficulty: 10, title: '🎹'.repeat(128), composer: '', teaches: '' });
    entry.playerNotes = [{ beat: 65_536, len: 0.001, note: 0 }, { beat: 65_536, len: 1_024, note: 127 }];
    entry.backingEvents = [];
    expect(() => validateCatalog(catalog)).not.toThrow();
  });

  it('rejects missing consumed fields, duplicate identity, excess entries and expanded notes', () => {
    for (const key of ['id', 'role', 'title', 'composer', 'teaches', 'bpm', 'beatsPerBar', 'pickup', 'pass', 'difficulty', 'playerNotes', 'backingEvents']) {
      const catalog = minimal();
      delete (catalog.entries[0] as unknown as Record<string, unknown>)[key];
      expect(() => validateCatalog(catalog), key).toThrow();
    }
    expect(() => validateCatalog({ ...minimal(), entries: new Array(1) })).toThrow(/missing array element/);
    const sparse = minimal();
    sparse.entries[0].playerNotes = new Array(1);
    expect(() => validateCatalog(sparse)).toThrow(/playerNotes/);
    const duplicate = minimal();
    duplicate.entries.push(structuredClone(duplicate.entries[0]));
    expect(() => validateCatalog(duplicate)).toThrow(/duplicate role\/id/);
    expect(() => validateCatalog({ ...minimal(), entries: [] })).toThrow(/1–512/);
    expect(() => validateCatalog({ ...minimal(), entries: Array(513).fill(minimal().entries[0]) })).toThrow(/1–512/);
    const expanded = minimal();
    expanded.entries[0].backingEvents = Array.from({ length: 15_625 }, () => ({
      ...expanded.entries[0].backingEvents[0], notes: Array(16).fill(60),
    }));
    expect(() => validateCatalog(expanded)).toThrow(/expanded note count/);
    expanded.entries[0].backingEvents[0].notes.pop();
    expect(() => validateCatalog(expanded)).not.toThrow(); // Exactly 250,000 including the player note.
  });

  it('rejects incompatible schema/provenance and manifest paths/digests', () => {
    for (const schemaVersion of [2, '1', undefined]) expect(() => validateCatalog({ ...minimal(), schemaVersion })).toThrow(/schemaVersion/);
    expect(() => validateCatalog({ ...minimal(), sourceCommit: 'short' })).toThrow(/sourceCommit/);
    expect(() => validateCatalog({ ...minimal(), sourceDirty: 'false' })).toThrow(/sourceDirty/);
    const revision = 'a'.repeat(64), manifest = { schemaVersion: 1, revision, sha256: revision, url: `catalog.${revision}.json` };
    expect(() => validateManifest(manifest)).not.toThrow();
    for (const url of [`https://example.com/${manifest.url}`, `../${manifest.url}`, `${manifest.url}?x=1`]) {
      expect(() => validateManifest({ ...manifest, url })).toThrow(/manifest.url/);
    }
    expect(() => validateManifest({ ...manifest, sha256: 'b'.repeat(64) })).toThrow(/sha256/);
    expect(() => validateManifest({ ...manifest, revision: revision.toUpperCase() })).toThrow(/revision/);
  });
});
