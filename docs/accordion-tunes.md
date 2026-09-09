# Accordion teaching arrangements

Added 9 September 2026. These are instrumental teaching arrangements, with no lyrics, recordings, samples or drums. Both pieces occupy difficulty 3 immediately after La Bamba (French first) in Melody and Backing. Stable IDs are `le-temps-des-cerises` and `hava-nagila`; no existing chart, storage generation or default instrument changes.

| Piece | Key / meter / tempo | Form | Melody: keys / automatic backing | Backing: keys / automatic melody |
|---|---|---|---|---|
| Le Temps des cerises | C major, 3/4, quarter = 108 | One vocal stanza; one-beat pickup + 29 bars = 88 beats | Accordion / Accordion | Accordion / Accordion |
| Hava Nagila | D modal, 4/4, quarter = 108 throughout | AABB + C; 24 bars = 96 beats | Accordion / Nylon Guitar | Nylon Guitar / Accordion |

## Le Temps des cerises

Source: Antoine Renard, *Le temps des cerises*, Paris: Émile Benoît, plate E.B.3940, circa 1889; voice/piano edition, [IMSLP file 568963](https://imslp.org/wiki/Le_temps_des_cerises_(Renard,_Antoine)). [BNF scan mirrored by IMSLP](https://s9.imslp.org/files/imglnks/usimg/3/3c/IMSLP568963-PMLP555480-Renard_-_temps_des_cerises,_Le_-_vpf-BNF.pdf). The selected melody is the first complete stanza on printed pages 1–2 (PDF pages 2–3), excluding the piano introduction/interlude. IMSLP marks this edition public domain. Renard died in 1872; this nineteenth-century composition and printing are well beyond ordinary life-plus-70 and US publication terms. No lyrics or modern arrangement are reproduced.

The print is in A-flat, 3/8. Transpose up four semitones into C and double the written note values: each source eighth is a chart quarter. The one-eighth pickup becomes G4 at beat 0, the first full bar starts at beat 1, and the new tempo is quarter = 108. This is an accordion arrangement of a historical song, not a claim that the original was composed specifically for accordion.

Keep the 29 full bars, breath rests and cadences. The source's tied note becomes one seven-beat E5 at beat 28; there is a rest before the next E5 at beat 36. The reprise pickup is G4 at beat 63. The final C5 occupies beats 85–88. The small turn and grace-note decoration are omitted; no extra bars are inserted to regularize the unusual phrase lengths. Dynamics and slight articulation gaps are performance choices, separate from graded durations.

The automatic bass–chord–chord accompaniment is newly authored for this project, not copied from the edition's piano part. Each full bar has one low bass then two upper chord responses; the pickup is unaccompanied. Voicings are explicit, with C, G7, F, Am and Dm-based colors (the Dm automatic voicing includes its minor seventh). A separate compact playable reduction supplies a bass and two dyads per bar. Both end together on a held tonic at beat 85. Automatic bass/chord gains are deliberately lower than the sung line.

## Hava Nagila

The [National Library of Israel's historical account](https://exhibition.nli.org.il/he/exhibition-items/hava-nagila) documents Idelsohn's publication in his 1922 songbook. **The exact 1922 score pages could not be retrieved; this implementation uses an accessible early 1923 printing instead.** It must not be described as a verified facsimile transcription of the 1922 edition.

Primary score used: Warsaw *Hashomer Hatzair*, circular no. 20, Sivan 5683 (1923), from the Mishmar HaEmek archive, reproduced with source/date information on [Zemereshet's song page](https://www.zemereshet.co.il/song.asp?id=1271): [1923 melody image](https://www.zemereshet.co.il/UserFiles/Image/notes/hava_nagila_and_zivkhu.jpg). The second, unrelated song on that sheet is excluded. Idelsohn's [family-archive manuscripts](https://www.seligman.org.il/joffe_AZIdelsohn.html) and the melody in the 1929 *Echoes of Palestine* printing linked by Zemereshet were used as cross-checks for unclear notation, not as sources of accompaniment.

The traditional Hasidic melody and Idelsohn's early editorial version are historical material: the selected printing dates to 1923, and Idelsohn died in 1938. These dates place the selected material beyond US publication protection and ordinary life-plus-70 terms. No modern harmonization, recording or lyrics are included; source-site presentation rights are not claimed as project assets.

Transpose the E-based source down a whole tone. The chart uses D Aeolian as its existing scale container and explicitly borrows offsets 1 and 4 (E-flat and F-sharp), preserving both F-natural and F-sharp, B-flat, and C-natural. The modal tonic is D major. A is repeated at beats 0/16, B at 32/48, and C begins at 64 with the long A4 call. C continues through beat 96; final D4 is held at 94–96. The tempo is fixed, with no traditional accelerando.

This is an editorial teaching reduction of the early melody: cadential turns are reduced to principal tones, rapid repeated sixteenths become two eighth attacks per beat, and dotted-eighth/sixteenth pairs become even eighths. Bar lengths and the complete three-section form remain. These reductions preserve quarter = 108 while satisfying the unchanged 220 ms minimum onset spacing and eight-visible-onset limits. They are used consistently by the player chart and automatic melody.

The new nylon-guitar accompaniment alternates low root/fifth bass with upper chord responses; D major, G minor and C minor support the phrases. The complete automatic pitches and durations are authored separately from the smaller playable bass/dyad reduction. The final tonic begins at beat 94. This accompaniment and all expressive shaping are original to this project.

## Synthesis and artwork

`accordion` and `bed-accordion` reuse the reed-spectrum oscillator, lightly detuned ±4-cent unison reeds and a quiet octave layer. The lead has a soft 25 ms attack, high sustain and 90 ms release. Automatic accordion notes reuse the existing independently scheduled lead-envelope implementation with the backing bank's reeds, avoiding a pad fade across long held notes. Automatic ownership remains separate from live keys and pedal state. No new synthesis dependency or sampled audio is introduced.

The 400×400 JPEG is converted from `PianoBallDesktop/assets/instruments/accordion.png`. Full generation provenance, original SHA-256 and conversion/output hash are in [accordion.provenance.json](../assets/accordion.provenance.json). Both bank IDs resolve to that same picture. Instrument defaults are unchanged; Freestyle selections persist using the existing settings store.

## Reproducible verification

Source checkpoint tests: `tests/accordion-tunes.test.ts`. All-catalog playability, role routing, harmony/accidental checks and export round trips remain enforced by the existing suites. `tests/audio-lifecycle.test.ts` checks sustained automatic reeds, release endpoints, independent ownership and cancellation/restart. Current progress keeps prior IDs and records; the legacy backing importer retains its historical 22-entry access budget rather than inventing achievements for the added courses.

Run `npm test`, `npm run build`, and `npm run export:content`. For actual production Web Audio renders:

```powershell
node scripts/music-review-server.mjs --run --ids=le-temps-des-cerises,hava-nagila --roles=melody,chords --label=review --sample-rate=48000
node scripts/music-review-server.mjs --run --smoke --label=review --port=5175
```

The listening-review tooling discovers both pieces from the exported catalog. It writes isolated player, automatic and combined WAVs plus source digests and objective metrics under ignored `.shots/musicality/`. Browser smoke checks include both new songs in both roles on 25 keys, real key hold/release, voice routing and restart/stop. The renders support human listening review; numerical audio checks and score comparison do not constitute a human listening sign-off.

The Malagasy candidate remains separate: [deferred-malagasy-tune.md](deferred-malagasy-tune.md).

### Validation result, 9 September 2026

- 60 test files / 1,160 tests passed, including all-catalog melody judging and backing range/reach/spacing limits.
- Production build and schema-v1 export passed: 24 Melody and 24 Backing entries.
- All four production render checks passed at 48 kHz (12 stems). Zero clipped or nonfinite samples; final-tail RMS was below the -180 dBFS reporting floor in every stem. Combined peaks ranged from -22.30 to -18.20 dBFS.
- In Melody mode, automatic French accompaniment measured 5.5 dB below the player line in musical RMS; nylon-guitar accompaniment was 16.1 dB below. In Backing mode, the fixed-velocity French player reduction measured 5.9 dB above the automatic melody; playing its chord answers lightly is appropriate. Hava's automatic melody measured 5.9 dB above the player guitar. These are objective level observations, not a subjective blend approval.
- Real Chrome AudioContext smoke checks passed both pieces in both roles on 25 keys: bank routing, held live keys, key release, fresh restart generation and stopping all owned audio. Existing pause/resume, pedal ownership and natural-ending checks also passed.
- Artwork visually inspected at 400×400: complete instrument, navy background, no clipped edges or lettering. JPEG format, dimensions and provenance hash are tested.

Evidence: `.shots/musicality/review_render-metrics.json` and `review_browser-smoke.json`, source digest `3756978c5887faa2c5fba03ffae843a8301891bc1a9b78a2d041c48e4cac812c`. WAVs remain available locally for listening. Human listening acceptance remains unclaimed.
