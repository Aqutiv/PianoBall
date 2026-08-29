# PianoBall

**[Play PianoBall online →](https://aqutiv.github.io/PianoBall/)**

Pinball with thirty-two flippers.

Your MIDI keyboard *is* the bottom of the table. Every key is a paddle: how hard
you press decides how far the ball flies, and **where on the key you hit it**
decides where it goes. Pitch bend tilts the table. Sustain slows time. Every
surface on the playfield is tuned to a note, so a good run is also a piece of
music.

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in **Chrome or Edge** (Safari has no Web MIDI).
No hardware? The computer keyboard and touch both work — see *Controls*.

## How it plays

- **The keybed is a crown.** A ball that lands on it always rolls towards an
  outlane; you get between 1.2 and 3 seconds to find the right key, depending on
  where it lands. Dead centre buys you the most time.
- **Aim with the key, not just the note.** Striking the left of a key throws the
  ball left, the right throws it right — roughly 60° of aim per key, on top of
  the 25° lean that the outer keys already have towards the middle.
- **Everything is tuned.** Bumpers, targets, rollovers and the spinner each own a
  note from the table's scale. Hitting one sounds it. *Playing* that note
  energises it for a moment: it glows, kicks harder and scores double. Play a
  chord and three of them light at once.
- **Multipliers reward musicianship.** Groove (landing hits on the beat),
  Resonance (hitting energised elements), Combo (chaining without returning to
  the keybed) and Multiball all stack.
- **Clear the scale-degree bank** — the five drop targets, one per note of the
  scale — to start multiball.

## The music

Everything is in **D**; what changes is which D. Settings → Audio → **Scale**
picks from eight — minor and major pentatonic, dorian, natural minor, lydian,
mixolydian, blues and kumoi — or **Random each game**, which draws a fresh one
every time you start. Whatever is playing is named under the score.

Three things follow from the choice:

- **The playfield retunes.** The bumpers, targets, rollovers and spinner are
  tuned by hand as a *contour* rather than as fixed pitches, so each is carried
  into the new scale by scale degree instead of by pitch. The low slings stay
  low and the five drop targets stay five distinct notes, whatever you pick: the
  bank reads D F G A C in minor pentatonic and D E G# A C# in lydian, and no
  element moves more than two semitones from where it was authored.
- **The chord bed follows.** Each scale carries its own eight-chord loop written
  in its own degrees, so the backing is idiomatic to the mode rather than
  transposed into it.
- **Assist snaps to it.** With *Snap off-scale notes into the table's key* on,
  anything you play is pulled to the nearest tone of whichever scale is running.

The bed changes chord every two bars — five seconds at the table's 96 bpm — and
completing an objective pushes it on early. Each chord is re-voiced into the
octave nearest the one before it, so the progression walks by a semitone or two
instead of leaping most of an octave, while the bass still plays the true root
underneath.

## Controls

| | MIDI | Computer keyboard | Touch |
|---|---|---|---|
| Play a key | any key, velocity sensitive | `Z`–`M`, `Q`–`P` (`Shift` harder, `Alt` softer) | tap a key; nearer its front lip hits harder |
| Tilt the table | pitch bend | `←` `→` | — |
| Slow time | sustain pedal / button | `Space` | — |
| Shift an octave | your controller's octave buttons | `[` `]` | Settings |

`Esc` opens settings, `F3` shows the frame budget.

## Your controller

The app makes no assumptions about what your hardware sends. It enumerates Web
MIDI devices, and **Settings → MIDI monitor** shows the raw message stream so you
can see exactly what your octave, bend and sustain controls transmit.

Two details worth knowing:

- **Octave buttons transpose silently.** Most controllers just send different
  note numbers. A note arriving outside the mapped window re-latches it by whole
  octaves automatically; if the on-screen keybed ever looks out of step, play a
  note at either end, use the ± buttons in settings, or run **Calibrate**.
- **Mini keys have a narrow velocity range.** The default curve leans soft with a
  ceiling below 127. Settings shows a live histogram of how hard you actually
  play, so the curve can be matched to you rather than guessed.

Calibration (press your lowest key, then your highest) supports anything from 25
to 88 keys; the keybed rebuilds around whatever you have.

## Design notes

**Physics is custom, and continuous.** Balls are the only dynamic bodies, and
everything they touch is a capsule, a disc or an arc — which is all a pinball
table needs. The solver advances to the earliest time of impact and never past
it, so tunnelling is impossible by construction rather than by tuning. The test
suite fires 400 balls at up to 46,000 units/s at a one-unit-thick wall and drives
another 200 through a half-unit plate at 625 units per step; none get through.
Fixed 240 Hz stepping with a seeded RNG makes runs reproducible, which the
determinism test checks over 10,000 steps.

**Every key gets its own slice of the keybed.** Black keys own their width and
the white keys either side own what is left, so the 32 striking slots tile the
table exactly — the ball's x position always names one specific key to press.
The keys are drawn as a real piano on top of that, blacks raised and flush at
the front.

**Friction has two regimes.** Sliding friction scales with how hard the contact
is; a ball merely resting on a surface is rolling, and rolling resistance is
almost nothing. Without that split the ball welds itself to the keybed instead
of rolling down the crown.

**Rendering is flat 2D lit as 2.5D.** The simulation never leaves the plane; a
pinhole camera raked to 62° is the only place depth exists. Objects with height
draw their own extruded side walls through that projection. The playfield is
baked once into an offscreen canvas, emissive work goes to its own layer, and
bloom is two cheap downscales rather than a real blur — about 4.6 ms a frame at
2560×1440@2×, 8 ms with six balls and full particles.

**Audio is hand-built Web Audio**, scheduled straight against `currentTime` with
no lookahead queue, so the gap between pressing a key and hearing it is as short
as the hardware allows (~10 ms measured). Velocity drives loudness *and*
brightness; the reverb is a procedurally generated impulse; only the slow chord
bed is scheduled ahead.

**Impacts are never quantised.** Only the *bonus* is judged against the beat
grid, so the sound stays locked to what is on screen while still rewarding
playing in time.

## Layout

```
src/
  core/      loop, event bus, seeded RNG, storage, math
  physics/   vec2, colliders, swept collision, spatial grid, world solver
  midi/      Web MIDI, note→lane mapping, velocity curves, keyboard fallback
  audio/     engine (graph + voices), music theory, director
  game/      game state, keybed, key layout, scoring, tilt, table + elements
  render/    raked camera, baked playfield, elements, particles, bloom
  ui/        HUD, overlay, settings, MIDI monitor
tests/       sweep math, tunnelling, determinism, key layout, mapping, music
```

## Scripts

```bash
npm run dev        # dev server
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build (installable PWA)
npm run icons      # regenerate app icons
```

## Known limits

- **Safari has no Web MIDI.** The keyboard and touch paths are load-bearing, not
  a nicety, and the app says so up front.
- The playfield is portrait. On a landscape display the margins become the
  cabinet, with a piano roll of your own playing scrolling up both sides.
