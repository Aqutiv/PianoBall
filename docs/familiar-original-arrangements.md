# Familiar tunes, originals and studies: musical revision

Reviewed 8 September 2026. This document covers the five familiar additions,
First Light, Drift, Two Hands, Ground and Off the Beat. These are ten of the
21 currently listed unique tunes. Hopscotch and Three Ways Home are not current
course entries.

## Arrangement policy

The automatic accompaniment is a written performance part, independent of the
simpler Backing course. `familiarBacking.ts` and `originalBacking.ts` contain
explicit MIDI pitches, bass inversions, durations and phrase dynamics.
`performanceNotation.ts` expands those written events; it does not infer pitches
from chord symbols. Written strengths are normalized expressive values; the
expander scales them by0.05 into linear synthesizer gains. A D-major chord over F# remains D major, rather than being
misidentified as F# minor because the bass happens to be F#.

A richer performance is not necessarily busier. The round stays light, the
shanty stays modal, and Drift stays spacious. Articulation and gain alter the
sound without changing the player's note timing. All ten keep their existing
BPM, duration and pickup. Existing Melody onsets and note counts remain intact;
Two Hands changes the second voice's pitches and The Blue Danube corrects its
melody pitches. No additional ornaments become player targets.

Frere Jacques retains Music Box/Harp; Drunken Sailor retains Choir/Nylon Guitar;
Drift retains Glass/Glass Pad. Can-Can and The Blue Danube now have a Felt Piano
backing baseline; the waltz uses Felt Piano for its melody as well. First Light
and Two Hands explicitly use Grand Piano with Felt Piano backing. The
Entertainer keeps piano on both sides.

## Historical references and concrete decisions

