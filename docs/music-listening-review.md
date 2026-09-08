# Production audio review

This review renders every published role arrangement through the production `AudioEngine`. It checks signal correctness and gives reviewers isolated stems for judging the music. It does **not** claim that automated measurements replace listening, or that a synthesized, compact excerpt recreates a concert performance.

The final PR is integrated with Hopscotch and the three songs/rhythm switch in PR #50: **24 unique tracks / 44 role arrangements**. The historical table below preserves the earlier 21-track audit, including retired Drift. Its 114 renders are historical evidence; updated percussion arrangements and newly added tracks are verified separately below. Human musical listening remains pending.

## Reproduce

From the repository root with dependencies installed and a Chromium browser available:

```powershell
node scripts/music-review-server.mjs --run --label=review --sample-rate=48000 --verify-repeat
node scripts/music-review-server.mjs --run --label=review --smoke
```

The runner starts a Vite server bound only to `127.0.0.1`, launches a hidden Chromium instance with a separate profile, and writes ignored artifacts under `.shots/musicality`. It leaves the user's browser profile, preferences and saved scores alone. Set `CHROME_PATH` if the browser executable is not in a detected location. `--port=5175` chooses another local port.

To rerender affected entries while preserving the others:

```powershell
node scripts/music-review-server.mjs --run --label=review --ids=fur-elise,hopscotch --roles=melody --sample-rate=48000
```

Filtered runs merge with the prior manifest. Entries retain the source digest of their own render; a mixed manifest lists prior source snapshots. An unfiltered run replaces the manifest with a complete new pass. Avoid simultaneous runs that write the same manifest or WAV names. Filtered runs reject a prior manifest with a different sample rate, including mixed-rate stems, before writing output. To change sample rate, choose a different supported label or run an unfiltered full render. A prior repeat check is retained only while its role entry is untouched; rerendering that entry clears the old check unless a fresh repeat is verified.

`node scripts/music-review-data.mjs --baseline` captures the catalog data at `9840971`; `--label=baseline` renders that snapshot with the **current** engine. Such a file compares arrangements, not old versus new synthesis.

## What is rendered

For each selected arrangement, the harness writes `LABEL_ROLE_ID_player.wav`, `LABEL_ROLE_ID_automatic.wav` and `LABEL_ROLE_ID_combined.wav`: 48 kHz stereo PCM16, without loudness normalization. The manifest is `LABEL_render-metrics.json`. The integrated catalog has 44 arrangements; the historical pre-integration pass below contains 38.

The automatic stem uses exported authored pitch, gain, attack and audible duration; authored notes enter the production written-note piano path. The player stem goes through actual `noteOn`/`noteOff` with fixed velocity 0.62 and the chart's graded hold length. All default effects and instrument voicings remain active, with full audio quality. Authored drum events use the production owned-drum path in the automatic and combined stems; the player stem contains no drums. The automatic bus and player's input/pedal ownership remain independent. No player pedal is added to these reference performances.

Player stems use the **authored chart register**, without applying a keyboard fit. Runtime player targets can move by octaves to fit the connected keyboard; automatic notes retain their authored register. The real-browser smoke separately checks both roles on 49- and 25-key windows, including a nonzero player shift. These are technical range/ownership checks, not listening judgments of the fitted mixes. Octave fitting can put the player below or through the fixed accompaniment: in the tested 25-key Für Elise Melody setup, the player spans C2–E3 while automatic notes span E2–A3. The agreed fit policy is unchanged; these compact-keyboard mixes need human audition.

Every file has a 0.25-second lead-in and five seconds after the final written audible note end. Offline input calls occur at the closest preceding 128-frame render boundary; the manifest records the maximum quantization error (under one render quantum). The engine's normal short input-onset safety margin still applies. The render does not emulate the screen's count-in, results cue, MIDI-device latency, imperfect playing or the speaker hardware.

