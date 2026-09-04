import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Dev-only sink for `window.__pianoball.shot()`: the page renders a frame and
 * POSTs the PNG here so it lands on disk. Lets the rendering be inspected
 * without a visible browser window.
 */
function shotSink(): Plugin {
  return {
    name: 'pianoball-shot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { name, data } = JSON.parse(body) as { name: string; data: string };
            const dir = path.resolve('.shots');
            fs.mkdirSync(dir, { recursive: true });
            const safe = name.replace(/[^a-z0-9_-]/gi, '_');
            const file = path.join(dir, `${safe}.png`);
            fs.writeFileSync(file, Buffer.from(data.split(',')[1] ?? '', 'base64'));
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: true, file }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

/**
 * A git command's output, or null where git cannot answer.
 *
 * A source tarball has no repository, a machine may have no git on it at all,
 * and a fresh clone may have no commits yet. None of that is worth failing a
 * build over, so every caller here degrades to saying less.
 */
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null;
  } catch {
    return null;
  }
}

/**
 * When this bundle was made, UTC `YYYY-MM-DD HH:MM`.
 *
 * Read once as this config loads, so `vite build` stamps the moment the bundle
 * was made and the dev server the moment it started. UTC rather than local: a
 * stamp that means a different hour on every machine cannot identify a build.
 */
const BUILD_DATE = new Date().toISOString().slice(0, 16).replace('T', ' ');

/**
 * How many commits are behind this build, or `local`.
 *
 * Note what this is not: a count of deployments. It counts commits reachable
 * from HEAD, so it reads lower on a branch than on main and can go backwards
 * between two builds. It is a rough "how far along", which is what the About
 * screen shows it as, and the commit below is what actually identifies the code.
 *
 * `actions/checkout` clones a single commit unless told otherwise, and on such
 * a clone this returns 1 rather than failing — a wrong answer that looks like a
 * right one. `deploy-pages.yml` therefore asks for the full history, and says
 * why. If that ever has to go back to a shallow clone, use `GITHUB_RUN_NUMBER`
 * here instead: it counts runs of that one workflow, so on Pages it is honestly
 * the nth build of the site.
 */
const BUILD_RUN = git('rev-list --count HEAD') ?? 'local';

/**
 * The commit this bundle was built from, short, or '' where there is no telling.
 *
 * `GITHUB_SHA` first: it is what the Pages workflow runs under, it needs no git
 * at all, and it is right even though that checkout is shallow. `git rev-parse`
 * second, so a local build says something useful too. Sliced rather than asked
 * for short, because `--short=7` returns more than seven characters when seven
 * would be ambiguous, and both sources should abbreviate the same way.
 */
const BUILD_SHA = (process.env.GITHUB_SHA ?? git('rev-parse HEAD') ?? '').slice(0, 7);

export default defineConfig({
  base: './',
  // Substituted into the bundle as literals; `src/env.d.ts` declares them and
  // `src/app/build.ts` is the only thing that reads them. The JSON.stringify is
  // load-bearing rather than decorative: Vite injects a bare string define as
  // code, so without it `__BUILD_SHA__` would compile to an identifier.
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    __BUILD_RUN__: JSON.stringify(BUILD_RUN),
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
  },
  // PORT lets a git worktree run its own dev server alongside the main one.
  server: { port: Number(process.env.PORT) || 5173, host: true },
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 8192 },
  plugins: [
    shotSink(),
    VitePWA({
      // `prompt` rather than `autoUpdate`, because this is a game. autoUpdate
      // sets workbox's skipWaiting and clientsClaim, so a build deployed while
      // someone is playing takes over the moment it installs; prompt leaves the
      // new worker waiting until it is asked for. `src/app/updates.ts` does the
      // asking, and the About screen is where the player says when. A worker
      // that is never asked for still activates once the app is fully closed,
      // so nobody is stranded on an old build by declining.
      //
      // Registration is ours now too: `injectRegister` defaults to 'auto',
      // which does nothing once something imports the plugin's virtual module.
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'favicon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'PianoBall',
        short_name: 'PianoBall',
        description: 'Musical pinball played with a MIDI keyboard.',
        // Nocturne's void, matching the <meta name="theme-color"> in index.html.
        // These two disagreed for a long time; `applyTheme` now also rewrites
        // the meta tag at runtime, so a themed session tints the browser too.
        theme_color: '#04050d',
        background_color: '#04050d',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        start_url: './',
        scope: './',
        categories: ['games', 'music'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
