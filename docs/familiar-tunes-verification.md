# Familiar-tune verification

6 September 2026; Windows, Node 24.18.0.

## Automated checks

- `npm test`: 43 files, 844 tests passed.
- `npm run build`: TypeScript, Vite and PWA build passed.
- `npm run export:content`: schema v1, 19 Melody + 22 Chords = 41 entries.
- Independent SHA256 check matched the manifest. Local catalogue approximately
  1.09 MB, 8,706 expanded notes; limits remain 8,388,608 bytes and 250,000 notes.
- Existing chart, harmony, chord, scoring and exporter validators are unchanged.
- New regressions cover exact membership/order/lookup, independent role teaching
  and pass marks, continuous harmony, complete bars, repeats, tonic-harmony
  endings, the Entertainer pickup and cross-bar tie, and octave fitting.
- Save tests cover fresh completion, partial/completed existing saves, every
  historical successor boundary, the last legacy grade, explicit false flags,
  failed replays, round trips and independent role stores. Old scores, plays,
  earned passes, unlocks and reset epochs are retained.
- Stale-writer tests verify one-time copying into `playtune.v2` and
  `playchords.v2` using the unchanged Progress JSON format. Original stores
  remain untouched. Old-version writes, resets (with or without epochs), and
  post-reset runs remain in their own course generation, while new-course
  scores and resets remain independent. Current-version tabs still share
  scores and resets through the existing merge rules.
- Even an empty first migration is persisted, and an existing corrupt v2
  store never causes old scores to be re-imported after a reset.

## Chart measurements

Counts use the existing default four-beat approach window. Chord auras count
individual notes, while chord onsets count simultaneous groups as one decision.

| Tune | Melody minimum gap | Melody maximum onsets | Chord minimum gap | Chord maximum onsets / auras | Chord span |
|---|---|---|---|---|---|
| Frère Jacques | 375 ms | 6 | 1,500 ms | 2 / 6 | 12 semitones |
| Drunken Sailor | 278 ms | 6 | 1,111 ms | 2 / 6 | 9 semitones |
| Can-Can | 536 ms | 4 | 536 ms | 4 / 12 | 17 semitones |
| The Blue Danube | 500 ms | 4 | 500 ms | 3 / 12 | 17 semitones |
| The Entertainer | 250 ms | 7 | 500 ms | 3 / 10 | 17 semitones |

All exceed the 220 ms minimum gap and stay within eight melody onsets,
eight chord onsets, sixteen chord auras and a two-octave chord span.
Arrangements last 48, 71.11, 68.57, 48 and 64.5 seconds. March/pulse/waltz
player notes release 0.1 chart beat before the next onset by existing design;
the written backing continues through the cadence.

Tested octave ranges: C3-based 25 and 32 keys, C2-based 49 and 61 keys,
E1-based 76 keys and A0-based 88 keys. All ten parts fit the tested 32-key and
larger ranges. The Blue Danube chord part cannot fit C3–C5 using whole-octave
shifts, despite its 17-semitone span; it fits A2–A4. The test asserts the
existing `null` result for the former, allowing the card's usual fit warning.

## Browser results and procedure

All ten real-time runs reached the finished state with zero missed or wrong
notes and no browser error events. Accuracy ranged from 97.86% to 100%; graded
holds reached 100%. The few lower onset grades reflect browser event scheduling.
Two-second samples in every part had nonzero output (RMS 0.015–0.064) and peaks
0.080–0.265, below full scale. Captures were taken for all ten parts; the live
chord UI showed correctly grouped, labeled triads and sevenths.

Use an isolated Chrome context with the local Vite server. The existing
`window.__pianoball` debug API drives every new tune in both roles at its
authored practice tempo, through the count-in and final results. Send real
input events against the audio clock, including note-off events for holds.
Do not alter judging windows or the transport speed.

Record each run's completion phase, score accuracy, hold accuracy and verdict
tally. Sample the actual audio output for peak/RMS, and capture each part's
canvas with the existing `shot` helper. Local captures and run data belong in
ignored `.shots/`, not in the distributed game. Inspect the live UI as well as
the captures, including chord labels and the expanded song list.

These are automated browser playthroughs and score-based musical checks.
They do not substitute for a pianist's listening session or testing a physical
MIDI controller and its latency. The source ledger records the melodic and
instrument decisions. Publication and native online-startup checks follow the
existing release workflow after the PR is reviewed.