| Tune | Source and retained music | Performance decision |
|---|---|---|
| Frere Jacques | Traditional complete eight-bar round melody, twice; [Capelle 1811 evidence](https://www.themorgan.org/music-manuscripts-and-printed-music/130800). The single melody is not presented as a full canon. | New light C/G bass and inner-voice answers; the two closing bell answers receive a C bass at beats30 and62, underneath the held melodic C. |
| Drunken Sailor | Terry, *The Shanty Book*, 1921, no.14, pp.30-31: [historical score](https://www.gutenberg.org/files/20774/20774-h/20774-h.htm). Verse, chorus, Dorian B natural, dotted chorus rhythm and repeat remain. | A newly authored Dm/C folk accompaniment; no claim of one canonical folk-song harmonization. Bass movement and stronger chorus responses add direction without introducing a minor-key leading note. The last bar lands and holds. |
| Can-Can | Offenbach, *Orphee aux enfers*, Heugel 1858, printed p.133: [score](https://s9.imslp.org/files/imglnks/usimg/0/07/IMSLP818377-PMLP24816-Offenbach_-_Orph%C3%A9e_aux_enfers_-_vs-FE-BNF.pdf). The eight-bar refrain is transposed D to C; grace notes remain omitted and the closed ending retained. | A piano galop arrangement with short complete chords, strong/weak pulse contrast, varied repeat dynamics and a final tonic landing. This is a voiced reduction, not the complete orchestral accompaniment. |
| The Blue Danube | Strauss, Spina 1867, first waltz on printed p.4: [composer's piano score](https://s9.imslp.org/files/imglnks/usimg/0/09/IMSLP311227-PMLP06843-Strauss%2C_Johann_Sohn-Op_314_Spina_19216.pdf). Corroborating pitch/bass reading: [Signature Sound Vienna research encoding](https://github.com/Signature-Sound-Vienna/Johann-Strauss-Sohn_Op314_Donauwalzer_Peters) of the historical Peters piano edition. Spina is the arrangement authority. | Corrected melody and chord identities; explicit source basses, chord inversions, rests and inner voices. The first bar is unaccompanied. The closing tonic is held instead of proceeding into Waltz2. |
| The Entertainer | Joplin, Stark 1902, first strain, original bars5-20; [original-edition record](https://www.loc.gov/item/2023864238/) and [public-domain reproduction notation](https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.ly). Chromatic pickups, syncopation and cross-bar ties remain. | Source bass/chord identities replace a generic root/fifth pattern, including F-E-Eb-D, G-A-B, C7, D7 and F/A to Fm/Ab. Octave doublings are selective and the bass register is compacted. The last bar is an editorial held tonic. Straight rhythm; no added swing. |

### Blue Danube transcription and octave choices

The prior bar6 leap to B was corrected to A; the C#-E-B arpeggios replace
C#-E-A. The second phrase now uses the source's D-to-D-octave responses, and
the closing phrase restores E-G-B, B-G#-A and F#-D-F#. This corrects pitch
classes as well as the relationship between melody and harmony.

The source upper line spans D4-F#6. To preserve the existing 25-key controller
contract, complete upper responses and the closing phrase are lowered one
octave at chart beats51 through58 and63 through95. The D-F#-A lead-ins at
48-50 and60-62 retain their register. This deliberate octave reduction keeps
each response and the cadence's internal contour, rather than folding only
individual high peaks. The resulting target range is D4-B5, fitting C3-C5
with a whole-octave shift. The first phrase retains its recognizable octave
leaps. Grace notes and chord/octave doublings are omitted throughout.

The automatic part retains the source bass register and inversions: D/F# at
beat51 and A7/E at beat75 are explicit. Bars18-21 are D major; bars22-25 are
Em7; bars26-27 A7; bars28-29 D; bar30 Em7; bar31 A7; bar32 D. The G-sharp approach at beat79 is declared as borrowed pitch class6. These are chord
identities, not instructions to replace the written bass with each chord root.
The source accompaniment drops an octave at bars20-21: F#2 with A2-D3-F#3
answers. Bars22-24 use G2 with B2-D3-E3; bar25 keeps the single E3-G3-B3
line without an upper doubling that would duplicate the reduced lead.
The held bar30 chord is G2-B2-D3-E3 and bar31 is A2-E3-G3 (the source
leaves its dominant third implicit). These automatic source registers are
independent of the playable course's compact controller range.
The final three-beat held tonic begins at93 and closes at96.

## Original compositions and studies

| Tune | Musical revision | Teaching constraint |
|---|---|---|
| First Light | Keep the held F over F major through beats12-16; Am enters at16. D and A can still carry the intended changes to F in the other held answers. Low bass and soft quarter-note chord pulses follow each phrase, ending together. | Existing small melody, held answers and timing remain. The card now describes the actual phrase-and-answer exercise. |
| Drift | Sustained, widely spaced bass/inner voices span four or eight beats with a gentle attack. Retain the F-to-E appoggiatura over Esus4; its separation from the low E makes that tension intentional and audible. | Existing long holds, glass timbres, melody and harmony remain. No new metronomic comping pattern is introduced. |
| Two Hands | Replace parallel fixed-semitone copies with an explicit D-Aeolian lower voice using consonant thirds, fourths and sixths. The accompaniment is softer and lower during the second statement. The final D/A dyad is grounded by D minor. | The original top melody, harmonic sequence, number of targets, simultaneous dyad limit and all onsets/durations remain. |
| Ground | C-C-G7-G7-C-G7-G7-C follows the melodic sentence and makes the F a dominant seventh; the last dominant resolves to C. | Still two harmonic families and one chord per bar. Repeated harmony need not force repeated bars to disappear from the independently written bass exercise. |
| Off the Beat | Bars5-6 now use C then F, following C/E then A/F in the melody. Short chord answers follow strong-beat basses, with a final ensemble chord. Both active studies declare C major directly and shape the automatic melody with quiet phrase dynamics and small articulation gaps. | The bass/answer rhythm lesson and existing melody remain. |

## Verification

`tests/musical-familiar.test.ts` checks the source-sensitive waltz landmarks,
Joplin's chromatic bass and inversions, the round's final tonic, Dorian color,
Two Hands' modal lower voice, the original/study harmony corrections,
expression bounds, duplicate-note avoidance and all ten parts' score lengths.
It also retains the 220ms minimum Melody attack interval, at most eight onsets
in a four-beat approach window, and at most two simultaneous Melody notes.
The Blue Danube is explicitly checked on the existing 25-key range.

This is source-notation, structural and musical regression verification. It is
not a claim that a pianist has listened to and approved a rendered performance.
Listening review should compare complete mixes and isolated parts, including
the waltz's octave reduction, dynamic balance, releases and held-note clarity.

Computer-played melodies in Backing mode now carry explicit phrase strengths and
articulation via `melodyPerformance`; held ties retain their full sounding length.
Both Drift roles use glass sounds, including its automatic sustained melody.
These performance annotations leave the graded chart and historical bests unchanged.

Production-synth balance review raised only Drunken Sailor’s nylon accompaniment
by2.5× (+7.96dB) against its sustained choir. This per-track gain calibration
does not alter the instrument globally or any player target.

Its separately rendered Backing-mode nylon melody receives a2× (+6.02dB)
local boost as well; the short string decay otherwise loses too much presence
against the player’s felt piano. Phrase dynamics are retained.
