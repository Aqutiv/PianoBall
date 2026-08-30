import { defineConfig, type Plugin } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'node:fs';
import path from 'node:path';

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

export default defineConfig({
  base: './',
  // PORT lets a git worktree run its own dev server alongside the main one.
  server: { port: Number(process.env.PORT) || 5173, host: true },
  build: { target: 'es2022', sourcemap: true, assetsInlineLimit: 8192 },
  plugins: [
    shotSink(),
    VitePWA({
      registerType: 'autoUpdate',
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
