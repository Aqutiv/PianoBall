// Crop the same region from two shots and lay them side by side, labelled.
import sharp from 'sharp';
import path from 'node:path';
const dir = path.resolve('.shots');
const [a, b, xs, ys, ws, hs, out] = process.argv.slice(2);
const [x, y, w, h] = [xs, ys, ws, hs].map(Number);
const crop = (f) => sharp(path.join(dir, f + '.png')).extract({ left: x, top: y, width: w, height: h });
const [A, B] = await Promise.all([crop(a).png().toBuffer(), crop(b).png().toBuffer()]);
await sharp({ create: { width: w * 2 + 12, height: h, channels: 3, background: '#101010' } })
  .composite([{ input: A, left: 0, top: 0 }, { input: B, left: w + 12, top: 0 }])
  .png().toFile(path.join(dir, out + '.png'));
console.log(`${out}.png  (left: ${a}   right: ${b})`);
