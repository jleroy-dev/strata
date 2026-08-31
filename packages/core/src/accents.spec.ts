import { describe, expect, it } from 'vitest';
import { NO_VARIANT, assignVariants, type Plate } from './accents.js';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { placeBlocks } from './hierarchy.js';
import { COUNTRY_GAP, layoutOf } from './layout.js';
import { adjacent } from './shelf.js';
import { REPO } from './fixtures/ids.js';

const plate = (x: number, z: number, w = 4, h = 4, variant = NO_VARIANT): Plate => ({
  x,
  z,
  w,
  h,
  variant,
});

describe('assignVariants', () => {
  it('gives touching plates different variants', () => {
    const plates = [plate(0, 0), plate(7, 0), plate(0, 7), plate(7, 7)];
    assignVariants(plates, 3);
    expect(plates[0]!.variant).not.toBe(plates[1]!.variant);
    expect(plates[0]!.variant).not.toBe(plates[2]!.variant);
    expect(plates[3]!.variant).not.toBe(plates[1]!.variant);
    expect(plates[3]!.variant).not.toBe(plates[2]!.variant);
  });

  it('keeps a variant that still differs from every neighbour', () => {
    const plates = [plate(0, 0, 4, 4, 3), plate(7, 0, 4, 4, 1)];
    assignVariants(plates, 3);
    expect(plates.map((p) => p.variant)).toEqual([3, 1]);
  });

  it('is deterministic', () => {
    const a = [plate(0, 0), plate(7, 0), plate(14, 0)];
    const b = [plate(0, 0), plate(7, 0), plate(14, 0)];
    assignVariants(a, 3);
    assignVariants(b, 3);
    expect(a).toEqual(b);
  });

  it('separates every touching pair on the fixture', () => {
    const layout = layoutOf(
      placeBlocks(
        REPO,
        FIXTURE_FILES.map(([id]) => id),
        new Map(FIXTURE_FILES),
      ),
    );
    for (const a of layout.countries) {
      for (const b of layout.countries) {
        if (a === b || !adjacent(a, b, COUNTRY_GAP)) continue;
        expect(`${a.family}${String(a.variant)}`).not.toBe(`${b.family}${String(b.variant)}`);
      }
    }
  });
});