Random source construction is seeded per arrangement/event. Chromium floating-point processing can change PCM16 rounding by one least-significant unit. `--verify-repeat` retains an extra combined WAV, both SHA-256 values and a direct sample comparison; it accepts only equal headers/frame count and a maximum difference of one PCM16 unit. This is bounded reproducibility, not a claim of byte-identical Web Audio output.

## Acceptance checks

Metrics are computed on floating-point samples before PCM conversion: finite samples, samples at or above full scale, near-clipping samples at or above 0.98, peak, RMS over the musical window, final-quarter-second RMS, and DC offset. A signal pass requires no non-finite, clipped or near-clipping samples and an ending below −65 dBFS after the five-second tail.

Automatic-versus-player RMS is a **listening prompt**, with a broad review range of −20 to +6 dB. Sustained voices, short piano/guitar decays, texture density and role ownership make a universal loudness target inappropriate. A balance flag is reviewed separately from signal failures.

The real-clock smoke runs the actual app and normal `AudioContext`/animation loop with only the final speaker feed muted. It checks player-only octave fitting; same-pitch automatic/player overlap and player sustain; restart, pause, resume and stop, including Hopscotch’s owned notes and drum rooms; and one complete First Light ending with its form rest and result cue. It uses a separate browser profile and records `LABEL_browser-smoke.json`. The historical `current_browser-smoke.json` predates Hopscotch integration and checks Drift’s glass swell instead.

## Listening handoff

Human listening is still needed for phrase shape, instrument blend and resemblance to each cited score. Listen to each combined file first, then isolate the automatic stem wherever the accompaniment feels wrong. Check beginnings/pickups, bass inversions, melody/harmony collisions, repeated-note articulation, phrase endings, and whether the automatic line remains clear when playing Backing. For piano pieces, compare the cited excerpt in the arrangement/source notes; for folk tunes and originals, judge the declared arrangement rather than a nonexistent single canonical accompaniment.

Prioritize Für Elise's bass/arpeggio answers, Bach's independent lines, Canon's layered voices, the waltz accompaniment of Blue Danube and Gymnopédie, The Entertainer's syncopation against its bass/chords, and the mix of sustained Drift versus the plucked/folk voices. Audition small-keyboard runtime octave fits as well as the authored-register reference files.

## Automatic piano selection correction

The PR review found that the automatic Felt Piano could inherit Grand Piano from the player's lead selection. The written-piano path now follows its configured backing voice. First Light, Two Hands and Can-Can keep their Grand Piano player parts and use Felt Piano automatically, matching their cards and exported arrangements.

These three Melody arrangements were rendered again after the correction. All nine stems pass signal and broad balance checks. The other 41 arrangements retain their previous evidence because their configured automatic synthesis paths are unchanged. The [updated 44-arrangement measurements](../.shots/musicality/piano-selection-merged-metrics.json) and [132-WAV verification](../.shots/musicality/piano-selection-verification.json) record this provenance. All 1,143 tests across 59 files, the production build/typecheck and the 44-entry export pass. Human listening remains pending.

These files supersede the corresponding three Melody rows in the earlier tables below.

| Track | Player | Automatic | Ideal performance |
| --- | --- | --- | --- |
| First Light | [Player](../.shots/musicality/review_melody_first-light_player.wav) | [Automatic](../.shots/musicality/review_melody_first-light_automatic.wav) | [Combined](../.shots/musicality/review_melody_first-light_combined.wav) |
| Can-Can | [Player](../.shots/musicality/review_melody_can-can_player.wav) | [Automatic](../.shots/musicality/review_melody_can-can_automatic.wav) | [Combined](../.shots/musicality/review_melody_can-can_combined.wav) |
| Two Hands | [Player](../.shots/musicality/review_melody_two-hands_player.wav) | [Automatic](../.shots/musicality/review_melody_two-hands_automatic.wav) | [Combined](../.shots/musicality/review_melody_two-hands_combined.wav) |

