# Shared PianoBall content (schema v1)

PianoBall's existing PlayTune sources author both the browser library and the
Windows game's online catalogue. There is no separately maintained desktop
track list. The compiler is headless: it imports TypeScript data and pure music
functions, without constructing a game, AudioEngine, MIDI connection or browser.

## Build and publish

Use **Node 24.x**, the same runtime selected by Pages CI. No new packages or
native tooling are needed.

```sh
npm ci
npm test
npm run build
npm run export:content
```

Export defaults to `dist/content/v1` relative to this repository, regardless of
the invoking working directory. An explicit output path is relative to the
invoking directory:

```sh
npm run export:content -- --out-dir <temporary-directory>
```

An output inside a Git checkout must be ignored (as `dist/` already is).
The CLI rejects unignored output rather than letting its own files dirty the
next run. Keep generated JSON out of source control.

The existing `.github/workflows/deploy-pages.yml` runs tests, builds the site,
then exports once, **after Vite empties dist and before Pages uploads dist**.
Push the reviewed changes to `main` through the repository's normal process,
or dispatch that workflow on the intended revision. This implementation does
not itself push changes or publish a deployment. Existing Pages permissions,
concurrency, full-history checkout and deployment jobs remain intact.

The production URLs are fixed by the installed native client's reader:

- Manifest: <https://aqutiv.github.io/PianoBall/content/v1/manifest.json>
- Catalogue: `https://aqutiv.github.io/PianoBall/content/v1/catalog.<revision>.json`

Both must return HTTP 200 directly. Redirects, absolute manifest URLs, query
strings, custom-domain redirects and HTML SPA fallbacks are incompatible.
The native client uses WinHTTP and does not depend on the browser service
worker. These post-build JSON files remain outside the PWA precache.

## Add or edit a course

1. Edit the existing tune definitions in `src/modes/playtune/library/`.
   For Melody membership/progression, use `LIBRARY` in `library/index.ts`.
   For Chords, use `CHORD_CURVE` in `library/chordcurve.ts`, including its
   role-specific card, playable pattern and voice choices. Chord-only studies
   remain outside Melody.
2. Keep published IDs stable when changing titles, composers or teaching copy.
   Identity is the pair `(role, id)`; the wire ID has no role prefix.
   An ID shared between roles is valid; duplicates within a role fail.
3. Run the tests, build and export above. Resolve source-validator or wire-limit
   errors at their reported role/ID/field. Invalid data fails the whole export;
   courses are never clamped, silently dropped or truncated.
4. Review membership/order changes and publish with the normal Pages workflow.
   A native ordinary startup can then obtain the new catalogue without a
   desktop release.

The compiler reads each role's `order`, `tunes`, `chart`, `backing`, `card`
and `voices`. Order and membership must agree. It emits Melody followed by
Chords, retaining each authored progression; it never sorts titles or IDs.
All `ALL_TUNES` entries run through `validate` and `harmonyProblems`;
every `CHORD_CURVE` entry runs through `chordProblems` as well.

## Wire contract

Canonical interfaces and executable producer checks are in
`src/content/schema.ts`. Schema 1 stays compatible with the existing native
reader. Publish any incompatible future schema alongside v1 until the desktop
has migrated.

```ts
interface ManifestV1 {
  schemaVersion: 1;
  revision: string; // 64 lowercase SHA256 hex characters
  url: string;      // exactly catalog.<revision>.json
  sha256: string;   // exactly revision
}

interface CatalogV1 {
  schemaVersion: 1;
  sourceCommit: string | null;
  sourceDirty: boolean | null;
  entries: CourseEntryV1[];
}

interface CourseEntryV1 {
  id: string;
  role: 'melody' | 'chords';
  title: string;
  composer: string;
  bpm: number;
  beatsPerBar: number;
  pickup: number;
  root: number;
  scaleId: string;
  difficulty: number;
  teaches: string;
  pass: number; // fraction, not percentage
  voices: { keyVoicing: 'lead' | 'bed'; keys: string; backing: string };
  playerNotes: { beat: number; len: number; note: number }[];
  backingEvents: {
    beat: number; len: number; notes: number[]; gain: number;
    attack: number; part: 'chord' | 'bass' | 'wash' | 'melody';
    offset?: number;
  }[];
}
```

Every number must be finite and correctly typed; no numeric string coercion.

| Field | Producer/reader bounds |
| --- | --- |
| Entries | 1–512 total; unique role/ID |
| ID | 1–100 ASCII letters, digits, underscores or hyphens |
| Title | 1–256 UTF-16 code units |
| Composer | 0–256 UTF-16 code units |
| Teaching copy | 0–1,024 UTF-16 code units |
| Consumed strings | No characters below U+0020 |
| BPM | 20–400 |
| Beats per bar | 1–16; fractions allowed |
| Pickup | 0–16 and strictly less than beatsPerBar |
| Pass | 0.01–1 |
| Difficulty | Integer 1–10 on the wire; authored source retains 1–5 |
| Player notes | 1–20,000 per course |
| Backing events | 0–20,000 per course, required even when empty |
| Note/event beat | 0–65,536, nondecreasing; equal onsets allowed |
| Note/event length | 0.001–1,024 beats |
| Player/backing pitch and root | Integer MIDI 0–127 |
| Backing gain | 0–1, original normalized pad gain |
| Pitches per backing event | Producer 1–16; native also permits empty |
| Attack/optional offset | Finite nonnegative beats |
| Expanded notes | At most 250,000: player count + sum of backing pitch counts |
| Manifest bytes | At most 16,384 |
| Catalogue bytes | At most 8,388,608 |

