# La Bamba: source and arrangement

The chart uses a traditional son jarocho vocal melody from Veracruz, Mexico, in an independent practice arrangement. It does not use the Ritchie Valens introduction, rock arrangement, a sampled recording, or a modern instrumental solo.

## Readable melody source

The reference is the Mexican Secretaría de Educación Pública/ConArte songbook [¡Ah, qué la canción! Repertorio](https://educacionbasica.sep.gob.mx/multimedia/RSC/BASICA/Documento/201611/201611-3-RSC-TXfx7khG0k-ah_que_la_canci_n_repertorio.pdf). Printed page 64 (PDF page 65) identifies **La bamba**, **Dominio público**, **Son jarocho**. Printed page 66 (PDF page 67) supplies the notation and credits the arrangement to Enrique Jiménez.

Only **Voz 1's inherited song melody** is the melodic reference. The chart omits the seven-bar introduction, Voz 2, the publication's harmonization, lyrics, page layout, and all recording assets. Its public-domain identification applies to the underlying traditional song, not to the modern book or every part of Jiménez's arrangement. The backing and percussion here are independently authored reductions.

The excerpt begins at the first vocal onset in printed bar 8 (beat 2¾, counting the downbeat as zero), and ends at the first triplet eighth in bar 17, the cadence of the first complete copla and response. The next copla's pickup is omitted. Read the numbered bar lines on page 66 to locate the passage. The original G-major pitches are transposed down seven semitones to C major. Written rests, sixteenths, triplets, and tied notes are retained; ties become one held input.

From first onset to the end of that cadence the sourced passage lasts **35 7/12 quarter-note beats**. An original **5/12-beat breathing space** completes a 36-beat repeat interval. The same passage repeats once, giving 72 quarter-note beats of music, exported as a 144-eighth-note-beat chart. This is a nine-bar displacement between matching pickups, not a claim that the source is a sixteen-bar verse. The final melody note is G, the dominant in the transposed key; the original backing remains on that dominant at the response cadence rather than changing the inherited tune to force a tonic ending.

## Verification limits

The melody was visually transcribed from the readable official score. The [Indiana University historical entry](https://collections.libraries.indiana.edu/cookmusiclibrary/exhibits/show/sounds_of_mexico/la_bamba) links an El Jarocho performance identified as 1939. That recording was located, but the available model environment returned **“audio content omitted because you do not support audio input”** when an audio clip was presented. No auditory comparison or transcription of that recording is claimed. This implementation therefore uses the named printed traditional version, not a claimed exact recreation of the 1939 performance.

The [Library of Congress account of son jarocho](https://blogs.loc.gov/folklife/2023/04/homegrown-plus-cambalaches-mexican-american-son-jarocho-from-california/) describes La Bamba's nineteenth-century history. This supports the traditional provenance; it does not independently verify each pitch or rhythm of the printed version used here.

## Practice arrangement

- **Melody:** felt-piano lead, C ionian, four source quarter notes per bar represented by eight eighth-note chart beats, 2½-chart-beat pickup (1¼ quarter notes), difficulty 3, pass 0.65.
- **Tempo:** quarter note = 60, represented by eighth-note chart BPM 120. The proposed 104 would make the preserved sixteenth-note input gaps about 144 ms. Quarter note = 68 would meet the 220 ms input floor but still display nine notes inside the minimum two-second approach window. At quarter note = 60, the shortest gaps are 250 ms and the existing eight-note screen-density limit is met. The 144-eighth-note-beat chart lasts 72 seconds. This is a practice slowdown, not a source tempo claim. The eighth-note chart representation doubles BPM and every timing coordinate together, preserving all audible timings and the four-quarter source meter. It shortens the visual approach window to its two-second minimum; together with the practice tempo of quarter note = 60, this respects the existing limit of eight on-screen notes. The unit conversion itself does not speed up the music.
- **Automatic backing:** nylon-guitar, short bass attacks followed by close two-note chord answers. Harmony follows I–IV–V–V over the four quarter-note beats. It changes with the two-beat son pulse and avoids a rock bass riff. This is an original, reduced plucked accompaniment; it is not a synthesized claim to reproduce a jarana ensemble exactly.
- **Playable Backing:** a separate accessible piano reduction with quarter-note attacks: bass on beats one and three, two-note chords on two and four. It follows the automatic guitar part's harmonic changes while removing its offbeat attacks. Felt-piano keys and bed-felt-piano automatic melody; difficulty 3, pass 0.63. Both accompaniment parts leave the first pickup unaccompanied and hold the last dominant chord while the melody finishes.
- **Percussion:** quiet synthesized rim accents on the two main half-note pulses and alternating light eighth-note shaker attacks. No kick, snare backbeat, or fills. The opening pickup and final cadence have no drum hits. These are declared editorial synthetic accompaniment sounds, not recordings or exact models of tarima footwork, pandereta, or historical percussion.

[Smithsonian Folkways' son jarocho teaching guide](https://folkways-media.si.edu/docs/lesson_plans/FLP10055_son_jarocho_fandango.pdf) supplies the relevant plucked-string, pandereta, and zapateado performance context. The choice to suggest that motion with the existing nylon-guitar, rim, and shaker voices is an arrangement decision, not an assertion that those synthesized timbres are traditional instruments. The [University of Washington listening guide](https://courses.washington.edu/sabor/Hum%20206/westListening.shtml) identifies La Bamba as usually duple; that supports the common-time chart rather than applying a generic compound-meter jarocho rhythm.

## Checks

`tests/la-bamba.test.ts` checks the source pickup, tied onset, triplet phrase, repeated copla and exact breath, cadence, 220 ms input floor, 25-key fit for both playable parts, the simpler quarter-note Backing reduction, chord-tone backing, finite drum bounds, and supported voice assignments. These structural checks do not replace a musician's listening review of the final synthesized playback.
