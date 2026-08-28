import { describe, expect, it } from 'vitest';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { placeBlocks } from './hierarchy.js';
import { layoutOf } from './layout.js';
import { route } from './route.js';

const layout = layoutOf(
  placeBlocks(
    FIXTURE_FILES.map(([id]) => id),
    new Map(FIXTURE_FILES),
  ),
);

describe('route', () => {
  it('walks lattice corners one step at a time from block to block', () => {
    const from = 'apps/api/src/main.ts';
    const to = 'libs/story/engine/src/lib/engine.ts';
    const path = route(layout, from, to);
    expect(path[0]).toEqual(layout.blocks.get(from)!.cell);
    expect(path.at(-1)).toEqual(layout.blocks.get(to)!.cell);
    for (let i = 1; i < path.length; i++) {
      const step = Math.abs(path[i]!.x - path[i - 1]!.x) + Math.abs(path[i]!.z - path[i - 1]!.z);
      expect(step).toBe(1);
    }
  });

  it('prefers the street around a platform to the alleys through it', () => {
    const from = 'apps/api/src/main.ts';
    const to = 'libs/story/engine/src/lib/engine.ts';
    const path = route(layout, from, to);
    expect(path.length).toBeGreaterThan(4);
    const occupied = new Set(
      [...layout.blocks.values()].map((p) => `${String(p.cell.x)},${String(p.cell.z)}`),
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

  it('returns nothing for an unknown block', () => {
    expect(route(layout, 'nope.ts', 'apps/api/src/main.ts')).toEqual([]);
  });
});
