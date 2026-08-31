import { describe, expect, it } from 'vitest';
import { REPO, at } from './fixtures/ids.js';
import { placeBlocks } from './hierarchy.js';
import { qualify, repoId, repoPath } from './qualified.js';

const sizes = new Map<string, number>();

describe('placeBlocks', () => {
  it('reads countries off project markers and districts off folders', () => {
    const blocks = placeBlocks(
      REPO,
      [
        'libs/ui/project.json',
        'libs/ui/src/lib/button.ts',
        'apps/api/package.json',
        'apps/api/src/main.ts',
        'package.json',
        'README.md',
        'docs/notes.md',
      ],
      sizes,
    );
    const by = Object.fromEntries(blocks.map((b) => [b.id, [b.country, b.district]]));
    expect(by[at('libs/ui/src/lib/button.ts')]).toEqual([at('libs/ui'), 'src/lib']);
    expect(by[at('apps/api/src/main.ts')]).toEqual([at('apps/api'), 'src']);
    expect(by[at('libs/ui/project.json')]).toEqual([at('libs/ui'), '']);
    expect(by[at('docs/notes.md')]).toEqual([at('docs'), '']);
  });

  it('gives a file above every folder the repo itself as its country', () => {
    const [readme] = placeBlocks(REPO, ['README.md'], sizes);
    expect(readme?.country).toBe(at(''));
    expect(readme?.country).not.toBe('');
  });

  it('keeps two repos apart even when they hold the same paths', () => {
    const other = repoId('other');
    const paths = ['package.json', 'src/index.ts'];
    const mine = placeBlocks(REPO, paths, sizes);
    const theirs = placeBlocks(other, paths, sizes);
    expect(mine.map((b) => b.id)).not.toEqual(theirs.map((b) => b.id));
    expect(new Set([...mine, ...theirs].map((b) => b.id)).size).toBe(paths.length * 2);
    expect(theirs[1]?.id).toBe(qualify(other, repoPath('src/index.ts')));
  });

  it('picks the deepest marker above a file', () => {
    const [block] = placeBlocks(
      REPO,
      ['package.json', 'packages/a/package.json', 'packages/a/x.ts'],
      sizes,
    ).filter((b) => b.id === at('packages/a/x.ts'));
    expect(block?.country).toBe(at('packages/a'));
  });

  it('is deterministic regardless of input order', () => {
    const a = placeBlocks(REPO, ['b/package.json', 'b/y.ts', 'a.ts'], sizes);
    const b = placeBlocks(REPO, ['a.ts', 'b/y.ts', 'b/package.json'], sizes);
    expect(a).toEqual(b);
  });
});