## Integrated main review - 8 September 2026

The final implementation includes merged PR #50, including its active playing-screen rhythm switch. **1,143 tests across 59 files**, production typecheck/build and the **44-entry schema-v1 export** pass.

All **44 arrangements / 132 stems** have verified score fingerprints and WAV hashes, with no signal or broad balance-screening failures. The 12 arrangements with authored percussion were rendered again through the current production piano and owned-drum paths. The 32 remaining arrangements match their earlier full-entry fingerprints exactly; their pitched synthesis paths are unchanged. Historical files remain intact. The combined peak ceiling is -11.99 dBFS, and the loudest final tail is -117.26 dBFS.

La Bamba's nylon automatic accompaniment needed a tune-local 2x gain correction to clear the balance screen. Its playable notes, automatic pitches/timing, harmony and drums remain the source data from PR #50. Hopscotch and the three inserted tunes retain their original playable pitch/timing contracts; only performance expression differs.

The isolated real-clock browser check passes direct clicks on the active HUD Rhythm switch, accessible On/Off state, continued player/automatic notes, unchanged chart and ending timing, fresh drum rooms, restart/stop, and natural First Light completion. An earlier run timed out during the ending wait while heavy offline rendering ran concurrently; it was not counted as a pass and the isolated rerun completed.

[Current listening playlist](../.shots/musicality/pr50-index.html) contains all 132 stems. [Combined measurements](../.shots/musicality/pr50-merged-metrics.json), [catalog/WAV verification](../.shots/musicality/pr50-final-verification.json), and [latest live smoke](../.shots/musicality/pr50-musicality_browser-smoke.json) preserve the detailed evidence. Human musical listening and octave-fitted mix approval remain pending.

| Track | Role | Measured verdict | Evidence | Ideal performance |
| --- | --- | --- | --- | --- |
| First Light | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_first-light_combined.wav) |
| Ode to Joy | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_ode-to-joy_combined.wav) |
| Twinkle, Twinkle | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_twinkle_combined.wav) |
| Frère Jacques | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_frere-jacques_combined.wav) |
| Amazing Grace | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_amazing-grace_combined.wav) |
| Scarborough Fair | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_scarborough-fair_combined.wav) |
| Hopscotch | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_hopscotch_combined.wav) |
| Yankee Doodle | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_yankee-doodle_combined.wav) |
| Drunken Sailor | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_drunken-sailor_combined.wav) |
| Greensleeves | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_greensleeves_combined.wav) |
| Für Elise | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_fur-elise_combined.wav) |
| Londonderry Air | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_londonderry-air_combined.wav) |
| La Bamba | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_la-bamba_combined.wav) |
| Can-Can | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_can-can_combined.wav) |
| Minuet in G | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_minuet-in-g_combined.wav) |
| Gymnopédie No. 1 | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_gymnopedie_combined.wav) |
| Two Hands | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_two-hands_combined.wav) |
| The Irish Washerwoman | Melody | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_melody_irish-washerwoman_combined.wav) |
| The Blue Danube | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_blue-danube_combined.wav) |
| Canon in D | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_canon-in-d_combined.wav) |
| Jesu, Joy of Man’s Desiring | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_jesu-joy_combined.wav) |
| The Entertainer | Melody | Pass | Unchanged score | [Combined](../.shots/musicality/current_melody_the-entertainer_combined.wav) |
| Frère Jacques | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_frere-jacques_combined.wav) |
| Ode to Joy | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_ode-to-joy_combined.wav) |
| Ground | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_chord-ground_combined.wav) |
| Twinkle, Twinkle | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_twinkle_combined.wav) |
| Off the Beat | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_chord-march_combined.wav) |
| Yankee Doodle | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_yankee-doodle_combined.wav) |
| Hopscotch | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_hopscotch_combined.wav) |
| Drunken Sailor | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_drunken-sailor_combined.wav) |
| Canon in D | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_canon-in-d_combined.wav) |
| Amazing Grace | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_amazing-grace_combined.wav) |
| Scarborough Fair | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_scarborough-fair_combined.wav) |
| La Bamba | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_la-bamba_combined.wav) |
| Gymnopédie No. 1 | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_gymnopedie_combined.wav) |
| Londonderry Air | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_londonderry-air_combined.wav) |
| Greensleeves | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_greensleeves_combined.wav) |
| The Irish Washerwoman | Backing | Pass | Fresh render | [Combined](../.shots/musicality/pr50-musicality_chords_irish-washerwoman_combined.wav) |
| Can-Can | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_can-can_combined.wav) |
| The Blue Danube | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_blue-danube_combined.wav) |
| Für Elise | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_fur-elise_combined.wav) |
| Minuet in G | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_minuet-in-g_combined.wav) |
| Jesu, Joy of Man’s Desiring | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_jesu-joy_combined.wav) |
| The Entertainer | Backing | Pass | Unchanged score | [Combined](../.shots/musicality/current_chords_the-entertainer_combined.wav) |

