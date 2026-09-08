import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { compilePublishedCatalog } from '../src/content/export';
import { CA92_MELODY_ORDER } from './fixtures/course-orders-ca92';

// Independently exported from rebased main, 9840971c492f5cae9ea9f8aec94daa7ea00c7d43.
// Its 19-entry digest matched the previous baseline before excluding Drift:
// 199208451a3849e239585ec05f78e368ec6167e2397015256c1539e1979185b4.
it('preserves the original 18 pitched Melody arrangements while adding rhythm and new songs', () => {
  const entries = compilePublishedCatalog({ sourceCommit: null, sourceDirty: null }).entries.filter(e => e.role === 'melody');
  expect(entries).toHaveLength(22);
  expect(entries[6].id).toBe('hopscotch');
  expect(entries.some(e => e.id === 'drift')).toBe(false);
  const unchanged = entries.filter(e => CA92_MELODY_ORDER.includes(e.id) && e.id !== 'hopscotch')
    .map(({ drumEvents: _rhythm, ...entry }) => entry);
  expect(unchanged).toHaveLength(18);
  expect(createHash('sha256').update(JSON.stringify(unchanged)).digest('hex'))
    .toBe('8399dc811b6da41aa69e5b69a63640db5158515643ab832b3e0e65927547bdf6');
});