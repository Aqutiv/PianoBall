import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_CATALOG_BYTES, MAX_MANIFEST_BYTES, requireValue, validateCatalog, validateManifest,
  type ManifestV1, type Provenance,
} from '../src/content/schema';

/** Called once before creating output. Git-ignored output cannot dirty the next run. */
export function readProvenance(root: string, env: NodeJS.ProcessEnv = process.env): Provenance {
  const git = (args: string[]): string | null => {
    try {
      return execFileSync('git', ['-C', root, ...args], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
      }).trim();
    } catch { return null; }
  };
  const head = git(['rev-parse', 'HEAD']);
  const candidate = env.GITHUB_SHA ?? head;
  const sourceCommit = candidate && /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
  const status = head ? git(['status', '--porcelain', '--untracked-files=normal']) : null;
  return { sourceCommit, sourceDirty: status === null ? null : status.length > 0 };
}

/** Refuse tracked/unignored outputs in the source tree instead of changing its dirty state. */
export function checkOutputDirectory(root: string, output: string, catalogFilename: string): void {
  let top: string;
  try {
    top = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
  } catch { return; }
  const relative = path.relative(top, output);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return;
  try {
    // Check both actual filenames: a manifest-only rule or catalogue negation is unsafe.
    // Run separately: check-ignore -q with multiple paths succeeds if ANY is ignored.
    for (const filename of ['manifest.json', catalogFilename]) {
      const target = path.join(output, filename);
      execFileSync('git', ['-C', top, 'check-ignore', '-q', '--', target], {
        stdio: 'ignore', windowsHide: true,
      });
    }
  } catch {
    throw new Error('All output files inside the repository must be Git-ignored; use dist/content/v1 or an external temporary directory.');
  }
}

const jsonBytes = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

async function atomicWrite(file: string, bytes: Buffer): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Validate everything before any write; publish the verified catalogue before the manifest. */
export async function writeCatalog(output: string, catalog: unknown, sourceRoot?: string): Promise<{
  manifest: ManifestV1; catalogBytes: number; manifestBytes: number;
}> {
  validateCatalog(catalog);
  const bytes = jsonBytes(catalog);
  requireValue(bytes.length <= MAX_CATALOG_BYTES, 'catalog bytes', `exceeds ${MAX_CATALOG_BYTES}`);
  const revision = digest(bytes);
  const manifest: ManifestV1 = { schemaVersion: 1, revision, url: `catalog.${revision}.json`, sha256: revision };
  validateManifest(manifest);
  const manifestBytes = jsonBytes(manifest);
  requireValue(manifestBytes.length <= MAX_MANIFEST_BYTES, 'manifest bytes', `exceeds ${MAX_MANIFEST_BYTES}`);
  if (sourceRoot !== undefined) checkOutputDirectory(sourceRoot, output, manifest.url);
  await mkdir(output, { recursive: true });
  const file = path.join(output, manifest.url);
  let existing: Buffer | undefined;
  try { existing = await readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing) {
    requireValue(existing.equals(bytes), file, 'immutable catalogue already exists with different bytes');
  } else {
    await atomicWrite(file, bytes);
  }
  const written = await readFile(file);
  requireValue(written.equals(bytes) && digest(written) === revision, file, 'written catalogue hash mismatch');
  await atomicWrite(path.join(output, 'manifest.json'), manifestBytes);
  return { manifest, catalogBytes: bytes.length, manifestBytes: manifestBytes.length };
}