## Pre-integration review — 8 September 2026

The pre-integration repository verification also passed: **968 tests across 49 files**, the production build/typecheck, and the schema-v1 catalog export.

The historical pre-integration **38 arrangements / 114 stems** pass signal checks, with no non-finite, clipped or near-clipping samples. The highest peak is -11.94 dBFS; the loudest final tail is -112.84 dBFS. No arrangement remains outside the broad balance-screening range. These are measured passes; human musical listening remains pending.

[Open the offline listening playlist](../.shots/musicality/index.html). It contains all 114 audio controls and download links. [Full measurements](../.shots/musicality/current_render-metrics.json), [real-browser smoke](../.shots/musicality/current_browser-smoke.json), and [historical catalog/WAV verification](../.shots/musicality/final-verification.json) are also available locally. The ignored outputs are generated artifacts, so repository clones must rerun the review to create them.

The seeded First Light repeat differs by at most one PCM16 unit, about 69.5 dB below the program in RMS; both original hashes and the sample-level comparison are retained. All 114 historical WAV hashes match their manifest.

The first pass exposed excessive authored gain; strengths were normalized to the production linear-gain scale before catalog acceptance. Later balance checks led to tune-local nylon gain corrections in Drunken Sailor and a consistent glass automatic voice for Backing Drift. No global Freestyle mix change was required.

Full-entry fingerprints compare all 38 role/ID pairs against the pre-integration compiled catalog. The contemporaneous snapshot has 29 unchanged entries and precisely the nine subsequently revised/rerendered entries. Earlier entry hashes are explicitly labelled **retrospective**, based on that snapshot and the tracked revisions; the final Drunken Sailor render captures its entry and adapter hashes directly. Earlier passes recorded the global `src/**/*.ts` digest but did not capture adapter hashes, and do not claim otherwise. New runs capture both source and adapter SHA-256 digests. Generated reports must read and write text explicitly as UTF-8; Windows default code pages can corrupt accented titles even while audio and hashes remain correct. [Fingerprint comparison](../.shots/musicality/catalog-fingerprint-verification.json).

“Pass” below means finite, unclipped, settled audio and no remaining broad balance flag. Peak is the combined stem; balance is automatic minus player RMS over the musical window. Listen at a comfortable consistent volume with normalization disabled when comparing levels.

