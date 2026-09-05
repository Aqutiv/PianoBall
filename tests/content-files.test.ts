import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkOutputDirectory, readProvenance, writeCatalog } from '../scripts/content-files';
import { compilePublishedCatalog } from '../src/content/export';
import { MAX_CATALOG_BYTES, MAX_MANIFEST_BYTES, validateCatalog } from '../src/content/schema';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary: string[] = [];
async function temp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pianoball-content-'));
  temporary.push(directory);
  return directory;
}
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const catalog = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null });
const git = (directory: string, args: string[]) => execFileSync('git', ['-C', directory, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
}).trim();
async function initGit(directory: string) {
  git(directory, ['init']);
  git(directory, ['add', '.']);
  git(directory, ['-c', 'user.name=Content Test', '-c', 'user.email=content-test@example.invalid', 'commit', '-m', 'Fixture']);
}

describe('published content files', () => {
  it('hashes exact UTF-8 bytes, uses LF/final LF, and produces identical independent exports', async () => {
    const first = await temp(), second = await temp();
    const before = JSON.stringify(catalog);
    const a = await writeCatalog(first, catalog), b = await writeCatalog(second, catalog);
    expect(a).toEqual(b);
    const bytes = await readFile(path.join(first, a.manifest.url));
    expect(bytes.equals(await readFile(path.join(second, b.manifest.url)))).toBe(true);
    expect(bytes.equals(Buffer.from(JSON.stringify(catalog, null, 2) + '\n', 'utf8'))).toBe(true);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.includes(13)).toBe(false);
    expect(bytes.at(-1)).toBe(10);
    expect(bytes.at(-2)).not.toBe(10);
    expect(a.manifest).toEqual({
      schemaVersion: 1, revision: sha256(bytes), sha256: sha256(bytes), url: `catalog.${sha256(bytes)}.json`,
    });
    const manifest = await readFile(path.join(first, 'manifest.json'));
    expect(manifest.equals(await readFile(path.join(second, 'manifest.json')))).toBe(true);
    expect(JSON.parse(manifest.toString('utf8'))).toEqual(a.manifest);
    expect(bytes.length).toBeLessThanOrEqual(MAX_CATALOG_BYTES);
    expect(manifest.length).toBeLessThanOrEqual(MAX_MANIFEST_BYTES);
    expect(JSON.stringify(catalog)).toBe(before);
    const changed = structuredClone(catalog);
    changed.entries[0].playerNotes[0].note++;
    expect((await writeCatalog(second, changed)).manifest.revision).not.toBe(a.manifest.revision);
  });

  it('leaves the last manifest intact on invalid source or a corrupt immutable file', async () => {
    const output = await temp();
    const result = await writeCatalog(output, catalog);
    const manifestPath = path.join(output, 'manifest.json');
    const before = await readFile(manifestPath);
    const invalid = structuredClone(catalog);
    invalid.entries[0].playerNotes[0].note = NaN;
    await expect(writeCatalog(output, invalid)).rejects.toThrow(/playerNotes\[0\].note/);
    expect((await readFile(manifestPath)).equals(before)).toBe(true);
    expect((await readdir(output)).sort()).toEqual([result.manifest.url, 'manifest.json'].sort());
    const cataloguePath = path.join(output, result.manifest.url);
    await writeFile(cataloguePath, 'corrupt fixture');
    await expect(writeCatalog(output, catalog)).rejects.toThrow(/immutable catalogue/);
    expect(await readFile(cataloguePath, 'utf8')).toBe('corrupt fixture');
    expect((await readFile(manifestPath)).equals(before)).toBe(true);
  });

  it('fails the byte cap before writing either file, even when note/text limits pass', async () => {
    const output = path.join(await temp(), 'not-created');
    const large = structuredClone(catalog);
    large.entries = Array.from({ length: 8 }, (_, i) => ({
      ...structuredClone(catalog.entries[0]), id: `large-${i}`,
      playerNotes: Array.from({ length: 20_000 }, () => ({ beat: 65_536, len: 1_024, note: 127 })),
      backingEvents: [],
    }));
    expect(() => validateCatalog(large)).not.toThrow();
    expect(Buffer.byteLength(JSON.stringify(large, null, 2) + '\n')).toBeGreaterThan(MAX_CATALOG_BYTES);
    await expect(writeCatalog(output, large)).rejects.toThrow(/catalog bytes/);
    await expect(readdir(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps provenance clean across repeated headless CLI runs, including checkout paths with spaces', async () => {
    const checkout = path.join(await temp(), 'source with spaces');
    await mkdir(checkout);
    await cp(path.join(root, 'src'), path.join(checkout, 'src'), { recursive: true });
    await mkdir(path.join(checkout, 'scripts'));
    for (const file of ['content-files.ts', 'export-content.mjs']) {
      await cp(path.join(root, 'scripts', file), path.join(checkout, 'scripts', file));
    }
    await writeFile(path.join(checkout, 'package.json'), '{"type":"module"}\n');
    await writeFile(path.join(checkout, '.gitignore'), 'dist/\n');
    await initGit(checkout);
    const { GITHUB_SHA: _sha, ...env } = process.env;
    const run = () => JSON.parse(execFileSync(process.execPath, [path.join(checkout, 'scripts/export-content.mjs')], {
      cwd: os.tmpdir(), encoding: 'utf8', env, windowsHide: true,
    }));
    const before = readProvenance(checkout, env);
    expect(before).toEqual({ sourceCommit: git(checkout, ['rev-parse', 'HEAD']), sourceDirty: false });
    expect(run()).toEqual(run());
    expect(readProvenance(checkout, env)).toEqual(before);
    await writeFile(path.join(checkout, 'new-source.ts'), '// new track\n');
    expect(readProvenance(checkout, env).sourceDirty).toBe(true);
    expect(() => checkOutputDirectory(checkout, path.join(checkout, 'unignored-output'), 'catalog.fixture.json')).toThrow(/Git-ignored/);
    expect(() => checkOutputDirectory(checkout, path.join(checkout, 'dist/content/v1'), 'catalog.fixture.json')).not.toThrow();
    expect(readProvenance(checkout, { GITHUB_SHA: 'b'.repeat(40) }).sourceCommit).toBe('b'.repeat(40));
  }, 20_000);

  it.each([
    ['only the manifest is ignored', 'output/manifest.json\n'],
    ['catalogues are re-included', 'output/*\n!output/catalog.*.json\n'],
  ])('rejects custom output when %s without writing or dirtying the checkout', async (_name, rules) => {
    const checkout = await temp();
    await writeFile(path.join(checkout, '.gitignore'), rules);
    await initGit(checkout);
    const output = path.join(checkout, 'output');
    const before = readProvenance(checkout, {});
    expect(before.sourceDirty).toBe(false);
    const exportContent = async () => {
      return writeCatalog(output, compilePublishedCatalog(before), checkout);
    };
    await expect(exportContent()).rejects.toThrow(/Git-ignored/);
    await expect(readdir(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(readProvenance(checkout, {})).toEqual(before);
  });

  it.each(['output/\n', 'output/*.json\n'])('keeps repeated custom exports clean with ignore rule %j', async (rules) => {
    const checkout = await temp();
    await writeFile(path.join(checkout, '.gitignore'), rules);
    await initGit(checkout);
    const output = path.join(checkout, 'output');
    const before = readProvenance(checkout, {});
    const exportContent = async () => {
      return writeCatalog(output, compilePublishedCatalog(readProvenance(checkout, {})), checkout);
    };
    const first = await exportContent();
    expect(first).toEqual(await exportContent());
    expect(readProvenance(checkout, {})).toEqual(before);
    // Force-tracked manifests must still be rejected even under an ignored directory.
    git(checkout, ['add', '-f', 'output/manifest.json']);
    expect(() => checkOutputDirectory(checkout, output, first.manifest.url)).toThrow(/Git-ignored/);
  });

  it('uses explicit null provenance without Git and accepts an external output path', async () => {
    const directory = await temp();
    expect(readProvenance(directory, {})).toEqual({ sourceCommit: null, sourceDirty: null });
    expect(() => checkOutputDirectory(root, directory, 'catalog.fixture.json')).not.toThrow();
  });
});