Scale IDs must exist in `SCALES`. Voice IDs must exist in the selected lead/bed
bank and the accompaniment always names a bed voice. These are original source
identifiers (for example `ionian`, not its display label `major`).

## Musical meaning

All timing uses the authored beat unit, including attack. The chart begins at
zero, with bar lines at `pickup + n * beatsPerBar`. Player pitches come straight
from `role.chart(tune)` before octave fitting. Equal onsets remain separate
player notes. Count-in, latency, calibration, practice tempo, keyboard range
and device settings belong to playback.

Backing chord voicing resets for every course, then uses the browser's
`degreeToNote`, `chordNotes`, `voiceLead` and `compEvents`, including the
pickup-relative bar phase. Parts come from the role. A stable onset sort keeps
generation order for equal beats; overlapping events and long pad tails are
retained. `beat` already equals chord beat plus event offset: **do not add
offset a second time**.

`src/audio/written.ts` is shared with the actual `ChordBed` scheduler:

- Written melody notes use gain **0.05** and attack **0.02 beats**, each as a
  single-note event. The export labels them `part: 'melody'`; the scheduler
  retains its existing internal chord-pad event representation.
- A bed voice with a defined `spec.pluck` suppresses wash events, preventing
  the same plucked attack from sounding twice.
- The role's other parts and original gain values are preserved.

These correct two differences in the historical desktop export prototype,
which used melody gain 0.075/attack 0.01 and omitted the wash exclusion.
The digest therefore differs from the old prototype. The browser's musical
output is unchanged by extracting these helpers.

V1 is the deterministic written arrangement. RNG, humanization, roll, accent
variation, wall-clock scheduling and user settings are not materialized, and
no optional feel metadata is added. Native procedural gain scaling (currently
`clamp(gain * 4, 0.05, 0.55)`) belongs to the consumer and is not baked in.
The native parser currently ignores root/scale/voices/attack/part/offset and
provenance, but the export retains them for a future audio port. This feed does
not implement native sample banks, effects, feel, audio parity or Pinball.

## Bytes, provenance and publication safety

Serialize once with `JSON.stringify(catalog, null, 2) + '\n'`: UTF-8 without
BOM, two-space indentation, LF lines and one final LF. SHA256 hashes the same
Buffer that is written. The catalogue filename, revision and sha256 all agree.

The writer validates the complete catalogue and byte limits before creating
files, atomically writes the digest-named catalogue, reads its bytes back to
verify them, then atomically replaces the manifest. An existing digest-named
file with different bytes fails instead of being overwritten. Failures exit
nonzero, so Pages does not upload an incomplete artifact. The two files share
one artifact, but CDN edge caches can briefly disagree; the native client keeps
its last good catalogue if a fetch or validation fails.

Provenance is captured once. A full `GITHUB_SHA` takes precedence over Git HEAD;
local Git status supplies the dirty flag. Without Git, unknown values are null
(a valid CI SHA can still provide a known commit). Identical source and
provenance produce identical bytes. A commit or dirty-state change can
legitimately change the digest without a musical edit. There are no timestamps,
absolute paths or run IDs inside the hashed catalogue.

## Verification

`tests/content-export.test.ts` checks actual role membership, player parity,
every course's events against the real browser scheduler with a fake audio
clock, pickups, bass/melody splitting, wash filtering, sustained tails,
ordering and invalid wire/source boundaries. `tests/content-files.test.ts`
checks independent file hashes, byte caps, failure preservation, changed-note
digests and repeated CLI exports from a clean Git checkout whose path contains
spaces. The same tests run under Node 24 on Windows and in Linux Pages CI.
Linux execution is confirmed by CI, not by a local Windows pass alone.

After building and exporting, `npm run preview -- --host 127.0.0.1` serves
`http://127.0.0.1:4173/content/v1/manifest.json`. Fetch it and the referenced
catalogue with redirects disabled; require HTTP 200, parse JSON and independently
SHA256-hash the raw catalogue bytes. After deployment, repeat this at the exact
production URLs above, without a cache-busting query string.

Optional sibling-native check (not part of browser CI):

```powershell
$pianoManifest = Get-Content '.\dist\content\v1\manifest.json' -Raw | ConvertFrom-Json
$pianoCatalogPath = Join-Path (Resolve-Path '.\dist\content\v1') $pianoManifest.url
& 'D:\Projects\PianoBallDesktop\build\xps\Release\CatalogTests.exe' $pianoCatalogPath
if ($LASTEXITCODE) { throw 'The native catalogue reader rejected this export.' }
```

An available build may instead be under `build\Release`. No sibling checkout,
Windows executable or C++ toolchain is needed to compile or publish this feed.

After the deployed HTTP/hash check, exercise **ordinary** native startup, then
unchanged startup/cache reuse and offline startup. `--catalog` and
`--benchmark` bypass the online startup check. Do not edit the client's cache
or digest to simulate a successful update. These cross-application startup
checks remain pending until this feed is deployed.
