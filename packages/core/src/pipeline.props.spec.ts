import { fc, test } from '@fast-check/vitest';
import { describe, expect } from 'vitest';
import { REPO } from './fixtures/ids.js';
import { COUNTRY_SKIRT, DISTRICT_SKIRT, contains, skirted } from './footprint.js';
import { placeBlocks } from './hierarchy.js';
import { applyTerrain, layoutOf, type Layout } from './layout.js';
import { motions, type Motion, type World } from './motion.js';
import { reconcile, type Listing } from './terrain.js';
import { repoOfName, repoPath, type BlockId } from './qualified.js';

interface File {
  path: string;
  sha: string;
  size: number;
}

const AREA = ['apps', 'libs', 'tools'] as const;
const PROJECT = ['api', 'web', 'ui', 'engine'] as const;
const FOLDER = ['src', 'src/app', 'src/pages', 'src/lib', 'docs'] as const;
const LEAF = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.md', 'f.md'] as const;

const fileArb = fc
  .tuple(
    fc.constantFrom(...AREA),
    fc.constantFrom(...PROJECT),
    fc.constantFrom(...FOLDER),
    fc.constantFrom(...LEAF),
    fc.integer({ min: 100, max: 40_000 }),
  )
  .map(([area, project, folder, leaf, size]) => ({
    path: `${area}/${project}/${folder}/${leaf}`,
    sha: `${area}/${project}/${folder}/${leaf}`,
    size,
  }));

/** A repo is the generated files plus a marker for every project they land in. */
const repoArb = fc
  .uniqueArray(fileArb, { minLength: 1, maxLength: 24, selector: (f) => f.path })
  .map((files) => {
    const markers = [...new Set(files.map((f) => f.path.split('/').slice(0, 2).join('/')))].map(
      (dir) => ({ path: `${dir}/package.json`, sha: `${dir}/package.json`, size: 400 }),
    );
    return [...files, ...markers];
  });

type Mutation =
  | { kind: 'rename-folder' }
  | { kind: 'move-folder' }
  | { kind: 'rename-file' }
  | { kind: 'move-file' }
  | { kind: 'add' }
  | { kind: 'remove' }
  | { kind: 'resize' };

const mutationArb: fc.Arbitrary<Mutation> = fc.constantFrom(
  { kind: 'rename-folder' },
  { kind: 'move-folder' },
  { kind: 'rename-file' },
  { kind: 'move-file' },
  { kind: 'add' },
  { kind: 'remove' },
  { kind: 'resize' },
);

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const projectOf = (path: string): string => path.split('/').slice(0, 2).join('/');

/** Applies one shaped change, or nothing when the repo cannot host it. */
function mutate(files: File[], mutation: Mutation, pick: number): File[] {
  const at = <T>(list: readonly T[]): T | undefined =>
    list.length === 0 ? undefined : list[pick % list.length];
  const leaves = files.filter((f) => nameOf(f.path) !== 'package.json');
  const dirs = [...new Set(leaves.map((f) => dirOf(f.path)))];
  switch (mutation.kind) {
    case 'rename-folder': {
      const dir = at(dirs);
      if (dir === undefined) return files;
      const to = `${dir}-r`;
      return files.map((f) =>
        f.path.startsWith(`${dir}/`) ? { ...f, path: `${to}/${nameOf(f.path)}` } : f,
      );
    }
    case 'move-folder': {
      const dir = at(dirs);
      if (dir === undefined) return files;
      const elsewhere = [...new Set(files.map((f) => projectOf(f.path)))].filter(
        (p) => p !== projectOf(dir),
      );
      const host = at(elsewhere);
      if (host === undefined) return files;
      const to = `${host}/${nameOf(dir)}`;
      if (dirs.includes(to)) return files;
      return files.map((f) =>
        f.path.startsWith(`${dir}/`) ? { ...f, path: `${to}/${nameOf(f.path)}` } : f,
      );
    }
    case 'rename-file': {
      const file = at(leaves);
      if (file === undefined) return files;
      const to = `${dirOf(file.path)}/renamed-${nameOf(file.path)}`;
      if (files.some((f) => f.path === to)) return files;
      return files.map((f) => (f.path === file.path ? { ...f, path: to } : f));
    }
    case 'move-file': {
      const file = at(leaves);
      const host = at(dirs.filter((d) => d !== dirOf(file?.path ?? '')));
      if (file === undefined || host === undefined) return files;
      const to = `${host}/${nameOf(file.path)}`;
      if (files.some((f) => f.path === to)) return files;
      return files.map((f) => (f.path === file.path ? { ...f, path: to } : f));
    }
    case 'add': {
      const dir = at(dirs);
      if (dir === undefined) return files;
      const to = `${dir}/added.ts`;
      if (files.some((f) => f.path === to)) return files;
      return [...files, { path: to, sha: to, size: 900 }];
    }
    case 'remove': {
      const file = at(leaves);
      return file === undefined ? files : files.filter((f) => f.path !== file.path);
    }
    case 'resize': {
      const file = at(leaves);
      return file === undefined
        ? files
        : files.map((f) => (f.path === file.path ? { ...f, size: f.size + 5000 } : f));
    }
  }
}

