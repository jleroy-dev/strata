import { describe, expect, it } from 'vitest';
import { foldersMoved, needsHashes, reconcile, type Entry, type Listing } from './terrain.js';

const listing = (entries: Record<string, number | Entry>): Listing =>
  new Map(Object.entries(entries).map(([id, e]) => [id, typeof e === 'number' ? { size: e } : e]));

const base = listing({
  'package.json': 300,
  'src/main.ts': { size: 1200, sha: 'aaa' },
  'src/util/format.ts': { size: 800, sha: 'bbb' },
  'src/util/guard.ts': { size: 400, sha: 'ccc' },
  'notes.md': 2000,
});

describe('reconcile', () => {
  it('returns nothing for identical listings', () => {
    expect(reconcile(base, base)).toEqual([]);
  });

  it('reports an arrival, a departure and an edit', () => {
    const next = new Map(base);
    next.delete('notes.md');
    next.set('src/new.ts', { size: 10 });
    next.set('src/main.ts', { size: 1500, sha: 'aaa' });
    expect(reconcile(base, next)).toEqual([
      { kind: 'block.removed', id: 'notes.md' },
      { kind: 'block.added', block: { id: 'src/new.ts', country: 'src', district: '', size: 10 } },
      { kind: 'block.changed', id: 'src/main.ts', size: 1500 },
    ]);
  });

  it('pairs a departure and an arrival on blob sha', () => {
    const next = new Map(base);
    next.delete('src/main.ts');
    next.set('src/entry.ts', { size: 1300 });
    const changes = reconcile(base, next, new Map([['src/entry.ts', 'aaa']]));
    expect(changes).toEqual([
      {
        kind: 'block.moved',
        from: 'src/main.ts',
        block: { id: 'src/entry.ts', country: 'src', district: '', size: 1300 },
      },
    ]);
  });

  it('pairs on basename and size when there is no sha', () => {
    const next = new Map(base);
    next.delete('notes.md');
    next.set('docs/notes.md', { size: 2000 });
    expect(reconcile(base, next)).toEqual([
      {
        kind: 'block.moved',
        from: 'notes.md',
        block: { id: 'docs/notes.md', country: 'docs', district: '', size: 2000 },
      },
    ]);
  });

  it('refuses to pair on size alone', () => {
    const next = new Map(base);
    next.delete('notes.md');
    next.set('src/other.ts', { size: 2000 });
    expect(reconcile(base, next).map((c) => c.kind)).toEqual(['block.removed', 'block.added']);
  });

  it('turns a folder rename into one move per file', () => {
    const next = new Map(base);
    next.delete('src/util/format.ts');
    next.delete('src/util/guard.ts');
    next.set('src/lib/format.ts', { size: 800 });
    next.set('src/lib/guard.ts', { size: 400 });
    const changes = reconcile(
      base,
      next,
      new Map([
        ['src/lib/format.ts', 'bbb'],
        ['src/lib/guard.ts', 'ccc'],
      ]),
    );
    expect(changes.map((c) => c.kind)).toEqual(['folder.moved', 'block.moved', 'block.moved']);
  });

  it('moves siblings to a new country when a project marker appears', () => {
    const next = new Map(base);
    next.set('src/util/package.json', { size: 50 });
    const changes = reconcile(base, next);
    expect(changes.map((c) => c.kind)).toEqual(['block.moved', 'block.moved', 'block.added']);
    const format = changes.find((c) => c.kind === 'block.moved' && c.from === 'src/util/format.ts');
    expect(format?.kind === 'block.moved' ? format.block.country : undefined).toBe('src/util');
  });

  it('orders moved, removed, added, changed', () => {
    const next = new Map(base);
    next.delete('src/util/guard.ts');
    next.delete('notes.md');
    next.set('src/util/check.ts', { size: 400 });
    next.set('src/a.ts', { size: 1 });
    next.set('package.json', { size: 301 });
    const changes = reconcile(base, next, new Map([['src/util/check.ts', 'ccc']]));
    expect(changes.map((c) => c.kind)).toEqual([
      'block.moved',
      'block.removed',
      'block.added',
      'block.changed',
    ]);
  });
});

describe('needsHashes', () => {
  it('is true only with both a departure and an arrival', () => {
    const gone = new Map(base);
    gone.delete('notes.md');
    const fresh = new Map(base);
    fresh.set('x.ts', { size: 1 });
    const both = new Map(gone);
    both.set('x.ts', { size: 1 });
    expect(needsHashes(base, gone)).toBe(false);
    expect(needsHashes(base, fresh)).toBe(false);
    expect(needsHashes(base, both)).toBe(true);
  });
});

describe('foldersMoved', () => {
  it('reports a renamed directory once, at its top, and not a lone file move', () => {
    const previous = listing({
      'src/util/a.ts': { size: 1, sha: 'a' },
      'src/util/deep/b.ts': { size: 1, sha: 'b' },
      'src/util/deep/c.ts': { size: 1, sha: 'c' },
      'src/other.ts': { size: 1, sha: 'o' },
    });
    const tree = new Map([
      ['src/util/a.ts', 'src/lib/a.ts'],
      ['src/util/deep/b.ts', 'src/lib/deep/b.ts'],
      ['src/util/deep/c.ts', 'src/lib/deep/c.ts'],
    ]);
    expect(foldersMoved(previous, tree)).toEqual([['src/util', 'src/lib']]);
    const lone = new Map([['src/other.ts', 'src/util/other.ts']]);
    expect(foldersMoved(previous, lone)).toEqual([]);
    const partial = new Map([['src/util/a.ts', 'src/lib/a.ts']]);
    expect(foldersMoved(previous, partial)).toEqual([]);
  });

  it('comes out of reconcile ahead of the block moves', () => {
    const previous = listing({
      'docs/notes/a.md': { size: 1, sha: 'a' },
      'docs/notes/b.md': { size: 1, sha: 'b' },
    });
    const next = listing({ 'docs/old/a.md': { size: 1 }, 'docs/old/b.md': { size: 1 } });
    const changes = reconcile(
      previous,
      next,
      new Map([
        ['docs/old/a.md', 'a'],
        ['docs/old/b.md', 'b'],
      ]),
    );
    expect(changes.map((c) => c.kind)).toEqual(['folder.moved', 'block.moved', 'block.moved']);
    expect(changes[0]).toEqual({ kind: 'folder.moved', from: 'docs/notes', to: 'docs/old' });
  });
});
