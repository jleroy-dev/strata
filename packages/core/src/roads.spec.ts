import { describe, expect, it } from 'vitest';
import { typescript } from './languages/typescript.js';
import { RoadIndex, languageOf, registerLanguage, type ResolveContext } from './roads.js';

registerLanguage(typescript);

const files = new Set([
  'apps/api/src/main.ts',
  'apps/api/src/app/rooms.service.ts',
  'apps/api/src/app/rooms.service.spec.ts',
  'apps/api/src/app/util/index.ts',
  'libs/shared/ui/src/index.ts',
  'libs/shared/ui/src/lib/button.ts',
  'packages/core/src/index.ts',
  'packages/core/src/layout.ts',
  'packages/web/src/main.ts',
  'docs/notes.md',
]);
const ctx: ResolveContext = {
  has: (id) => files.has(id),
  aliases: [
    { pattern: '@tms/shared-ui', targets: ['libs/shared/ui/src/index.ts'] },
    { pattern: '@tms/*', targets: ['libs/*/src/index.ts'] },
  ],
  packages: new Map([['@strata/core', 'packages/core']]),
};

describe('typescript specifiers', () => {
  it('finds import, export from, require and dynamic import, across lines', () => {
    const source = `
      import { a,
        b } from './rooms.service';
      export * from "../x";
      const y = require('./y');
      const z = await import('./z');
      import type { T } from '@tms/shared-ui';
    `;
    expect(typescript.specifiersOf(source)).toEqual([
      './rooms.service',
      '../x',
      './y',
      './z',
      '@tms/shared-ui',
    ]);
  });
});

describe('typescript resolve', () => {
  const r = (from: string, spec: string): string | undefined => typescript.resolve(from, spec, ctx);

  it('resolves relative imports with and without extensions, and index files', () => {
    expect(r('apps/api/src/main.ts', './app/rooms.service')).toBe(
      'apps/api/src/app/rooms.service.ts',
    );
    expect(r('apps/api/src/app/rooms.service.ts', './util')).toBe('apps/api/src/app/util/index.ts');
    expect(r('packages/core/src/index.ts', './layout.js')).toBe('packages/core/src/layout.ts');
    expect(r('apps/api/src/app/rooms.service.ts', '../main.ts')).toBe('apps/api/src/main.ts');
  });

  it('resolves tsconfig aliases, exact and wildcard', () => {
    expect(r('apps/api/src/main.ts', '@tms/shared-ui')).toBe('libs/shared/ui/src/index.ts');
    expect(r('apps/api/src/main.ts', '@tms/shared/ui')).toBe('libs/shared/ui/src/index.ts');
  });

  it('resolves workspace package names to their source', () => {
    expect(r('packages/web/src/main.ts', '@strata/core')).toBe('packages/core/src/index.ts');
    expect(r('packages/web/src/main.ts', '@strata/core/src/layout')).toBe(
      'packages/core/src/layout.ts',
    );
  });

  it('leaves externals and missing files alone', () => {
    expect(r('apps/api/src/main.ts', 'three')).toBeUndefined();
    expect(r('apps/api/src/main.ts', './nope')).toBeUndefined();
  });

  it('is chosen by extension', () => {
    expect(languageOf('a/b.TSX')).toBe(typescript);
    expect(languageOf('docs/notes.md')).toBeUndefined();
  });
});

describe('RoadIndex', () => {
  it('diffs roads as files and specifiers change', () => {
    const index = new RoadIndex();
    index.set('apps/api/src/main.ts', ['./app/rooms.service', '@tms/shared-ui', 'three']);
    index.set('apps/api/src/app/rooms.service.ts', ['./util', './later']);
    let diff = index.resolve(ctx);
    expect(diff.added.map((r) => `${r.from} -> ${r.to}`)).toEqual([
      'apps/api/src/app/rooms.service.ts -> apps/api/src/app/util/index.ts',
      'apps/api/src/main.ts -> apps/api/src/app/rooms.service.ts',
      'apps/api/src/main.ts -> libs/shared/ui/src/index.ts',
    ]);
    expect(diff.removed).toEqual([]);

    files.add('apps/api/src/app/later.ts');
    diff = index.resolve(ctx);
    expect(diff.added).toEqual([
      { from: 'apps/api/src/app/rooms.service.ts', to: 'apps/api/src/app/later.ts' },
    ]);

    index.set('apps/api/src/main.ts', ['@tms/shared-ui']);
    diff = index.resolve(ctx, ['apps/api/src/main.ts']);
    expect(diff.removed).toEqual([
      { from: 'apps/api/src/main.ts', to: 'apps/api/src/app/rooms.service.ts' },
    ]);
    expect(diff.added).toEqual([]);

    index.rename('apps/api/src/app/rooms.service.ts', 'apps/api/src/app/rooms.ts');
    files.delete('apps/api/src/app/rooms.service.ts');
    files.add('apps/api/src/app/rooms.ts');
    diff = index.resolve(ctx);
    expect(diff.removed.map((r) => r.from)).toEqual([
      'apps/api/src/app/rooms.service.ts',
      'apps/api/src/app/rooms.service.ts',
    ]);
    expect(diff.added.map((r) => r.from)).toEqual([
      'apps/api/src/app/rooms.ts',
      'apps/api/src/app/rooms.ts',
    ]);

    index.forget('apps/api/src/main.ts');
    diff = index.resolve(ctx);
    expect(diff.removed).toEqual([
      { from: 'apps/api/src/main.ts', to: 'libs/shared/ui/src/index.ts' },
    ]);
    expect(index.roads).toHaveLength(2);
  });
});
