// Same crop from two shots, magnified, side by side.
import sharp from 'sharp';
import path from 'node:path';
const dir = path.resolve('.shots');
const [a, b, xs, ys, ws, hs, zs, out] = process.argv.slice(2);
const [x, y, w, h, z] = [xs, ys, ws, hs, zs].map(Number);
const crop = (f) => sharp(path.join(dir, f + '.png'))
  .extract({ left: x, top: y, width: w, height: h })
  .resize(w * z, h * z, { kernel: 'nearest' });
const [A, B] = await Promise.all([crop(a).png().toBuffer(), crop(b).png().toBuffer()]);
await sharp({ create: { width: w * z * 2 + 10, height: h * z, channels: 3, background: '#ff0000' } })
  .composite([{ input: A, left: 0, top: 0 }, { input: B, left: w * z + 10, top: 0 }])
  .png().toFile(path.join(dir, out + '.png'));
console.log(`${out}.png  left=${a} right=${b}  @${z}x`);
