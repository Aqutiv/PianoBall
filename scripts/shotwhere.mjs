// Where do two shots differ? Bounding box + a coarse 16x16 occupancy map.
import sharp from 'sharp';
import path from 'node:path';
const dir = path.resolve('.shots');
const [fa, fb] = process.argv.slice(2).map((f) => path.join(dir, f + '.png'));
const A = await sharp(fa).raw().toBuffer({ resolveWithObject: true });
const B = await sharp(fb).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = A.info;
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
const GX = 16, GY = 16;
const grid = Array.from({ length: GY }, () => new Array(GX).fill(0));
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * C;
    let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A.data[i + c] - B.data[i + c]));
    if (d) {
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      grid[Math.floor(y * GY / H)][Math.floor(x * GX / W)]++;
    }
  }
}
console.log(`${W}x${H}  differing pixels: ${n}`);
if (n) {
  console.log(`bbox: x ${minX}..${maxX}  y ${minY}..${maxY}`);
  const max = Math.max(...grid.flat());
  console.log('occupancy (. none, digits = log scale):');
  for (const row of grid) console.log('  ' + row.map((v) => v === 0 ? '.' : String(Math.min(9, Math.ceil(9 * v / max)))).join(''));
}
