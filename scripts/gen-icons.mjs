// Renders the app icons from an inline SVG. Run with `npm run icons`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/icons');

/** @param {number} inset fraction of the canvas left as safe-area padding */
const icon = (inset = 0) => {
  const s = 512;
  const p = s * inset;
  const w = s - p * 2;
  const u = (v) => (p + v * w).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="#0b1030"/><stop offset="0.55" stop-color="#05070f"/><stop offset="1" stop-color="#020309"/>
    </linearGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#57dcff"/><stop offset="1" stop-color="#a678ff"/>
    </linearGradient>
    <radialGradient id="ball" cx="36%" cy="28%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.3" stop-color="#dbe5ff"/>
      <stop offset="0.68" stop-color="#7182ab"/><stop offset="1" stop-color="#141a30"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%">
      <stop offset="0" stop-color="#57dcff" stop-opacity="0.55"/><stop offset="1" stop-color="#57dcff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <circle cx="${u(0.5)}" cy="${u(0.38)}" r="${(w * 0.42).toFixed(2)}" fill="url(#halo)"/>
  <g>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => {
      const kw = 0.116;
      const x = 0.09 + i * kw;
      // Keys fan outward, matching the crowned keybed in the game.
      const dip = Math.abs(i - 3) * 0.018;
      return `<rect x="${u(x)}" y="${u(0.62 + dip)}" width="${(w * (kw - 0.012)).toFixed(2)}" height="${(w * (0.29 - dip)).toFixed(2)}" rx="${(w * 0.016).toFixed(2)}" fill="#eef2ff"/>`;
    }).join('\n    ')}
    ${[0, 1, 3, 4, 5].map((i) => {
      const kw = 0.116;
      const x = 0.09 + (i + 1) * kw - 0.032;
      const dip = Math.abs(i - 2.5) * 0.016;
      return `<rect x="${u(x)}" y="${u(0.62 + dip)}" width="${(w * 0.064).toFixed(2)}" height="${(w * 0.17).toFixed(2)}" rx="${(w * 0.012).toFixed(2)}" fill="#0a0e1e"/>`;
    }).join('\n    ')}
  </g>
  <rect x="${u(0.09)}" y="${u(0.605)}" width="${(w * 0.82).toFixed(2)}" height="${(w * 0.022).toFixed(2)}" rx="${(w * 0.011).toFixed(2)}" fill="url(#neon)"/>
  <circle cx="${u(0.5)}" cy="${u(0.36)}" r="${(w * 0.155).toFixed(2)}" fill="url(#ball)"/>
  <ellipse cx="${u(0.45)}" cy="${u(0.31)}" rx="${(w * 0.05).toFixed(2)}" ry="${(w * 0.036).toFixed(2)}" fill="#ffffff" opacity="0.92"/>
</svg>`;
};

mkdirSync(outDir, { recursive: true });

const jobs = [
  { name: 'icon-192.png', size: 192, svg: icon(0.06) },
  { name: 'icon-512.png', size: 512, svg: icon(0.06) },
  { name: 'icon-maskable-512.png', size: 512, svg: icon(0.19) },
  { name: 'apple-touch-icon.png', size: 180, svg: icon(0.08) },
];

for (const job of jobs) {
  const buf = await sharp(Buffer.from(job.svg)).resize(job.size, job.size).png().toBuffer();
  writeFileSync(resolve(outDir, job.name), buf);
  console.log(`wrote icons/${job.name} (${job.size}px, ${(buf.length / 1024).toFixed(1)} kB)`);
}

writeFileSync(resolve(root, 'public/icons/icon.svg'), icon(0.06));
console.log('wrote icons/icon.svg');
