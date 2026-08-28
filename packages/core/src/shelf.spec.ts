import { describe, expect, it } from 'vitest';
import { adjacent, apart, shelf, shelfAt } from './shelf.js';

describe('shelf', () => {
  it('lays items in rows and reports the extent', () => {
    const items = [
      { x: 0, z: 0, w: 3, h: 2 },
      { x: 0, z: 0, w: 3, h: 1 },
      { x: 0, z: 0, w: 3, h: 3 },
    ];
    expect(shelfAt(items, 7, 1)).toEqual({ w: 7, h: 6 });
    expect(items.map((i) => [i.x, i.z])).toEqual([
      [0, 0],
      [4, 0],
      [0, 3],
    ]);
  });

  it('picks the width closest to square', () => {
    const items = Array.from({ length: 16 }, () => ({ x: 0, z: 0, w: 2, h: 2 }));
    const extent = shelf(items, 1);
    expect(extent).toEqual({ w: 11, h: 11 });
  });

  it('never packs narrower than the widest item', () => {
    const items = [
      { x: 0, z: 0, w: 20, h: 1 },
      { x: 0, z: 0, w: 1, h: 1 },
    ];
    expect(shelf(items, 1).w).toBe(20);
  });
});

describe('apart and adjacent', () => {
  const a = { x: 0, z: 0, w: 4, h: 4 };
  it('measures the gap on the clear axis', () => {
    expect(apart(a, { x: 5, z: 0, w: 4, h: 4 }, 1)).toBe(true);
    expect(apart(a, { x: 5, z: 0, w: 4, h: 4 }, 3)).toBe(false);
    expect(apart(a, { x: 2, z: 2, w: 4, h: 4 }, 1)).toBe(false);
  });

  it('calls plates across a street adjacent, but not diagonal ones', () => {
    expect(adjacent(a, { x: 7, z: 0, w: 4, h: 4 }, 3)).toBe(true);
    expect(adjacent(a, { x: 7, z: 7, w: 4, h: 4 }, 3)).toBe(false);
    expect(adjacent(a, { x: 8, z: 0, w: 4, h: 4 }, 3)).toBe(false);
  });
});
