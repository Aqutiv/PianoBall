#!/usr/bin/env node
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('The content exporter supports Node 24.x (the Pages CI runtime).');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out-dir' || !args[1])) {
  throw new Error('Usage: npm run export:content -- [--out-dir <directory>]');
}
const output = args.length ? path.resolve(args[1]) : path.join(root, 'dist/content/v1');

// Node 24 strips types; resolve the existing extensionless bundler imports headlessly.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
const { readProvenance, writeCatalog } = await import('./content-files.ts');
const { compilePublishedCatalog } = await import('../src/content/export.ts');
const provenance = readProvenance(root);
const catalog = compilePublishedCatalog(provenance);
const result = await writeCatalog(output, catalog, root);
console.log(JSON.stringify({
  ...provenance, output,
  melody: catalog.entries.filter((entry) => entry.role === 'melody').length,
  chords: catalog.entries.filter((entry) => entry.role === 'chords').length,
  ...result,
}, null, 2));
