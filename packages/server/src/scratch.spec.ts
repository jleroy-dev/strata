import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  existsSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoId, repoPath } from '@strata/core';
import { random, ScratchActions, SCRATCH_ACTIONS } from './actions.js';
import {
  cloneScratch,
  MARKER,
  openScratch,
  realAt,
  scratchFor,
  seedScratch,
  sourceOf,
} from './scratch.js';

const SEED: [string, number][] = [
  ['packages/core/a.ts', 900],
  ['packages/core/b.ts', 900],
  ['packages/core/c.ts', 900],
  ['packages/web/x.ts', 900],
  ['packages/web/y.ts', 900],
  ['packages/web/use-it.ts', 900],
  ['docs/notes.md', 900],
];

const GIT_MS = 30_000;

const made: string[] = [];
const where = (name: string): string => {
  const base = mkdtempSync(join(tmpdir(), 'strata-scratch-'));
  made.push(base);
  return join(base, name);
};

afterAll(() => {
  for (const base of made) rmSync(base, { recursive: true, force: true });
});

const listing = (root: string): string[] =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) =>
      join(e.parentPath, e.name)
        .slice(root.length + 1)
        .split('\\')
        .join('/'),
    )
    .filter((p) => !p.startsWith('.git/') && p !== MARKER)
    .sort();

const contents = (root: string): Record<string, string> =>
  Object.fromEntries(listing(root).map((p) => [p, readFileSync(join(root, p), 'utf8')]));

describe('scratch', () => {
  it(
    'marks what it seeds and finds it again',
    () => {
      const root = where('seeded');
      expect(seedScratch(root, SEED).root).toBe(realAt(root));
      expect(openScratch(root)?.root).toBe(realAt(root));
    },
    GIT_MS,
  );

  it(
    'does not open a directory it never marked',
    () => {
      const root = where('foreign');
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'a.ts'), 'x\n');
      expect(openScratch(root)).toBeUndefined();
    },
    GIT_MS,
  );

  it(
    'refuses to reset a directory that is not one of ours',
    () => {
      const root = where('foreign');
      mkdirSync(root, { recursive: true });
      writeFileSync(join(root, 'a.ts'), 'x\n');
      expect(() => seedScratch(root, SEED)).toThrow(/not a strata scratch repo/);
    },
    GIT_MS,
  );

  it(
    'refuses a scratch path that overlaps a watched repo, through a symlinked parent',
    () => {
      const given = where('watched');
      const watched = realpathSync(seedScratch(given, SEED).root);
      expect(() => cloneScratch(watched, join(where('outer'), '..', 'x'), [watched])).not.toThrow();
      for (const inside of [join(given, 'inside'), join(given, 'a', 'b'), join(watched, 'c')]) {
        expect(() => cloneScratch(watched, inside, [watched])).toThrow(
          /cannot sit inside a watched repo/,
        );
      }
    },
    GIT_MS,
  );

  it(
    'reuses a clone of the same source and only rebuilds when asked',
    () => {
      const source = realAt(seedScratch(where('source'), SEED).root);
      const at = where('scratch');
      const first = scratchFor(source, at, [source]);
      expect(first.cloned).toBe(true);
      expect(sourceOf(first.scratch.root)).toBe(source);
      writeFileSync(join(first.scratch.root, 'kept.ts'), 'x\n');

      const again = scratchFor(source, at, [source]);
      expect(again.cloned).toBe(false);
      expect(existsSync(join(again.scratch.root, 'kept.ts'))).toBe(true);

      const forced = scratchFor(source, at, [source], true);
      expect(forced.cloned).toBe(true);
      expect(existsSync(join(forced.scratch.root, 'kept.ts'))).toBe(false);
    },
    GIT_MS,
  );

  it(
    'rebuilds when the scratch was cloned from a different repo',
    () => {
      const one = realAt(seedScratch(where('one'), SEED).root);
      const two = realAt(seedScratch(where('two'), SEED).root);
      const at = where('scratch');
      expect(scratchFor(one, at, [one, two]).cloned).toBe(true);
      expect(scratchFor(one, at, [one, two]).cloned).toBe(false);
      expect(scratchFor(two, at, [one, two]).cloned).toBe(true);
      expect(sourceOf(realAt(at))).toBe(two);
    },
    GIT_MS,
  );

  it(
    'leaves nothing that blocks the next run when a build is interrupted',
    () => {
      const source = realAt(seedScratch(where('source'), SEED).root);
      const at = where('scratch');
      mkdirSync(`${at}.staging-999`, { recursive: true });
      writeFileSync(join(`${at}.staging-999`, 'half.ts'), 'x\n');
      const built = scratchFor(source, at, [source]);
      expect(built.cloned).toBe(true);
      expect(openScratch(at)).toBeDefined();
      expect(existsSync(`${at}.staging-999`)).toBe(false);
    },
    GIT_MS,
  );

  it(
    'keeps the source untouched while every action runs against a clone',
    () => {
      const source = where('source');
      seedScratch(source, SEED);
      const before = contents(source);
      const clone = cloneScratch(source, where('clone'), [source]);
      const actions = new ScratchActions(
        clone,
        repoId('probe'),
        () => listing(clone.root).map(repoPath),
        random(3),
      );
      for (const action of [...SCRATCH_ACTIONS, ...SCRATCH_ACTIONS]) actions.run(action);
      expect(listing(clone.root)).not.toEqual(listing(source));
      expect(contents(source)).toEqual(before);
    },
    GIT_MS,
  );
});
