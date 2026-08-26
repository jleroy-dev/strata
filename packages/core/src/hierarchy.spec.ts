import { describe, expect, it } from 'vitest';
import { placeBlocks } from './hierarchy.js';

const sizes = new Map<string, number>();

describe('placeBlocks', () => {
  it('reads countries off project markers and districts off folders', () => {
    const blocks = placeBlocks(
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
    expect(by['libs/ui/src/lib/button.ts']).toEqual(['libs/ui', 'src/lib']);
    expect(by['apps/api/src/main.ts']).toEqual(['apps/api', 'src']);
    expect(by['libs/ui/project.json']).toEqual(['libs/ui', '']);
    expect(by['README.md']).toEqual(['', '']);
    expect(by['docs/notes.md']).toEqual(['docs', '']);
  });

  it('picks the deepest marker above a file', () => {
    const [block] = placeBlocks(
      ['package.json', 'packages/a/package.json', 'packages/a/x.ts'],
      sizes,
    ).filter((b) => b.id === 'packages/a/x.ts');
    expect(block?.country).toBe('packages/a');
  });

  it('is deterministic regardless of input order', () => {
    const a = placeBlocks(['b/package.json', 'b/y.ts', 'a.ts'], sizes);
    const b = placeBlocks(['a.ts', 'b/y.ts', 'b/package.json'], sizes);
    expect(a).toEqual(b);
  });
});