const listingOf = (files: File[]): Listing =>
  new Map(files.map((f) => [repoPath(f.path), { size: f.size, sha: f.sha }]));

const layoutFor = (files: File[]): Layout =>
  layoutOf(
    placeBlocks(
      REPO,
      files.map((f) => f.path),
      new Map(files.map((f) => [f.path, f.size])),
    ),
  );

const world = (layout: Layout): World => ({ layout, sessions: new Map() });

/** Runs the server's pipeline: list, reconcile, apply, then read the motions off the pair. */
function run(before: File[], after: File[]) {
  const previous = listingOf(before);
  const next = listingOf(after);
  const changes = reconcile(REPO, previous, next);
  let layout = layoutFor(before);
  const renames = new Map<BlockId, BlockId>();
  const folders = new Map<string, string>();
  for (const change of changes) {
    layout = applyTerrain(layout, change).layout;
    if (change.kind === 'block.moved') renames.set(change.block.id, change.from);
    if (change.kind === 'folder.moved') folders.set(change.from, change.to);
  }
  return {
    changes,
    layout,
    settled: layoutFor(after),
    ms: motions(world(layoutFor(before)), world(layout), renames, folders),
    renames,
  };
}

const covered = (motion: Motion): BlockId[] => {
  switch (motion.kind) {
    case 'rise':
    case 'sink':
    case 'slide':
    case 'blink':
    case 'flight':
      return [motion.id];
    case 'platform':
      return motion.moves.map((m) => m.id);
    default:
      return [];
  }
};

const seed = { seed: 42, numRuns: 300 };

describe('the terrain pipeline', () => {
  test.prop([repoArb, mutationArb, fc.nat()], seed)(
    'never emits a motion that goes nowhere',
    (files, mutation, pick) => {
      const { ms } = run(files, mutate(files, mutation, pick));
      for (const m of ms) {
        if (m.kind === 'slide' || m.kind === 'flight') {
          expect([m.kind, m.fromCell]).not.toEqual([m.kind, m.toCell]);
        }
        if (m.kind === 'platform') {
          expect(
            m.moves.some(
              (move) => move.fromCell.x !== move.toCell.x || move.fromCell.z !== move.toCell.z,
            ),
          ).toBe(true);
        }
      }
    },
  );

  test.prop([repoArb, mutationArb, fc.nat()], seed)(
    'accounts for every block at most once',
    (files, mutation, pick) => {
      const { ms } = run(files, mutate(files, mutation, pick));
      const seen = new Map<BlockId, number>();
      for (const m of ms) for (const id of covered(m)) seen.set(id, (seen.get(id) ?? 0) + 1);
      for (const [, count] of seen) expect(count).toBe(1);
    },
  );

  test.prop([repoArb, mutationArb, fc.nat()], seed)(
    'folds its own changes back into the layout it would have built',
    (files, mutation, pick) => {
      const after = mutate(files, mutation, pick);
      const { layout, settled } = run(files, after);
      expect([...layout.blocks.keys()].sort()).toEqual([...settled.blocks.keys()].sort());
      for (const [id, placed] of settled.blocks) {
        expect([id, layout.blocks.get(id)?.country, layout.blocks.get(id)?.district]).toEqual([
          id,
          placed.country,
          placed.district,
        ]);
      }
    },
  );

  test.prop([repoArb, mutationArb, fc.nat()], seed)(
    'draws every plate inside the one it stands on',
    (files, mutation, pick) => {
      const { layout } = run(files, mutate(files, mutation, pick));
      const countries = new Map(layout.countries.map((c) => [c.country, c]));
      const continents = new Map(layout.continents.map((c) => [c.repo, c]));
      for (const d of layout.districts) {
        const country = countries.get(d.country);
        expect([d.district, country]).not.toEqual([d.district, undefined]);
        expect([
          d.district,
          contains(skirted(country!, COUNTRY_SKIRT), skirted(d, DISTRICT_SKIRT)),
        ]).toEqual([d.district, true]);
      }
      for (const c of layout.countries) {
        const ct = continents.get(repoOfName(c.country));
        expect([c.country, ct]).not.toEqual([c.country, undefined]);
        const at = ct!.at;
        const stood = { x: at.x + c.x, z: at.z + c.z, w: c.w, h: c.h };
        expect([c.country, contains(ct!.land, skirted(stood, COUNTRY_SKIRT))]).toEqual([
          c.country,
          true,
        ]);
      }
    },
  );

  test.prop([repoArb], seed)('places a repo the same way whatever order it is listed', (files) => {
    const forward = layoutFor(files);
    const backward = layoutFor([...files].reverse());
    expect([...backward.blocks].map(([id, p]) => [id, p.cell])).toEqual(
      [...forward.blocks].map(([id, p]) => [id, p.cell]),
    );
  });
});
