# PianoBall

**[Play PianoBall online →](https://aqutiv.github.io/PianoBall/)**

Your MIDI keyboard, three ways.

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in **Chrome or Edge** (Safari has no Web MIDI).
No hardware? The computer keyboard and touch both work — see *Controls*.

Everything shares one machine: the same synth, the same eight scales, the same
raked 2.5D table, the same thirty-two keys along its near edge. What changes is
what the keys are *for*.

---

## Freestyle

Play for the sound of it. No ball, no score, nothing to lose.

The playfield is given over to what your hands are doing. A note throws a bloom
off its key and a ribbon up the table, sized by how hard you hit it and coloured
by its pitch. Hold a key and a column of light stands over it, breathing at the
tempo. **A chord draws itself**: a polygon whose corners are its pitch classes,
turned to where its root sits on the circle of fifths, with every interval in
the chord drawn as a line between two corners. The same chord always draws the
same figure, because the figure *is* the chord — and it draws whether or not the
app can put a name to it. Three notes are enough; a cluster nobody has a word
for still gets its shape, just without a label.

Naming covers the vocabulary you would expect to find on a lead sheet: triads,
sixths, all seven of the common sevenths, and extensions up to the thirteenth
including the altered dominants. A fifth left out of a voicing is understood
rather than fatal, and the note in the bass decides the readings that pitch
classes alone cannot — which is what separates C6 from Amin7, or names which of
a diminished seventh's four identical faces you are playing.

Repetition sharpens everything. Hit the same note twice inside half a second and
the bloom grows spokes and tightens; keep insisting and it goes from a soft ring
to a star. Playing on the beat flashes the whole field. None of it is scored —
it is just that the field can tell the difference.

This is also the one mode where **pitch bend and the mod wheel do what their
names say**. Bend shears the field sideways as it bends the sound; the mod wheel
waves it as it opens the filter. Range and destination are in Settings.

**Nothing is corrected here.** The assist that snaps off-scale notes into the
key belongs to the pinball table; Freestyle plays exactly what you press, so a
note from outside the scale is a note from outside the scale.

Key, scale, instrument, the backing bed and the size of the room are all on
screen, because having to leave what you are playing in order to change what you
are playing it on is the opposite of freestyle. **Random** is one of the scales,
and the die beside it draws again; whatever it lands on is named underneath.
**The bed starts off** — you came here to make your own sound, so the backing is
offered rather than assumed.

**Twenty-four instruments and fourteen backings**, grouped the way the rhythms
are. The keys can be a Rhodes, a drawbar organ, a choir, a music box, a tubular
bell or a supersaw; the bed under them can be strings, a nylon guitar, an organ
or a glass pad. None of it is sampled — a bell is inharmonic partials dying at
their own rates, and the Rhodes tine is one oscillator bending another. The
first entry in each list is the sound the app has always made, and it is where
both start.

**Choosing** is Freestyle's alone. Pick a choir here and Pinball still sounds
exactly as it did, and so does every tune in PlayTune — which has instruments of
its own, authored into the charts rather than picked. Either way the rule is the
same: a mode hands the instruments to the synth on its way in and puts the
originals back on its way out, so nothing you choose here follows you anywhere.

## Pinball

Pinball with thirty-two flippers, unchanged.

Every key is a paddle: how hard you press decides how far the ball flies, and
**where on the key you hit it** decides where it goes. Pitch bend tilts the
table. Sustain slows time. Every surface on the playfield is tuned to a note, so
a good run is also a piece of music.

- **The keybed is a crown.** A ball that lands on it always rolls towards an
  outlane; you get between 1.2 and 3 seconds to find the right key, depending on
  where it lands. Dead centre buys you the most time.
- **The table tells you which key.** Thirty-two flippers is only playable if you
  can see which one is yours, so the key a falling ball is heading for lights up
  and names its note, with the flight drawn in behind it. The hint is silent
  rather than wrong: while anything solid is still in the way, where the ball
  ends up is not ballistics, and nothing is shown.
- **Hold the key to catch it.** A key already down when the ball settles on it
  cradles the ball instead of batting it, and the throw happens when your finger
  lifts. One at a time, and only for a moment — but it turns finding the right
  key from a countdown into a decision.
- **Aim with the key, not just the note.** Striking the left of a key throws the
  ball left, the right throws it right — roughly 70° of aim per key, on top of
  the 13° lean that the outer keys already have towards the middle. The throw
  answers the ball as well as the finger: what a key gives back is the speed the
  ball arrived with, and how much of it comes back is what pressing harder buys.
- **Press velocity picks a layer.** Soft reaches the resonance arc, medium the
  drop-target bank, hard the dome — and a ball returned hot off a rally carries
  its own speed round the orbit.
- **Everything is tuned.** Bumpers, targets, rollovers and the spinner each own a
  note from the table's scale. Hitting one sounds it. *Playing* that note
  energises it: it glows, kicks harder and scores double, and it stays lit for
  as long as you hold the note down.
- **Multipliers reward musicianship.** Groove (playing on the beat), Resonance
  (hitting energised elements), Combo and Multiball all stack. A combo survives
  the ball coming back to the keybed and lapses only when play goes quiet, so
  what it measures is a rally rather than a single trip up the table.
- **Clear the scale-degree bank** — the five drop targets, one per note of the
  scale — to start multiball. Clear the five-note arc across the middle for
  resonance.

## PlayTune

Learn a melody. The game plays the chords; you owe it the tune on top.

Auras fall down the lane belonging to the key they are due on. Press the key as
one arrives: on time it bursts into light, late or early it still counts for
less, and one you never reach **shatters**. There is no failing — a tune always
plays to its last bar, because the point is to have played it.

Fourteen tunes, unlocked in order, from three notes on the beat to Bach in
continuous quavers:

| | Tune | Teaches |
|---|---|---|
| 1 | First Light | Three notes, one to a beat |
| 2 | Ode to Joy | Neighbouring keys, one step at a time |
| 3 | Twinkle, Twinkle | Jumping a fifth and landing on it |
| 4 | Amazing Grace | Counting in three, starting before the bar |
| 5 | Scarborough Fair | A minor mode that is not quite minor |
| 6 | Drift | Holding a key for the whole tail |
| 7 | Greensleeves | A lilting six, and a note from outside the key |
| 8 | Für Elise | Alternating semitones at speed |
| 9 | Londonderry Air | A phrase spanning more than an octave |
| 10 | Minuet in G | Running quavers between the beats |
| 11 | Gymnopédie No. 1 | Waiting, and coming in exactly on time |
| 12 | Two Hands | Two notes at once, on a tune you already know |
| 13 | Canon in D | Holding a long form as it doubles in speed |
| 14 | Jesu, Joy of Man's Desiring | A line that never stops, with a voice under it |

The classics are public-domain melodies; the three originals sit where a new
mechanic has to be introduced on something you have no expectations about.
Charts are written around middle C and **transposed by whole octaves onto
whatever keyboard is plugged in** — a tune too wide for your controller says so
on its card rather than failing when you press play.

**Each tune brings its own instruments**, and the song card names them before
you start. Für Elise is a felt piano playing both hands, Twinkle is a music box
over a harp, Amazing Grace is a pipe organ with a choir under it, and the Minuet
gets the clavinet because it is the nearest thing in the bank to a harpsichord.
The rule is that a tune sounds like something else only when the piece itself
names an instrument — which is why First Light and Two Hands, PianoBall's own
tunes with no tradition to answer to, still sound exactly like PianoBall. Where
two tunes are the same instrument they say so: Für Elise and the Gymnopédie are
both solo piano, and inventing a difference between them would be dressing them
up rather than playing them.

The *rhythm* was already theirs. Each chart says how the bed plays its chords —
a waltz in three, the lilting six of Greensleeves, Bach's nine, the broken left
hand Für Elise and the Minuet run on — and none of it is a drum machine. There
are no drums in PlayTune, because a kick under a Gymnopédie is a costume.

Passing a tune (accuracy above its own mark) unlocks the next and records your
best. **Settings → PlayTune → Audio offset** exists because output latency is real.
You play in time with what you *hear*, and what you hear has already happened,
so an honest player lands late — raise the offset to compensate for that, lower
it if you are landing early.

---

## The music

**Key** and **Scale** are chosen in Settings → Audio, or on screen in Freestyle,
and the choice follows you across all three modes. Nine scales: major, minor and
major pentatonic, dorian, natural minor, lydian, mixolydian, blues and kumoi —
or **Random each game**, which draws a fresh one every time you start.

Plain **major** and **natural minor** are there for the beginning: set the key
to C and the scale to major, or to A and natural minor, and every white key
belongs and no black key does.

- **The pinball playfield retunes.** Its bumpers, targets, rollovers and spinner
  are tuned by hand as a *contour* rather than as fixed pitches, so each is
  carried into the new scale by scale degree instead of by pitch. The bank reads
  D F G A C in minor pentatonic and D E G# A C# in lydian, and no element moves
  more than two semitones from where it was authored.
- **The chord bed follows.** Each scale carries its own eight-chord loop written
  in its own degrees, so the backing is idiomatic to the mode rather than
  transposed into it. PlayTune replaces that loop with the tune's own harmony,
  in the tune's own key, without disturbing what you picked.
- **Assist snaps to it — on the table only.** With *Snap off-scale notes into
  the key* on, anything you play in Pinball is pulled to the nearest tone of the
  running scale. The other two modes ignore it on purpose: PlayTune takes the
  chart as the authority on what the note should be, and Freestyle exists so
  that nothing is corrected.

## Controls

| | MIDI | Computer keyboard | Touch |
|---|---|---|---|
| Play a key | any key, velocity sensitive | `Z`–`M`, `Q`–`P` (`Shift` harder, `Alt` softer) | tap a key; nearer its front lip hits harder |
| Bend | pitch bend | `←` `→` | — |
| Modulate | mod wheel (CC 1) | `↑` `↓` | — |
| Slow time (Pinball) | sustain pedal | `Space` | — |
| Shift an octave | your controller's octave buttons | `[` `]` | Settings |

Pinball also lends you the slow-motion meter automatically when a ball is coming
down fast, and burns it slower than the pedal does, so holding sustain always
still has something left in it.

On the home screen, `1` `2` `3` pick a mode and `Enter` plays the highlighted
one. `Esc` steps back — out of a screen, out of play, out to the menu.
`Backspace` starts again from the top — the tune you are on, from its count-in
and without going back through the song list, or the pinball run, from ball one. `F3` shows the frame budget.

## Your controller

The app makes no assumptions about what your hardware sends. It enumerates Web
MIDI devices, and **Settings → MIDI monitor** shows the raw message stream so you
can see exactly what your octave, bend and sustain controls transmit.

- **Octave buttons transpose silently.** Most controllers just send different
  note numbers. A note arriving outside the mapped window re-latches it by whole
  octaves automatically; if the on-screen keybed ever looks out of step, play a
  note at either end, use the ± buttons in settings, or run **Calibrate**.
- **Mini keys have a narrow velocity range.** The default curve leans soft with a
  ceiling below 127. Settings shows a live histogram of how hard you actually
  play, so the curve can be matched to you rather than guessed.

Calibration (press your lowest key, then your highest) supports anything from 25
to 88 keys; every mode's keyboard rebuilds around whatever you have.

## Design notes

**One shell, three modes.** `Shell` owns the canvas, the audio graph, the input
hub and the single 240 Hz loop for the life of the page, and lends them to
whichever mode is running. A mode may subscribe to anything it likes in `enter`
and must release all of it in `exit`; `ModeBase` makes that one line, and a test
enters and leaves each mode ten times and asserts the listener counts come back
to where they started. Nothing in the original build was ever torn down, because
nothing was ever left.

**Physics is custom, and continuous.** Balls are the only dynamic bodies, and
everything they touch is a capsule, a disc or an arc — which is all a pinball
table needs. The solver advances to the earliest time of impact and never past
it, so tunnelling is impossible by construction rather than by tuning. The test
suite fires 400 balls at up to 46,000 units/s at a one-unit-thick wall and drives
another 200 through a half-unit plate at 625 units per step; none get through.

**Every key gets its own slice of the keybed.** Black keys own their width and
the white keys either side own what is left, so the 32 striking slots tile the
keybed exactly — which is what lets the table name one key for a falling ball.
The pinball keybed stops short of the slingshots at either end, because a key
roofed by one has nowhere to throw. `KeyDeck` is that piano on its own; the pinball `Keybed` extends
it and adds the paddle each key drives, which is why Freestyle and PlayTune get
a real keyboard without a physics world behind it.

**Rendering is flat 2D lit as 2.5D.** The simulation never leaves the plane; a
pinhole camera raked to 62° is the only place depth exists. `Stage` owns that
camera, the layered canvases, the particle pool and the bloom — two cheap
downscales rather than a real blur — so all three modes composite identically. A
PlayTune aura four beats away is small and dim because it genuinely is further
up the table.

**Audio is hand-built Web Audio**, scheduled straight against `currentTime` with
no lookahead queue, so the gap between pressing a key and hearing it is as short
as the hardware allows (~10 ms measured). Bend and modulation are a
`ConstantSourceNode` and an LFO wired into every live voice's `detune`, which
means expression costs no per-frame JavaScript at all. Only the chord bed is
scheduled ahead, one bar at a time.

**Instruments are data, not code.** A voice is a few oscillator layers — a wave,
a ratio to the fundamental, a level, sometimes a decay of its own or a second
operator bending the first — over one filter and one envelope. That is the same
bargain the drum bank and the rhythm library already struck: thirty-eight
patterns and thirty-eight instruments between them, and one synthesis routine
each, because the character lives in a table you can read rather than in forty
branches you cannot.

**Two clocks, and only one of them is trusted for timing.** The game clock is
driven by requestAnimationFrame and multiplied by slow motion; the audio clock is
a hardware sample counter. Every PlayTune judgement is made against the audio
clock, and losing focus pauses the run rather than letting it carry on without
you.

**Impacts are never quantised.** Only the *bonus* is judged against the beat
grid, so the sound stays locked to what is on screen while still rewarding
playing in time.

## Layout

```
src/
  app/       shell, mode contract, registry, debug hook
  core/      loop, event bus, seeded RNG, storage, math
  physics/   vec2, colliders, swept collision, spatial grid, world solver
  midi/      Web MIDI, note→lane mapping, velocity curves, keyboard fallback
  audio/     engine (graph + synthesis), instrument and drum banks, rhythm
             patterns and box, music theory, shared state, chord bed
  game/      pinball state, key deck, keybed, key layout, scoring, tilt, table
  render/    stage, raked camera, keys, empty field, particles, bloom, theme
  modes/     pinball/  freestyle/  playtune/ (+ its chart, judge, library)
  ui/        HUD chrome, overlay screens
tests/       sweep math, tunnelling, determinism, key layout, music,
             mode teardown, charts, judging, progression
```

## Scripts

```bash
npm run dev        # dev server (set PORT to run a second one)
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
- PlayTune restarts a tune from the top rather than resuming mid-phrase. A tune
  picked up halfway through is not a tune you have played.
