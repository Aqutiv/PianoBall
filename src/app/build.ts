/**
 * Which copy of PianoBall this is.
 *
 * Three fields, because each answers a question the others cannot: the commit
 * says exactly what the code is, the number says how far along it is, and the
 * time says when it was built — which is the one that tells you a service
 * worker is still handing out last week's bundle.
 *
 * The values arrive as compile-time constants; see `src/env.d.ts` for why they
 * are globals rather than a module, and `vite.config.ts` for where they come
 * from and how each degrades when git or CI cannot answer.
 */
export const BUILD = {
  /** UTC `YYYY-MM-DD HH:MM`. */
  date: __BUILD_DATE__,
  /** Commits behind this build, or `local`. */
  run: __BUILD_RUN__,
  /** Short commit, or '' where there was nothing to ask. */
  sha: __BUILD_SHA__,
} as const;

/**
 * The stamp as one line: `126 · 2026-09-04 12:30 UTC · 10e79b4`.
 *
 * The number and the commit are each dropped when unknown rather than printed
 * as an empty field, so a source tarball with no git says only when it was
 * built instead of saying it three times over.
 */
export function buildLine(): string {
  const parts: string[] = [];
  if (BUILD.run !== 'local') parts.push(BUILD.run);
  parts.push(`${BUILD.date} UTC`);
  if (BUILD.sha) parts.push(BUILD.sha);
  return parts.join(' \u00b7 ');
}
