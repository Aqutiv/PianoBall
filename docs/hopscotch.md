# Hopscotch composition review

Original music by PianoBall, replacing Drift in both courses. Source: [hopscotch.ts](../src/modes/playtune/library/hopscotch.ts).

D Dorian, 4/4, 84 BPM, 16 bars (45.71 seconds before count-in and release). Electric Piano melody, Felt Piano backing, synthesized Freestyle pop/offbeat drums with rim replies, a tom fill, and a final ensemble hit. No recordings or external compositions are used.

The D–F–A call returns with changed answers. B natural supplies the Dorian brightness, the bridge reaches C5, and the return changes the opening rhythm from 2–1–1 to 1–1–2. Bass notes alternate with compact chord answers; bars 2, 6, and 14 delay the answer until beat four. Bar 8 breathes for the fill; bar 16 lands and holds with the melody.

Level 2 and the 60% pass mark are retained in both roles. The melody uses 35 single-note attacks on whole beats, separated by at least 0.714 seconds, with a D4–C5 range. Backing uses 30 attacks, at most three simultaneous notes, each chord within an octave, and fits the standard 25-key keyboard. Two-, three-, and four-beat tails retain hold practice. It is more active than Drift's 12 attacks; the narrow range and simple timing keep it within the beginner course.

## Independent critique

Scores are from an independent sub-agent's score/arrangement review, not a rendered-audio audition. Columns separate playfulness and musicality; all scores are out of 10.

| Aspect | Round 1 playfulness | Round 1 musicality | Round 2 playfulness | Round 2 musicality |
|---|---:|---:|---:|---:|
| Melody | 7.5 | 8 | 8 | 8 |
| Rhythm | 8 | 8 | 8.5 | 8.5 |
| Backing | 7 | 8 | 8 | 8 |

The first round was too square: repeated held answers and an almost invariant bass/chord pattern. Because two scores fell below 8, a second composition round added rests and percussion replies in bars 2/6, delayed chord answers in bars 2/6/14, and the returning hook's rhythmic echo. Tempo and attack counts did not increase. The critic found these changes sufficient to clear every requested threshold.

The same backing-note score feeds automatic accompaniment in PlayTune and the player chart in Play Backing. Drum playback uses the tune transport, starts after count-in, and cancels on pause, restart, role/tune change, exit, and results. Old Drift access and its earned unlock credit migrate; old scores are not attributed to the new composition.

## Verification

All 969 tests passed across 48 files; the TypeScript/production build and 38-entry content export passed. The other 18 Melody arrangements match the independently exported main baseline byte for byte.

Two complete Chromium playthroughs drove the real input and audio engines. Melody scored 35 perfect notes (100%); Backing scored 60 perfect and 2 good (99.35%), with no missed or wrong notes. Each role scheduled exactly 194 drums and the other role's written notes (62 backing notes or 35 melody notes). No browser warnings or errors were reported. Unit tests cover pause, restart, role changes, count-in, stalled tabs, exit, and the final drum tail.

A 44.1 kHz stereo arrangement preview was rendered through the real Web Audio engine into the ignored local artifact `.shots/hopscotch.wav`. It uses the automatic Electric Piano melody voice plus the authored Felt Piano backing and drums, with 0.4 seconds of lead-in and a release tail. Duration is 48.71 seconds; measured peak is 0.302 full scale and RMS is 0.0357. This render is a listening aid; the game continues to synthesize and judge notes live.
