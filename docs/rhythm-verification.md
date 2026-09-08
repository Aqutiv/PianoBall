# Rhythm and traditional-track verification

Verified 8 September 2026 in the isolated worktree at D:\Projects\PianoBall\.shots\tune-rhythm-traditional, on branch codex/tune-rhythm-traditional. Latest remote main was fetched again before delivery and remains ca92f288b0d997e9c3a77423bfd9ecbab5d2e481. The ongoing shared checkout was not edited. This branch is not merged into main.

## Automated checks

- Full Vitest suite: **54 files, 1,036 tests passed**.
- Production TypeScript/Vite build and schema-v1 content export passed: **22 Melody + 22 Backing = 44 entries**.
- All six original role entries and six new traditional role entries have authored percussion. The 32 existing classical/traditional role entries have none added. Hopscotch’s existing note, rhythm, ending and replacement tests pass.
- New stable IDs, exact insertions, old relative ordering, no invented scores, saved access, retired passes, reset epochs and Drift-to-Hopscotch migration are covered. Historical fixtures are independent of the expanded live catalog; the old pitched Melody content digest is unchanged.
- Source openings, pitches, short rhythms, ties, pickups, repeated forms and cadences are covered by focused tests and the linked visual source transcriptions. Every chart meets the existing input, visual-density, polyphony and keyboard-fit constraints.
- Shared rhythm preference defaults on, persists false, resets on, cancels its queued/live/owned wet audio, and joins future hits on the same transport. Tests also cover pause, restart, role changes, mode exit and export independence.
- Browser checks found 22 cards in each role with the intended voices. The accessible Tune rhythm switch toggled true/false/true. At 390 px width, the settings screen had no horizontal overflow and its label, help and switch were visible.

## Actual engine renders

The browser-only helper scripts/rhythm-review.mjs schedules the published player notes, pitched accompaniment and drums through the real AudioEngine in a stereo 48 kHz OfflineAudioContext. It produces ideal-player mixes plus separate percussion stems without playing through speakers or changing app settings. Run its entries() and render(id, role, stem) functions from an isolated Vite page to reproduce review files. Each rendered file includes six seconds for natural decay. No recording assets are added to the shipped content.

All **12 complete mixes and 12 percussion stems** rendered. There were **zero clipped samples**. The highest full-mix peak was 0.303 (1.0 is digital full scale). Final two-second RMS was at most 6.50e-7 across all files. Percussion-only stems are lower in average energy than the complete mixes; the table is a signal measurement, not a listening judgment.

| Arrangement | Role | Score seconds | Mix peak | Percussion / mix RMS |
|---|---|---|---|---|
| First Light | Melody | 25.4 | 0.196 | -26.9 dB |
| Hopscotch | Melody | 45.7 | 0.243 | -7.1 dB |
| Yankee Doodle | Melody | 44.1 | 0.280 | -15.2 dB |
| Two Hands | Melody | 43.7 | 0.213 | -8.4 dB |
| La Bamba | Melody | 72.0 | 0.160 | -37.6 dB |
| The Irish Washerwoman | Melody | 87.3 | 0.226 | -11.8 dB |
| Ground | Backing | 26.7 | 0.178 | -12.6 dB |
| Off the Beat | Backing | 24.0 | 0.274 | -12.1 dB |
| Yankee Doodle | Backing | 44.1 | 0.245 | -14.3 dB |
| Hopscotch | Backing | 45.7 | 0.266 | -8.3 dB |
| La Bamba | Backing | 72.0 | 0.197 | -38.8 dB |
| The Irish Washerwoman | Backing | 87.3 | 0.303 | -14.0 dB |

The local listening page is .shots/rhythm-review/index.html (served by the isolated Vite preview); metrics and WAVs are alongside it and intentionally ignored by Git. The four independently repeated existing drum-stop-bench.mjs runs passed, including full/lite reverb cancellation, future-hit suppression, clean restart count-in and preservation of other audio. Shared-return RMS differences ranged 3.30e-7–3.60e-7, below its existing 1e-6 threshold. One initial run reported a shared-return assertion that could not be reproduced; two long batches were interrupted by Vite page reloads. No production audio-engine or cancellation-benchmark change was made.

## Source and listening qualifications

The exact source passages and editorial choices are in [Yankee Doodle / Irish Washerwoman](traditional-marching-jig.md) and [La Bamba](traditional-la-bamba.md), with course placement in [the source ledger](tune-sources.md). Yankee Doodle sounds at quarter-note 66 BPM; La Bamba at quarter-note 60 BPM. Both use eighth-note chart units to keep the original rhythms readable. The Irish Washerwoman stays at eighth-note 132 BPM. These practice slowdowns preserve short notes instead of straightening them.

La Bamba uses the traditional first vocal line from the official SEP/ConArte score, as explicitly documented, rather than claiming an exact transcription of the planned 1939 El Jarocho recording. The modern second voice, introduction, harmonization and recording are excluded.

**Listening verification remains outstanding.** This model environment does not support audio input, so no claim is made to have heard these renders or verified recognizability, feel and balance by ear. The complete mixes and stems are supplied for that review.


## Live control review fix

PR #50 finding 3960322941 correctly identified that opening Settings goes through the pause screen and restarts the attempt on resume. A dedicated accessible Rhythm: On/Off switch now appears on the playing HUD for tracks with authored percussion. It updates the same persisted preference and applies it immediately without menu navigation. Pause and Settings retain their existing restart behavior.

Two additional role-specific regression tests activate the HUD callback and verify that the judge and transport origin remain unchanged, owned drums cancel, future hits rejoin, and pointer clicks release keyboard focus. Real Chromium pointer clicks at a 390 × 844 viewport verified off/on in Melody and Backing while phase stayed playing, the shell stayed unsuspended, no overlay opened, and the same judge and transport origin survived. The switch was unobstructed, at least 44 px high, and caused no horizontal overflow. The full 1,036-test suite, production build and 44-entry export pass after this fix.
