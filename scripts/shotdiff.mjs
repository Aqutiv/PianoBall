// Compare two .shots PNGs (or two whole prefixes) pixel by pixel.
// Usage: node scripts/shotdiff.mjs <prefixA> <prefixB>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('.shots');
const [a, b] = process.argv.slice(2);

async function raw(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, info };
}

const names = fs.readdirSync(dir)
  .filter((f) => f.startsWith(a + '-') && f.endsWith('.png'))
  .map((f) => f.slice(a.length + 1, -4));

let worst = 0;
for (const n of names) {
  const fa = path.join(dir, `${a}-${n}.png`);
  const fb = path.join(dir, `${b}-${n}.png`);
  if (!fs.existsSync(fb)) { console.log(`MISSING  ${b}-${n}.png`); continue; }
  const A = await raw(fa), B = await raw(fb);
  if (A.data.length !== B.data.length) { console.log(`SIZE     ${n}: ${A.info.width}x${A.info.height} vs ${B.info.width}x${B.info.height}`); continue; }
  let diff = 0, maxd = 0;
  for (let i = 0; i < A.data.length; i++) {
    const d = Math.abs(A.data[i] - B.data[i]);
    if (d) { diff++; if (d > maxd) maxd = d; }
  }
  const pct = (100 * diff / A.data.length).toFixed(4);
  worst = Math.max(worst, diff);
  console.log(`${diff === 0 ? 'IDENTICAL' : 'DIFF     '} ${n}: ${diff} subpixels (${pct}%), max delta ${maxd}`);
}
process.exit(worst === 0 ? 0 : 1);
