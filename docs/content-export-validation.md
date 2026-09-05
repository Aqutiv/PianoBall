# Content export implementation validation

Validated 5 September 2026 in the PianoBall browser repository on Windows,
Node 24.18.0.

## Review reference and scope

The validation below was captured from the implementation working tree, based
on commit `af1bdf970729e342983e02d3bc451017e28e432d`. The tree was clean before
implementation. The review branch is `codex/shared-content-export-v1`.
No deployment has been performed.

| Files changed | Purpose |
| --- | --- |
| `src/content/export.ts` | Pure source-role compiler and authored-source validation |
| `src/content/schema.ts` | V1 types, native limits, metadata and manifest validation |
| `scripts/export-content.mjs` | Node 24 headless CLI and extensionless TS resolution |
| `scripts/content-files.ts` | Provenance, output guard, exact-byte digest and atomic publication |
| `src/audio/written.ts`, `src/audio/bed.ts` | Shared written-note constants/event helper and wash exclusion |
| `tests/content-export.test.ts`, `tests/content-files.test.ts` | 107 export, scheduler-parity, boundary, byte and CLI tests |
| `.github/workflows/deploy-pages.yml` | Test before building, export after build and before upload |
| `package.json` | `npm run export:content` command |
| `README.md`, `docs/content-export.md`, this file | Authoring/consumer contract and validation report |

There are no source library membership, progression, ID or musical-authoring
edits. The desktop repository is unchanged. Generated JSON remains ignored
under `dist/`; there is no second track list or starter-header generator here.

## Artifact

Run `npm run build`, then `npm run export:content`. The normal Pages workflow
does this automatically after its tests, before uploading the same `dist`
artifact and deploying it. See [the contract](content-export.md) for details.

| Property | Result |
| --- | --- |
| Schema | 1 |
| Melody courses | 14 |
| Chords courses | 17 |
| Catalogue bytes | 616,525 |
| Manifest bytes | 277 |
| sourceCommit | `af1bdf970729e342983e02d3bc451017e28e432d` |
| sourceDirty | `true` |
| SHA256 / revision | `2dc06f661312474b6ad6921617f12f6b158d42e81a6a3e2fc859f533cc9cd454` |

Local files:

- `dist/content/v1/manifest.json`
- `dist/content/v1/catalog.2dc06f661312474b6ad6921617f12f6b158d42e81a6a3e2fc859f533cc9cd454.json`

Intended published URLs for these exact bytes:

- [Manifest](https://aqutiv.github.io/PianoBall/content/v1/manifest.json)
- [Catalogue](https://aqutiv.github.io/PianoBall/content/v1/catalog.2dc06f661312474b6ad6921617f12f6b158d42e81a6a3e2fc859f533cc9cd454.json)

The digest is for this local dirty build. Committing the implementation changes
provenance, so a subsequent clean CI build will correctly have a different
digest and catalogue filename.

## Evidence

- `npm run typecheck`: passed.
- `npm test`: **694 tests passed across 36 files**.
- The final compiler review was followed by another production build and all
  **107 content tests passing**.
- `npm run build` followed by `npm run export:content`: passed, with both feed
  files present under the rebuilt `dist/content/v1`.
- Independent temporary-directory exports produced byte-identical catalogues
  and manifests. Tests independently hashed written UTF-8 bytes and checked LF,
  final LF, absence of BOM, byte limits and changed-note digest changes.
- A clean temporary Git checkout (including spaces in its path) ran the actual
  CLI twice and remained clean. The headless CLI ran without DOM/Web Audio or
  installed browser dependencies. Invalid output locations were rejected.
- All 31 courses' exported backing events matched events reaching the real
  browser `ChordBed` scheduler under a fake audio clock. Checks include
  pickup/meter phase, simultaneous events, chord-role bass/melody splitting,
  long pad tails and plucked-voice wash suppression.
- Browser smoke check on the production build, in an isolated Chrome context:
  Melody showed 14 courses, Chords 17; First Light ran to the result screen;
  Ground started with audio and backing schedulers running. Computer-keyboard
  note events were dispatched through the existing debug input API. Captured
  audio-pad calls had finite values and the written melody gain of 0.05.
  No browser console errors or warnings were reported. This was a functional
  smoke check, not a listening assessment or native sound-parity claim.
- Vite preview served the built manifest at
  `http://127.0.0.1:4179/content/v1/manifest.json` with **HTTP 200, no redirect**.
  Its referenced catalogue returned **HTTP 200**, `application/json`,
  **616,525 bytes**, **31 entries** and the SHA256 above. The hash was computed
  independently from the HTTP response bytes with redirects disabled.
- `D:\Projects\PianoBallDesktop\build\xps\Release\CatalogTests.exe`
  accepted the actual generated catalogue:
  `Validated 31 exported course entries`, followed by
  `PASS: catalogue schema, notes, source validation, SHA256 and corrupt-cache fallback`.
- The exact public manifest URL was fetched with redirects disabled:
  **HTTP 404, no Location header**. This implementation is **built locally,
  not deployed**; a public catalogue/hash check cannot pass until publication.

## Compatibility and remaining desktop checks

Relative to the historical desktop prototype, written melody backing now uses
the browser's **gain 0.05 / attack 0.02 beats**, instead of 0.075 / 0.01.
Wash events are excluded when the authored backing voice has `spec.pluck`.
The browser scheduler reuses the extracted helpers with unchanged behavior.
Role order, original scale/voice IDs, MIDI pitches, pickup phase and event
tails are preserved. No new optional metadata or humanization is exported.

The v1 feed and existing native reader are compatible; no consumer code change
is required for these exports. Native sound/effect/feel parity remains separate
work.

After the reviewed implementation reaches Pages, re-fetch both exact public
URLs, require HTTP 200 without redirects and independently verify the digest.
Then check ordinary native startup, unchanged-digest cache reuse, and offline
startup. Those cross-application startup checks remain pending; `--catalog`
and `--benchmark` bypass online sync. Linux execution also remains for the
existing Node 24 Pages CI run.
