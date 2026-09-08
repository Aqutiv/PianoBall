#!/usr/bin/env node
/** Reproducible catalog evidence for the musicality review; outputs stay ignored. */
import { registerHooks } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
      for (const file of [base + '.ts', path.join(base, 'index.ts')]) {
        if (existsSync(file)) return next(pathToFileURL(file).href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (baseline && url.startsWith(pathToFileURL(path.join(root, 'src') + path.sep).href)) {
      const relative = path.relative(root, fileURLToPath(url)).replaceAll('\\', '/');
      const source = execFileSync('git', ['show', `9840971:${relative}`], { cwd: root, encoding: 'utf8', windowsHide: true });
      return { format: 'module-typescript', source, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { compilePublishedCatalog } = await import('../src/content/export.ts');
const catalog = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null });
const output = path.join(root, '.shots', 'musicality');
mkdirSync(output, { recursive: true });
const name = baseline ? 'baseline' : 'current';
writeFileSync(path.join(output, name + '.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`${name}: ${catalog.entries.length} role arrangements written to ${output}`);
