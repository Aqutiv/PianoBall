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

// The union of both prefixes, not just the first. Taking the names from `a`
// alone means a shot that exists only under `b` — because the `a` capture
// stopped partway through, say — is never looked at, and the run still reports
// success on the pairs it did manage.
function shotsUnder(prefix) {
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix + '-') && f.endsWith('.png'))
    .map((f) => f.slice(prefix.length + 1, -4));
}
const names = [...new Set([...shotsUnder(a), ...shotsUnder(b)])].sort();

// A comparison that could not be made is a failure, not a pass. Printing a
// diagnostic and carrying on left `worst` at zero, so a run whose every other
// pair happened to match exited 0 while having quietly skipped the pair that
// mattered — and a prefix that matched nothing at all exited 0 having compared
// nothing whatsoever. This harness only earns its keep if it is loud.
let worst = 0;
let invalid = 0;

if (!names.length) {
  console.log(`NO SHOTS  nothing in .shots matches "${a}-" or "${b}-"`);
  process.exit(1);
}

for (const n of names) {
  const fa = path.join(dir, `${a}-${n}.png`);
  const fb = path.join(dir, `${b}-${n}.png`);
  if (!fs.existsSync(fa)) { console.log(`MISSING  ${a}-${n}.png`); invalid++; continue; }
  if (!fs.existsSync(fb)) { console.log(`MISSING  ${b}-${n}.png`); invalid++; continue; }
  const A = await raw(fa), B = await raw(fb);
  // Geometry, not just byte count: 100x200 and 200x100 hold the same number of
  // bytes, and two flat images of those shapes would have compared equal as
  // bare arrays and been called identical.
  if (A.info.width !== B.info.width
    || A.info.height !== B.info.height
    || A.info.channels !== B.info.channels) {
    console.log(`SIZE     ${n}: ${A.info.width}x${A.info.height}x${A.info.channels}`
      + ` vs ${B.info.width}x${B.info.height}x${B.info.channels}`);
    invalid++;
    continue;
  }
  let diff = 0, maxd = 0;
  for (let i = 0; i < A.data.length; i++) {
    const d = Math.abs(A.data[i] - B.data[i]);
    if (d) { diff++; if (d > maxd) maxd = d; }
  }
  const pct = (100 * diff / A.data.length).toFixed(4);
  worst = Math.max(worst, diff);
  console.log(`${diff === 0 ? 'IDENTICAL' : 'DIFF     '} ${n}: ${diff} subpixels (${pct}%), max delta ${maxd}`);
}
process.exit(worst === 0 && invalid === 0 ? 0 : 1);
