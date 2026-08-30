import type { CompPart, CompPattern } from '../../audio/comp';
import type { KeyVoicing } from '../../audio/engine';
import { DEFAULT_BED_VOICE, DEFAULT_LEAD_VOICE } from '../../audio/voices';
import type { ChartChord, ChartNote, Tune } from './chart';
import { chordChart } from './chords';
import { CHORD_CURVE, CHORD_ORDER, CHORD_TUNES, findChordEntry } from './library/chordcurve';
import { LIBRARY, TUNE_ORDER } from './library';
import { CHORD_STORE, MELODY_STORE } from './progress';

export type RoleId = 'melody' | 'chords';

/** What the game plays while the player plays their own part. */
export interface Backing {
  chords: readonly ChartChord[];
  pattern: CompPattern;
  /** Which parts of the accompaniment the bed sounds. The player owns the rest. */
  parts: readonly CompPart[];
  /** The tune itself, when the player is not the one playing it. */
  notes: readonly ChartNote[] | null;
}

/** What the song card says about a tune, which depends on which part you play. */
export interface RoleCard {
  difficulty: 1 | 2 | 3 | 4 | 5;
  teaches: string;
  pass: number;
}

/**
 * One half of PlayTune.
 *
 * The two roles are the same game seen from either side of the arrangement: in
 * one the player has the tune and the game has the harmony, in the other they
 * swap. Everything that makes the mode work — the transport, the judge, the
 * auras, the HUD, the scoring — is indifferent to which, so this interface is
 * the whole of the difference between them.
 */
export interface TuneRole {
  readonly id: RoleId;
  /** Namespaced under `pianoball.`. Each role earns its own unlocks. */
  readonly storageKey: string;
  /** The toggle button on the song list. */
  readonly label: string;
  readonly title: string;
  readonly lede: string;
  /** The curve, in unlock order. */
  readonly tunes: readonly Tune[];
  readonly order: readonly string[];
  /** What the player is asked to play, before `fitToRange` moves it. */
  chart(tune: Tune): ChartNote[];
  backing(tune: Tune): Backing;
  card(tune: Tune): RoleCard;
  /**
   * What the player's keys sound like, and what the game's part sounds like.
   *
   * An explicit trio rather than a swap of the tune's own two, because
   * `voiceId` and `bedVoiceId` index different banks — `bed-harp` is not a lead
   * and `choir` is not a bed — and because the chord role does not merely
   * exchange the two instruments. It changes what a key *is*: the player is
   * holding the backing layer, so the keys are voiced from the bed bank and
   * swell and sustain the way the bed does everywhere else in the app.
   */
  voices(tune: Tune): { keyVoicing: KeyVoicing; keys: string; backing: string };
}

/** Learning a melody. The game plays the harmony underneath. */
export const MELODY_ROLE: TuneRole = {
  id: 'melody',
  storageKey: MELODY_STORE,
  label: 'Melody',
  title: 'PlayTune',
  lede: 'The game plays the chords. You play the tune on top — press each key as its aura reaches it.',
  tunes: LIBRARY,
  order: TUNE_ORDER,
  chart: (tune) => tune.melody,
  backing: (tune) => ({
    chords: tune.chords,
    pattern: tune.accompaniment,
    parts: ['chord', 'bass', 'wash'],
    notes: null,
  }),
  card: (tune) => ({ difficulty: tune.difficulty, teaches: tune.teaches, pass: tune.pass }),
  voices: (tune) => ({
    keyVoicing: 'lead',
    keys: tune.voiceId ?? DEFAULT_LEAD_VOICE,
    backing: tune.bedVoiceId ?? DEFAULT_BED_VOICE,
  }),
};

/**
 * The voice the game plays a tune in when the player has the chords.
 *
 * A bed voice, because the scheduler goes through `AudioEngine.pad`, and the
 * default is not the tune's own `bedVoiceId`: those were chosen to sit *under*
 * a melody — strings, choir, warm — and have almost no attack, which makes a
 * poor tune. A felt piano has one.
 *
 * Both parts of this role are bed voices, so the pairing is what keeps them
 * apart: the player takes a pad and the game takes something plucked or
 * struck. Two pads would be one indistinguishable wash.
 */
const DEFAULT_MELODY_VOICE = 'bed-felt-piano';

/** What a player holding the chords sounds like: the bed the app already has. */
const DEFAULT_KEYS_VOICE = DEFAULT_BED_VOICE;

/**
 * Playing the chords. The game plays the tune over them.
 *
 * The bed keeps the bass and drops everything else. Keeping the wash would mean
 * the harmony still sounds right when the player has played nothing, which is
 * the one thing this role cannot afford; dropping the bass would push a chart
 * like Canon in D past thirty semitones and put every small controller out of
 * the mode. What is left is the honest division of the two hands.
 */
export const CHORDS_ROLE: TuneRole = {
  id: 'chords',
  storageKey: CHORD_STORE,
  label: 'Chords',
  title: 'PlayChords',
  lede: 'The game plays the tune. You play the chords under it — press the whole chord as its auras land.',
  tunes: CHORD_TUNES,
  order: CHORD_ORDER,
  chart: (tune) => {
    const entry = findChordEntry(tune.id);
    return entry ? chordChart(tune, entry.role) : [];
  },
  backing: (tune) => {
    const entry = findChordEntry(tune.id);
    return {
      chords: tune.chords,
      pattern: entry?.role.pattern ?? tune.accompaniment,
      parts: ['bass'],
      notes: tune.melody,
    };
  },
  card: (tune) => {
    const role = findChordEntry(tune.id)?.role;
    return role
      ? { difficulty: role.difficulty, teaches: role.teaches, pass: role.pass }
      : { difficulty: tune.difficulty, teaches: tune.teaches, pass: tune.pass };
  },
  voices: (tune) => {
    const role = findChordEntry(tune.id)?.role;
    return {
      keyVoicing: 'bed',
      keys: role?.keysVoiceId ?? DEFAULT_KEYS_VOICE,
      backing: role?.melodyVoiceId ?? DEFAULT_MELODY_VOICE,
    };
  },
};

export const ROLES: Record<RoleId, TuneRole> = {
  melody: MELODY_ROLE,
  chords: CHORDS_ROLE,
};

/** Every chord-curve entry, for the tests and nothing else. */
export { CHORD_CURVE };
