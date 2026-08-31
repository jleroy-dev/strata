import { describe, expect, it } from 'vitest';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { placeBlocks } from './hierarchy.js';
import { layoutOf } from './layout.js';
import { route, sameContinent } from './route.js';
import { qualify, repoId, repoPath } from './qualified.js';
import { REPO, at } from './fixtures/ids.js';

const layout = layoutOf(
  placeBlocks(
    REPO,
    FIXTURE_FILES.map(([id]) => id),
    new Map(FIXTURE_FILES),
  ),
);

const from = at('apps/api/src/main.ts');
const to = at('apps/web/src/app/pages/home.page.ts');

describe('route', () => {
  it('walks lattice corners one step at a time from block to block', () => {
    const path = route(layout, from, to);
    expect(path[0]).toEqual(layout.blocks.get(from)!.cell);
    expect(path.at(-1)).toEqual(layout.blocks.get(to)!.cell);
    for (let i = 1; i < path.length; i++) {
      const step = Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.z - path[i - 1]!.z);
      expect(step).toBe(1);
    }
  });

  it('prefers the street around a platform to the alleys through it', () => {
    const path = route(layout, from, to);
    expect(path.length).toBeGreaterThan(4);
    const occupied = new Set(
      [...layout.blocks.values()]
        .filter((p) => p.country.startsWith(`${REPO}:apps/`))
        .map((p) => `${String(p.cell.x)},${String(p.cell.z)}`),
    );
    let alleys = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const both =
        a.x === b.x
          ? occupied.has(`${String(a.x - 1)},${String(Math.min(a.z, b.z))}`) &&
            occupied.has(`${String(a.x)},${String(Math.min(a.z, b.z))}`)
          : occupied.has(`${String(Math.min(a.x, b.x))},${String(a.z - 1)}`) &&
            occupied.has(`${String(Math.min(a.x, b.x))},${String(a.z)}`);
      if (both) alleys++;
    }
    expect(alleys).toBeLessThanOrEqual(2);
  });

  it('walks the avenues between two countries of one repo', () => {
    const abroad = at('libs/story/engine/src/lib/engine.ts');
    expect(sameContinent(layout, from, abroad)).toBe(true);
    expect(route(layout, from, abroad).length).toBeGreaterThan(0);
  });

  it('has no streets between continents', () => {
    const other = repoId('other');
    const abroad = qualify(other, repoPath('apps/api/src/main.ts'));
    const merged = {
      ...layout,
      blocks: new Map([
        ...layout.blocks,
        [abroad, { ...layout.blocks.get(from)!, country: qualify(other, repoPath('apps/api')) }],
      ]),
    };
    expect(sameContinent(merged, from, abroad)).toBe(false);
    expect(route(merged, from, abroad)).toEqual([]);
  });

  it('returns nothing for an unknown block', () => {
    expect(route(layout, at('nope.ts'), from)).toEqual([]);
  });
});
