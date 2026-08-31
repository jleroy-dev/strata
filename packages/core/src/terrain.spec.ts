import { describe, expect, it } from 'vitest';
import { foldersMoved, needsHashes, reconcile, type Entry, type Listing } from './terrain.js';
import { REPO, at, p } from './fixtures/ids.js';

const listing = (entries: Record<string, number | Entry>): Listing =>
  new Map(
    Object.entries(entries).map(([id, e]) => [p(id), typeof e === 'number' ? { size: e } : e]),
  );

const base = listing({
  'package.json': 300,
  'src/main.ts': { size: 1200, sha: 'aaa' },
  'src/util/format.ts': { size: 800, sha: 'bbb' },
  'src/util/guard.ts': { size: 400, sha: 'ccc' },
  'notes.md': 2000,
});

describe('reconcile', () => {
  it('returns nothing for identical listings', () => {
    expect(reconcile(REPO, base, base)).toEqual([]);
  });

  it('reports an arrival, a departure and an edit', () => {
    const next = new Map(base);
    next.delete(p('notes.md'));
    next.set(p('src/new.ts'), { size: 10 });
    next.set(p('src/main.ts'), { size: 1500, sha: 'aaa' });
    expect(reconcile(REPO, base, next)).toEqual([
      { kind: 'block.removed', id: at('notes.md') },
      {
        kind: 'block.added',
        block: { id: at('src/new.ts'), country: at('src'), district: '', size: 10 },
      },
      { kind: 'block.changed', id: at('src/main.ts'), size: 1500 },
    ]);
  });

  it('pairs a departure and an arrival on blob sha', () => {
    const next = new Map(base);
    next.delete(p('src/main.ts'));
    next.set(p('src/entry.ts'), { size: 1300 });
    const changes = reconcile(REPO, base, next, new Map([[p('src/entry.ts'), p('aaa')]]));
    expect(changes).toEqual([
      {
        kind: 'block.moved',
        from: at('src/main.ts'),
        block: { id: at('src/entry.ts'), country: at('src'), district: '', size: 1300 },
      },
    ]);
  });

  it('pairs on basename and size when there is no sha', () => {
    const next = new Map(base);
    next.delete(p('notes.md'));
    next.set(p('docs/notes.md'), { size: 2000 });
    expect(reconcile(REPO, base, next)).toEqual([
      {
        kind: 'block.moved',
        from: at('notes.md'),
        block: { id: at('docs/notes.md'), country: at('docs'), district: '', size: 2000 },
      },
    ]);
  });

  it('refuses to pair on size alone', () => {
    const next = new Map(base);
    next.delete(p('notes.md'));
    next.set(p('src/other.ts'), { size: 2000 });
    expect(reconcile(REPO, base, next).map((c) => c.kind)).toEqual([
      p('block.removed'),
      p('block.added'),
    ]);
  });

  it('turns a folder rename into one move per file', () => {
    const next = new Map(base);
    next.delete(p('src/util/format.ts'));
    next.delete(p('src/util/guard.ts'));
    next.set(p('src/lib/format.ts'), { size: 800 });
    next.set(p('src/lib/guard.ts'), { size: 400 });
    const changes = reconcile(
      REPO,
      base,
      next,
      new Map([
        [p('src/lib/format.ts'), p('bbb')],
        [p('src/lib/guard.ts'), p('ccc')],
      ]),
    );
    expect(changes.map((c) => c.kind)).toEqual(['folder.moved', 'block.moved', 'block.moved']);
  });

  it('moves siblings to a new country when a project marker appears', () => {
    const next = new Map(base);
    next.set(p('src/util/package.json'), { size: 50 });
    const changes = reconcile(REPO, base, next);
    expect(changes.map((c) => c.kind)).toEqual(['block.moved', 'block.moved', 'block.added']);
    const format = changes.find(
      (c) => c.kind === 'block.moved' && c.from === at('src/util/format.ts'),
    );
    expect(format?.kind === 'block.moved' ? format.block.country : undefined).toBe(at('src/util'));
  });

  it('orders moved, removed, added, changed', () => {
    const next = new Map(base);
    next.delete(p('src/util/guard.ts'));
    next.delete(p('notes.md'));
    next.set(p('src/util/check.ts'), { size: 400 });
    next.set(p('src/a.ts'), { size: 1 });
    next.set(p('package.json'), { size: 301 });
    const changes = reconcile(REPO, base, next, new Map([[p('src/util/check.ts'), p('ccc')]]));
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
    gone.delete(p('notes.md'));
    const fresh = new Map(base);
    fresh.set(p('x.ts'), { size: 1 });
    const both = new Map(gone);
    both.set(p('x.ts'), { size: 1 });
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
      [p('src/util/a.ts'), p('src/lib/a.ts')],
      [p('src/util/deep/b.ts'), p('src/lib/deep/b.ts')],
      [p('src/util/deep/c.ts'), p('src/lib/deep/c.ts')],
    ]);
    expect(foldersMoved(previous, tree)).toEqual([[p('src/util'), p('src/lib')]]);
    const lone = new Map([[p('src/other.ts'), p('src/util/other.ts')]]);
    expect(foldersMoved(previous, lone)).toEqual([]);
    const partial = new Map([[p('src/util/a.ts'), p('src/lib/a.ts')]]);
    expect(foldersMoved(previous, partial)).toEqual([]);
  });

  it('comes out of reconcile ahead of the block moves', () => {
    const previous = listing({
      'docs/notes/a.md': { size: 1, sha: 'a' },
      'docs/notes/b.md': { size: 1, sha: 'b' },
    });
    const next = listing({ 'docs/old/a.md': { size: 1 }, 'docs/old/b.md': { size: 1 } });
    const changes = reconcile(
      REPO,
      previous,
      next,
      new Map([
        [p('docs/old/a.md'), p('a')],
        [p('docs/old/b.md'), p('b')],
      ]),
    );
    expect(changes.map((c) => c.kind)).toEqual(['folder.moved', 'block.moved', 'block.moved']);
    expect(changes[0]).toEqual({
      kind: 'folder.moved',
      from: at('docs/notes'),
      to: at('docs/old'),
    });
  });
});
