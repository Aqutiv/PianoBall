# Fixed PlayTune instruments — verification

Implemented from the Desktop handoff dated 9 September 2026, against browser
main `c06176572f4f2c49101ca954544584f58d94dfe9`.

## Result

All 48 role entries use the exact fixed first-choice assignments in
`src/modes/playtune/fixedPairings.ts`. Definitions are applied at authoring time;
source validation, runtime captions, playback and export consume the same
Tune/ChordRole fields. No random selection or alternate arrangements were added.

The banks contain 31 lead and 26 bed definitions. Six distinct new synthesized
identities and six existing-instrument counterparts supply the required three
lead and eleven bed additions. Grand Piano and Warm Pad remain the defaults.
Articulated beds preserve layer decay/FM, string models, attack transients,
pitch filters and delayed expression, with independent player/automatic release.
String buffers include model parameters in the cache key. Automatic articulated
voices use the instrument patch attack; existing authored event fields are kept.

Six instrument pictures reuse the owner's Desktop artwork. Browser JPEGs fit
400×400 and remain outside PWA precaching. Exact origins and hashes are recorded
in [art provenance](playtune-instrument-art.json).

## Checks

- Node 24.18.0: **1,287 tests passed across 62 files**; production build passed.
- All 48 assignments match the independent handoff fixture, in the published
  order. Against live baseline `ce9a291b…`, exactly 44 voice assignments change.
  All other entry fields, graded notes/holds, BPM, meter, pickup, pass targets,
  difficulty, authored percussion and backing events are identical. There are
  no procedural wash-filtering differences. Browser/scheduler/export parity
  tests remain intact.
- Two exports with identical source/provenance have identical manifest and
  catalogue bytes; independent SHA256 agrees with the digest filename and
  manifest. Local precommit catalogue: 1,473,625 bytes, schema 1, 24 Melody plus
  24 Backing entries; revision
  `178e13b7d30b1a5561abf2aba4f91c1faa769418d7801812c562a146e9c9059d`.
  Clean committed/CI provenance produces a different revision by design.
- Actual Chromium OfflineAudioContext renders: all 48 arrangements' first eight
  authored beats, with the full durations of notes starting in each excerpt,
  in separate player, automatic and combined stems; plus six new identities at
  soft/hard velocities with repeated notes and independently released chords.
  **156 renders passed**: no nonfinite, clipped or near-clipped samples, and
  ending RMS below −65 dBFS. New bass/guitar patch trims were calibrated from
  these renders without changing global gain or graded durations; hard solo
  peaks now range from −12.3 to −9.9 dBFS across the six identities.
- Live Chromium smoke passed all 48 role IDs through restart/pause/resume/stop,
  25/49-key fitting, same-pitch automatic/player/pedal independence, drum toggle,
  independent guitar/brass held-key release, natural song completion, and return
  to Freestyle defaults. The real AudioContext clock ran without acceleration;
  speaker output was muted. Screenshots confirmed new captions and reused art.
- Native `build/desktop/Release/CatalogTests.exe` accepts all 48 exported entries.
  All 28 distinct requested wire IDs resolve in the installed native registry;
  the six new sound-bank folders exist.

[Machine-readable verification](playtune-instruments-verification.json) contains
source digest, stem measurements, comparison and native parser evidence.
Ignored WAVs are under `.shots/musicality/fixed_*`. Reproduce short renders with
`node scripts/music-review-server.mjs --port=5174`, open
`http://127.0.0.1:5174/__instrument_review`, then invoke `instrumentReview.run()`.
The existing `--run --smoke --label=review` runner exercises the live browser.

## Listening and native limits

The renders and functional checks are not subjective listening acceptance.
No attached MIDI hardware was available. Full-piece listening, tonal realism
and perceived melody/accompaniment balance remain unverified. In particular,
some plucked Backing parts measure below sustained automatic parts in excerpt
RMS (including Drunken Sailor's inherited automatic melody gain boost); RMS
alone does not judge attack readability. No stress, soak, benchmark or XPS work
was performed.

The catalogue transfers identities/events, not browser synth code or audio
assets. Desktop uses its installed programs. Parser and asset checks do not
prove sample playback quality. Postpublication ordinary startup/download and
unchanged cache reuse are separate from the isolated parser check; hidden app
startup cannot establish visible captions/prepared-course audio or actual
network-disconnected startup.

**Native practice caveat:** current `arrangementFingerprint` includes the voice
fields. The 44 changed tracks reset their practice records when inspected or
started: tempo, loop/section settings, ladder state, attempts and practice best.
Stable course scores, passed state and unlock identities remain; unchanged
tracks retain practice records and global settings are separate. Preserving the
changed practice records requires a companion native migration outside this
browser change.

## Publication

Use the normal pull request/main Pages workflow: tests → Vite build → content
export → artifact upload → deployment. Generated `dist/content/v1` stays ignored.
After release, check direct HTTP 200 and JSON at the production manifest and its
digest-named catalogue, verify schema 1 and all three SHA256 representations, and
check ordinary installed startup against an isolated profile without editing
the real user cache. Publication provenance is read from the live manifest and
catalogue, rather than embedding a self-referential future commit in this report.
