# Classical arrangement sources and decisions

These eleven tracks now have independently authored automatic `backingNotes`.
The harmonic `chords` map supports the simpler playable backing course; it no
longer determines the automatic piano performance. Melody note onsets and held
lengths describe the score. Gain, attack and sounding length only shape the
performance and never move the judgement clock.

All eleven use the piano core (`felt-piano` / `bed-felt-piano`). Normalized
expression in `classicalNotation.ts` is multiplied by the calibrated linear
note level 0.05. Bass and inner voices sit below the lead. Dynamics interpolate
between authored phrase points, with no random timing or rubato.

| Track | Excerpt / chart unit | Result and source |
|---|---|---|
| Ode to Joy | Opening 8-bar period; quarter = 96; 32 beats | Melody checked against the first eight soprano bars of [Peter Chubb’s public-domain SATB notation](https://www.mutopiaproject.org/ftp/BeethovenLv/ode/ode.ly), transposed G to C. Retains its dotted cadences. New piano reduction with a question/answer shape, connected inner voices and a brief D7 leading to the final G7–C cadence. The F-sharp is explicitly declared as an editorial secondary dominant. This is a new reduction of the theme, not a transcription of the orchestral accompaniment. |
| Twinkle, Twinkle | Complete 12-bar melody; quarter = 100; 48 beats | Melodic reference: the traditional theme preserved in [Mozart K.265’s theme score](https://commons.wikimedia.org/wiki/File:Mozart_K_265.jpg), with [Morgan’s manuscript provenance](https://www.themorgan.org/exhibitions/online/mozart/418). Pairs of source 2/4 bars are grouped into four-quarter chart bars; decorative closing notes and repeats are reduced to the familiar nursery-rhyme verse. Preserves its I/IV/V harmony. New restrained piano voicings support each phrase; the final cadence breathes. No claim is made that a traditional melody has one mandatory accompaniment. |
| Amazing Grace | Complete NEW BRITAIN verse; quarter = 84; pickup 1; 45 beats | Restores the third-phrase contour and its subdivisions, plus the four-beat tied final G. Melody and bass refer to the [NEW BRITAIN notation](https://www.mutopiaproject.org/ftp/Anonymous/new_britain/new_britain.ly), typeset by Steve Dunlop, using the Excell harmonization lineage; middle voices are a new economical piano realization. Historical context: [Southern Harmony](https://www.ccel.org/ccel/w/walker/harmony/cache/harmony.pdf), NEW BRITAIN, printed p.8. |
| Scarborough Fair | One familiar Dorian verse; quarter = 92; 63 beats | Restores the recognized A–A–E–E opening, upper second phrase, dotted figure and phrase-spanning holds. Melody checked against [Jim Paterson's published score and MIDI](https://www.mfiles.co.uk/scores/scarborough-fair.htm), transposed D to A. Its eighth-note durations are expressed as quarter-note chart units grouped in three; this preserves their exact relative timing. Includes the reference's twelve-beat final held tonic. The modal piano accompaniment is newly written. Other traditional variants are not declared incorrect. |
| Greensleeves | Complete 8-bar verse; eighth = 112; pickup 1; 49 beats | Restores the dotted-eighth/sixteenth figures, the dominant first ending and the raised-sixth approach in the second ending. Source variant: [Steve Dunlop's public-domain notation](https://www.mutopiaproject.org/ftp/Traditional/greensleeves/greensleeves.ly), transposed E minor to A minor. The accompaniment is a new piano realization of that variant's bass/harmonic outline. Ends with the written eighth rest. |
| Für Elise | Pickup, first strain and its first ending; eighth = 84; 24 beats | Exact first-strain right and left hands from [Breitkopf & Härtel 1888, transcribed by Stelios Samelis](https://www.mutopiaproject.org/ftp/BeethovenLv/WoO59/fur_Elise_WoO59/fur_Elise_WoO59.ly). The first ending is a quarter note (2 chart beats), completing the missing pickup without an invented extra beat. The opening is unaccompanied. Left-hand A2–E3–A3 and E2–E3–G-sharp3 gestures precede the right-hand fills and then rest. Pedal resonance lifts before the next harmony and is clipped at the excerpt ending. |
| Londonderry Air | First 8-bar strain; quarter = 72; pickup 1.5; 32 beats | Melody read from George Petrie's *Ancient Music of Ireland* (1855), original E-flat, transposed to C and placed one octave higher. Restores the three-eighth-note B–C–D pickup and recognizable phrase. Source scan: [Petrie 1855 first-print score](https://commons.wikimedia.org/wiki/File:Londonderry_Air,_first_print_1855,_sheet_music_edited_by_George_Petrie.jpg). Accompaniment is a newly authored piano arrangement with inversions and a passing E-major dominant of A minor. Final melody C lasts 2 beats followed by a half-beat rest before the omitted next pickup. |
| Minuet in G | Complete 16-bar A section; quarter = 100; 48 beats | Main right-hand notes and the actual left-hand line from the [Bach-Gesellschaft-based transcription by Allen Garvin](https://www.mutopiaproject.org/ftp/BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.ly). Retains the D half cadence at bar 8 and continues to G at bar 16. Editorial/optional mordents and the grace note at bar 8 are omitted from the graded part; no written main-note rhythm is flattened. |
| Gymnopédie No. 1 | Source bars 3–12; quarter = 60; 30 beats | Two introduction bars precede the complete first statement, including the four-bar tied F-sharp. Melody enters at chart beat 7, on beat 2 of its bar. Exact bass and middle chord voicings from the [Dover/original-edition transcription by Evin Robertson](https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.ly). Chords enter on beat 2 and hold through beat 3; there is no beat-3 reattack. |
| Canon in D | First 8 bars of Violin I after its entrance, plus a held tonic close; quarter = 56; 36 beats | Uses the quarter-note statement and real following quaver variation over a synchronized 8-note ground. Violin II and III enter 8 and 16 chart beats later; their written parts are rendered on piano. Source: [Canon per 3 Violini e Basso](https://www.mutopiaproject.org/ftp/PachelbelJ/Canon_per_3_Violini_e_Basso/Canon_per_3_Violini_e_Basso-lys/), Michael Fischer v. Mollard, 2015, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), based on IMSLP. Adaptation: omits the opening two bass-only bars and supplies one held tonic bar on the source's next D to close the learning excerpt. |
| Jesu, Joy of Man's Desiring | First 8-bar ritornello and the first pulse of bar 9; triplet eighth = 176; 75 beats | Replaces the invented loop and fixed chromatic thirds with the actual Violin I line, Violin II, viola and continuo. Source: Bach-Gesellschaft, 1884, printed p.229, [full score](https://s9.imslp.org/files/imglnks/usimg/6/65/IMSLP01405-BWV0147.pdf). The 9/8 Violin I notes align with the other parts' 3/4 quarter pulses. Violin II's dotted eighths and sixteenths last 2.25 and 0.75 chart units respectively. The C-sharp in the continuo is retained. All graded melody notes are monophonic; the independent source voices supply the counterpoint automatically. |

## Verification

`tests/musical-classics.test.ts` guards source pitch sequences, Für Elise's
unaccompanied spans and short ending, Satie's delayed entrance and ties, the
Minuet's complete answer, the folk and hymn contours, the Canon ground and
entrances, and Bach's ritornello. Every written pitch must fit the declared key
or its explicit borrowed pitch classes. At the authored default practice
speeds, successive graded attacks are at least 220 ms apart and the default
approach window contains no more than eight targets. Harmonic maps and parts
must finish together without overrunning their declared excerpt.

The score comparisons above are notation checks. Rendered audio levels and
real application playback are verified separately; a score or waveform review
is not a claim of human listening.

Independent BGA cross-check: Jesu’s bar8 remains G-major arpeggiation throughout;
the simplified Backing map does not add a D7 there. Its bar6 last pulse retains
Em7 over D. Playable bass follows the continuo pitch classes in a compact register;
three regular pulses simplify the last bar’s rest/fill rhythm.
