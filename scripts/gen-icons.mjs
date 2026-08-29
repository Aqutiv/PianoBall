// Generates every install surface from the approved master artwork.
// Run with npm run icons after replacing assets/app-icon-source.png.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = resolve(root, 'public/icons');
const source = resolve(root, 'assets/app-icon-source.png');

if (!existsSync(source)) {
  throw new Error('Missing master icon: ' + source);
}

const jobs = [
  { file: resolve(iconDir, 'icon-192.png'), size: 192 },
  { file: resolve(iconDir, 'icon-512.png'), size: 512 },
  // Apple touch icons do not reliably preserve transparency. Give that one
  // the game's backdrop while desktop/PWA icons keep their alpha channel.
  { file: resolve(iconDir, 'apple-touch-icon.png'), size: 180, background: '#04050d' },
  { file: resolve(root, 'public/favicon.png'), size: 64 },
];

for (const job of jobs) {
  let image = sharp(source).resize(job.size, job.size, { fit: 'cover' });
  if (job.background) image = image.flatten({ background: job.background });
  const info = await image
    .png({ compressionLevel: 9 })
    .toFile(job.file);
  console.log('wrote ' + job.file + ' (' + info.width + 'x' + info.height + ')');
}

// Maskable launchers may crop the icon to many shapes. Keep the complete
// illustration within the central safe area and extend the game backdrop out.
const maskSize = 512;
const artSize = 384;
const maskArt = await sharp(source)
  .resize(artSize, artSize, { fit: 'cover' })
  .png()
  .toBuffer();

const maskInfo = await sharp({
  create: {
    width: maskSize,
    height: maskSize,
    channels: 4,
    background: '#04050d',
  },
})
  .composite([{ input: maskArt, left: 64, top: 64 }])
  .png({ compressionLevel: 9 })
  .toFile(resolve(iconDir, 'icon-maskable-512.png'));

console.log('wrote icons/icon-maskable-512.png (' + maskInfo.width + 'x' + maskInfo.height + ')');
