// Generates the link-preview (Open Graph) card from the approved master artwork.
// Run with npm run og after replacing assets/og-source.png.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'assets/og-source.png');
const target = resolve(root, 'public/og.jpg');

if (!existsSync(source)) {
  throw new Error('Missing master card: ' + source);
}

// 1200x630 is what every scraper crops to; anything else gets letterboxed or
// centre-cropped by the platform instead of by us.
//
// JPEG rather than PNG for two reasons: the art is a photographic render, so
// PNG costs about six times the bytes for no visible gain, and workbox
// precaches `**/*.png` from the build — a .png here would ship a megabyte of
// marketing art into every player's service worker cache, which they would
// never look at.
const info = await sharp(source)
  .resize(1200, 630, { fit: 'cover' })
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(target);

console.log('wrote ' + target + ' (' + info.width + 'x' + info.height + ', ' + info.size + ' bytes)');