| Track | Role | Measured verdict | Peak dBFS | Balance dB | Player stem | Automatic stem | Combined stem |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| First Light | Melody | Pass | -22.1 | -4.1 | [Player](../.shots/musicality/current_melody_first-light_player.wav) | [Automatic](../.shots/musicality/current_melody_first-light_automatic.wav) | [Combined](../.shots/musicality/current_melody_first-light_combined.wav) |
| Ode to Joy | Melody | Pass | -19.9 | -9.4 | [Player](../.shots/musicality/current_melody_ode-to-joy_player.wav) | [Automatic](../.shots/musicality/current_melody_ode-to-joy_automatic.wav) | [Combined](../.shots/musicality/current_melody_ode-to-joy_combined.wav) |
| Twinkle, Twinkle | Melody | Pass | -20.2 | -9.3 | [Player](../.shots/musicality/current_melody_twinkle_player.wav) | [Automatic](../.shots/musicality/current_melody_twinkle_automatic.wav) | [Combined](../.shots/musicality/current_melody_twinkle_combined.wav) |
| Frère Jacques | Melody | Pass | -23.9 | -11.6 | [Player](../.shots/musicality/current_melody_frere-jacques_player.wav) | [Automatic](../.shots/musicality/current_melody_frere-jacques_automatic.wav) | [Combined](../.shots/musicality/current_melody_frere-jacques_combined.wav) |
| Amazing Grace | Melody | Pass | -19.9 | -8.3 | [Player](../.shots/musicality/current_melody_amazing-grace_player.wav) | [Automatic](../.shots/musicality/current_melody_amazing-grace_automatic.wav) | [Combined](../.shots/musicality/current_melody_amazing-grace_combined.wav) |
| Scarborough Fair | Melody | Pass | -20.7 | -8.0 | [Player](../.shots/musicality/current_melody_scarborough-fair_player.wav) | [Automatic](../.shots/musicality/current_melody_scarborough-fair_automatic.wav) | [Combined](../.shots/musicality/current_melody_scarborough-fair_combined.wav) |
| Drift | Melody | Pass | -18.7 | +3.9 | [Player](../.shots/musicality/current_melody_drift_player.wav) | [Automatic](../.shots/musicality/current_melody_drift_automatic.wav) | [Combined](../.shots/musicality/current_melody_drift_combined.wav) |
| Drunken Sailor | Melody | Pass | -13.4 | -16.7 | [Player](../.shots/musicality/current_melody_drunken-sailor_player.wav) | [Automatic](../.shots/musicality/current_melody_drunken-sailor_automatic.wav) | [Combined](../.shots/musicality/current_melody_drunken-sailor_combined.wav) |
| Greensleeves | Melody | Pass | -19.6 | -10.5 | [Player](../.shots/musicality/current_melody_greensleeves_player.wav) | [Automatic](../.shots/musicality/current_melody_greensleeves_automatic.wav) | [Combined](../.shots/musicality/current_melody_greensleeves_combined.wav) |
| Für Elise | Melody | Pass | -19.8 | -11.2 | [Player](../.shots/musicality/current_melody_fur-elise_player.wav) | [Automatic](../.shots/musicality/current_melody_fur-elise_automatic.wav) | [Combined](../.shots/musicality/current_melody_fur-elise_combined.wav) |
| Londonderry Air | Melody | Pass | -20.2 | -10.9 | [Player](../.shots/musicality/current_melody_londonderry-air_player.wav) | [Automatic](../.shots/musicality/current_melody_londonderry-air_automatic.wav) | [Combined](../.shots/musicality/current_melody_londonderry-air_combined.wav) |
| Can-Can | Melody | Pass | -22.7 | -8.7 | [Player](../.shots/musicality/current_melody_can-can_player.wav) | [Automatic](../.shots/musicality/current_melody_can-can_automatic.wav) | [Combined](../.shots/musicality/current_melody_can-can_combined.wav) |
| Minuet in G | Melody | Pass | -18.9 | -14.6 | [Player](../.shots/musicality/current_melody_minuet-in-g_player.wav) | [Automatic](../.shots/musicality/current_melody_minuet-in-g_automatic.wav) | [Combined](../.shots/musicality/current_melody_minuet-in-g_combined.wav) |
| Gymnopédie No. 1 | Melody | Pass | -21.1 | -4.4 | [Player](../.shots/musicality/current_melody_gymnopedie_player.wav) | [Automatic](../.shots/musicality/current_melody_gymnopedie_automatic.wav) | [Combined](../.shots/musicality/current_melody_gymnopedie_combined.wav) |
| Two Hands | Melody | Pass | -22.6 | -8.5 | [Player](../.shots/musicality/current_melody_two-hands_player.wav) | [Automatic](../.shots/musicality/current_melody_two-hands_automatic.wav) | [Combined](../.shots/musicality/current_melody_two-hands_combined.wav) |
| The Blue Danube | Melody | Pass | -19.7 | -11.9 | [Player](../.shots/musicality/current_melody_blue-danube_player.wav) | [Automatic](../.shots/musicality/current_melody_blue-danube_automatic.wav) | [Combined](../.shots/musicality/current_melody_blue-danube_combined.wav) |
| Canon in D | Melody | Pass | -19.3 | -10.8 | [Player](../.shots/musicality/current_melody_canon-in-d_player.wav) | [Automatic](../.shots/musicality/current_melody_canon-in-d_automatic.wav) | [Combined](../.shots/musicality/current_melody_canon-in-d_combined.wav) |
| Jesu, Joy of Man’s Desiring | Melody | Pass | -18.1 | -12.6 | [Player](../.shots/musicality/current_melody_jesu-joy_player.wav) | [Automatic](../.shots/musicality/current_melody_jesu-joy_automatic.wav) | [Combined](../.shots/musicality/current_melody_jesu-joy_combined.wav) |
| The Entertainer | Melody | Pass | -17.8 | -12.0 | [Player](../.shots/musicality/current_melody_the-entertainer_player.wav) | [Automatic](../.shots/musicality/current_melody_the-entertainer_automatic.wav) | [Combined](../.shots/musicality/current_melody_the-entertainer_combined.wav) |
| Frère Jacques | Backing | Pass | -17.3 | -9.1 | [Player](../.shots/musicality/current_chords_frere-jacques_player.wav) | [Automatic](../.shots/musicality/current_chords_frere-jacques_automatic.wav) | [Combined](../.shots/musicality/current_chords_frere-jacques_combined.wav) |
| Ode to Joy | Backing | Pass | -19.8 | -13.3 | [Player](../.shots/musicality/current_chords_ode-to-joy_player.wav) | [Automatic](../.shots/musicality/current_chords_ode-to-joy_automatic.wav) | [Combined](../.shots/musicality/current_chords_ode-to-joy_combined.wav) |
| Ground | Backing | Pass | -18.9 | -12.2 | [Player](../.shots/musicality/current_chords_chord-ground_player.wav) | [Automatic](../.shots/musicality/current_chords_chord-ground_automatic.wav) | [Combined](../.shots/musicality/current_chords_chord-ground_combined.wav) |
| Twinkle, Twinkle | Backing | Pass | -16.7 | -15.5 | [Player](../.shots/musicality/current_chords_twinkle_player.wav) | [Automatic](../.shots/musicality/current_chords_twinkle_automatic.wav) | [Combined](../.shots/musicality/current_chords_twinkle_combined.wav) |
| Off the Beat | Backing | Pass | -17.8 | -13.7 | [Player](../.shots/musicality/current_chords_chord-march_player.wav) | [Automatic](../.shots/musicality/current_chords_chord-march_automatic.wav) | [Combined](../.shots/musicality/current_chords_chord-march_combined.wav) |
| Drift | Backing | Pass | -12.0 | -12.9 | [Player](../.shots/musicality/current_chords_drift_player.wav) | [Automatic](../.shots/musicality/current_chords_drift_automatic.wav) | [Combined](../.shots/musicality/current_chords_drift_combined.wav) |
| Drunken Sailor | Backing | Pass | -16.0 | -15.0 | [Player](../.shots/musicality/current_chords_drunken-sailor_player.wav) | [Automatic](../.shots/musicality/current_chords_drunken-sailor_automatic.wav) | [Combined](../.shots/musicality/current_chords_drunken-sailor_combined.wav) |
| Canon in D | Backing | Pass | -17.8 | -14.4 | [Player](../.shots/musicality/current_chords_canon-in-d_player.wav) | [Automatic](../.shots/musicality/current_chords_canon-in-d_automatic.wav) | [Combined](../.shots/musicality/current_chords_canon-in-d_combined.wav) |
| Amazing Grace | Backing | Pass | -17.4 | -14.5 | [Player](../.shots/musicality/current_chords_amazing-grace_player.wav) | [Automatic](../.shots/musicality/current_chords_amazing-grace_automatic.wav) | [Combined](../.shots/musicality/current_chords_amazing-grace_combined.wav) |
| Scarborough Fair | Backing | Pass | -17.5 | -16.0 | [Player](../.shots/musicality/current_chords_scarborough-fair_player.wav) | [Automatic](../.shots/musicality/current_chords_scarborough-fair_automatic.wav) | [Combined](../.shots/musicality/current_chords_scarborough-fair_combined.wav) |
| Gymnopédie No. 1 | Backing | Pass | -17.9 | -17.0 | [Player](../.shots/musicality/current_chords_gymnopedie_player.wav) | [Automatic](../.shots/musicality/current_chords_gymnopedie_automatic.wav) | [Combined](../.shots/musicality/current_chords_gymnopedie_combined.wav) |
| Londonderry Air | Backing | Pass | -18.3 | -14.0 | [Player](../.shots/musicality/current_chords_londonderry-air_player.wav) | [Automatic](../.shots/musicality/current_chords_londonderry-air_automatic.wav) | [Combined](../.shots/musicality/current_chords_londonderry-air_combined.wav) |
| Greensleeves | Backing | Pass | -18.4 | -15.5 | [Player](../.shots/musicality/current_chords_greensleeves_player.wav) | [Automatic](../.shots/musicality/current_chords_greensleeves_automatic.wav) | [Combined](../.shots/musicality/current_chords_greensleeves_combined.wav) |
| Can-Can | Backing | Pass | -17.1 | -13.6 | [Player](../.shots/musicality/current_chords_can-can_player.wav) | [Automatic](../.shots/musicality/current_chords_can-can_automatic.wav) | [Combined](../.shots/musicality/current_chords_can-can_combined.wav) |
| The Blue Danube | Backing | Pass | -15.8 | -16.0 | [Player](../.shots/musicality/current_chords_blue-danube_player.wav) | [Automatic](../.shots/musicality/current_chords_blue-danube_automatic.wav) | [Combined](../.shots/musicality/current_chords_blue-danube_combined.wav) |
| Für Elise | Backing | Pass | -18.8 | -11.7 | [Player](../.shots/musicality/current_chords_fur-elise_player.wav) | [Automatic](../.shots/musicality/current_chords_fur-elise_automatic.wav) | [Combined](../.shots/musicality/current_chords_fur-elise_combined.wav) |
| Minuet in G | Backing | Pass | -17.6 | -13.1 | [Player](../.shots/musicality/current_chords_minuet-in-g_player.wav) | [Automatic](../.shots/musicality/current_chords_minuet-in-g_automatic.wav) | [Combined](../.shots/musicality/current_chords_minuet-in-g_combined.wav) |
| Jesu, Joy of Man’s Desiring | Backing | Pass | -16.6 | -15.3 | [Player](../.shots/musicality/current_chords_jesu-joy_player.wav) | [Automatic](../.shots/musicality/current_chords_jesu-joy_automatic.wav) | [Combined](../.shots/musicality/current_chords_jesu-joy_combined.wav) |
| The Entertainer | Backing | Pass | -16.3 | -14.8 | [Player](../.shots/musicality/current_chords_the-entertainer_player.wav) | [Automatic](../.shots/musicality/current_chords_the-entertainer_automatic.wav) | [Combined](../.shots/musicality/current_chords_the-entertainer_combined.wav) |
