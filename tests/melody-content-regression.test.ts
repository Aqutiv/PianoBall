import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { compilePublishedCatalog } from '../src/content/export';

// Baseline from f0233a1 before Play Backing: every melody header, note and event.
it('preserves all 19 Melody arrangements byte for byte through the backing revision', () => {
  const entries = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries.filter(e => e.role === 'melody');
  expect(entries).toHaveLength(19);
  expect(createHash('sha256').update(JSON.stringify(entries)).digest('hex')).toBe('199208451a3849e239585ec05f78e368ec6167e2397015256c1539e1979185b4');
});
