import { describe, expect, it } from 'vitest';
import type { Block } from './events.js';
import { FIXTURE_FILES } from './fixtures/repo.js';
import { REPO, at } from './fixtures/ids.js';
import { pathOf, repoOfName, type BlockId } from './qualified.js';
import { placeBlocks } from './hierarchy.js';
import { FAMILIES, familyRank } from './family.js';
import {
  COUNTRY_GAP,
  DISTRICT_GAP,
  applyTerrain,
  capacity,
  layoutFrom,
  layoutOf,
  parseLayout,
  serializeLayout,
  type CountryPlate,
  type Layout,
  type SerializedLayout,
} from './layout.js';
import { apart, type Rect } from './shelf.js';

const fixture = (): Block[] =>
  placeBlocks(
    REPO,
    FIXTURE_FILES.map(([id]) => id),
    new Map(FIXTURE_FILES),
  );

const base = layoutOf(fixture());

const block = (path: string, size = 1000): Block =>
  placeBlocks(REPO, [path, ...FIXTURE_FILES.map(([f]) => f)], new Map([[path, size]])).find(
    (b) => b.id === at(path),
  )!;

const cellsOf = (layout: Layout): Map<BlockId, string> =>
  new Map([...layout.blocks].map(([id, p]) => [id, `${String(p.cell.x)},${String(p.cell.z)}`]));

const unchangedExcept = (before: Layout, after: Layout, except: readonly BlockId[]): BlockId[] =>
  [...cellsOf(before)]
    .filter(([id, cell]) => !except.includes(id) && cellsOf(after).get(id) !== cell)
    .map(([id]) => id);

const pairwiseApart = (rects: readonly Rect[], gap: number): boolean =>
  rects.every((a, i) => rects.every((b, j) => i === j || apart(a, b, gap)));

const byContinent = (layout: Layout): CountryPlate[][] =>
  layout.continents.map((ct) => layout.countries.filter((c) => repoOfName(c.country) === ct.repo));

const continentsApart = (layout: Layout): boolean =>
  byContinent(layout).every((plates) => pairwiseApart(plates, COUNTRY_GAP));

describe('layoutOf', () => {
  it('is pinned by the fixture snapshot', async () => {
    await expect(`${JSON.stringify(serializeLayout(base), null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/layout.fixture.json',
    );
  });

  it('does not depend on input order', () => {
    const shuffled = [...fixture()].reverse();
    expect(serializeLayout(layoutOf(shuffled))).toEqual(serializeLayout(base));
  });

  it('places every block on its own cell of its continent, inside its district', () => {
    const seen = new Set<string>();
    for (const [, p] of base.blocks) {
      const key = `${repoOfName(p.country)}:${String(p.cell.x)},${String(p.cell.z)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const d = base.districts.find((r) => r.country === p.country && r.district === p.district)!;
      expect(p.cell.x).toBeGreaterThanOrEqual(d.x);
      expect(p.cell.x).toBeLessThan(d.x + d.w);
      expect(p.cell.z).toBeGreaterThanOrEqual(d.z);
      expect(p.cell.z).toBeLessThan(d.z + d.h);
    }
  });

  it('keeps one cell between districts and three between countries', () => {
    for (const c of base.countries) {
      expect(
        pairwiseApart(
          base.districts.filter((d) => d.country === c.country),
          DISTRICT_GAP,
        ),
      ).toBe(true);
    }
    expect(continentsApart(base)).toBe(true);
  });

  it('gives a repo one continent that spans its countries', () => {
    expect(base.continents.map((c) => c.repo)).toEqual([REPO]);
    for (const [ct, plates] of base.continents.map((c, i) => [c, byContinent(base)[i]!] as const)) {
      expect(plates.length).toBeGreaterThan(0);
      expect(Math.max(...plates.map((p) => p.x + p.w))).toBe(ct.extent.w);
      expect(Math.max(...plates.map((p) => p.z + p.h))).toBe(ct.extent.h);
      expect(ct.claim.w).toBeGreaterThanOrEqual(ct.extent.w);
      expect(ct.claim.h).toBeGreaterThanOrEqual(ct.extent.h);
    }
    expect(base.world).toEqual(base.continents[0]!.claim);
  });

  it('packs a continent by family, so hue and place say the same thing', () => {
    const rank = new Map(FAMILIES.map((f) => [f, familyRank(f)]));
    const rows = [...base.countries].sort((a, b) => a.z - b.z || a.x - b.x);
    const seen = rows.map((c) => rank.get(c.family)!);
    expect(Math.min(...seen)).toBe(seen[0]);
    expect(Math.max(...seen)).toBe(seen[seen.length - 1]);
  });

  it('never shrinks a continent, so growth at an edge moves no country', () => {
    let layout = base;
    for (let i = 0; i < 30; i++) {
      const added = block(`apps/api/src/app/rooms/handler-${String(i)}.ts`);
      layout = applyTerrain(layout, { kind: 'block.added', block: added }).layout;
    }
    const after = layout.continents.find((c) => c.repo === REPO)!;
    const before = base.continents.find((c) => c.repo === REPO)!;
    expect(after.at).toEqual(before.at);
    expect(after.extent.w).toBeGreaterThanOrEqual(before.extent.w);
    expect(after.extent.h).toBeGreaterThanOrEqual(before.extent.h);
  });

  it('gives every district about 20% slack', () => {
    for (const d of base.districts) {
      const count = [...base.blocks.values()].filter(
        (p) => p.country === d.country && p.district === d.district,
      ).length;
      expect(d.w * d.h).toBeGreaterThanOrEqual(capacity(count));
    }
  });

  it('aims each continent at a square', () => {
    for (const [i, ct] of base.continents.entries()) {
      if (byContinent(base)[i]!.length < 3) continue;
      const aspect = ct.extent.w / ct.extent.h;
      expect(aspect).toBeGreaterThan(0.8);
      expect(aspect).toBeLessThan(1.25);
    }
  });

  it('lists countries by family first', () => {
    const ranks = base.countries.map((c) => ['apps', 'libs', 'docs', 'plumbing'].indexOf(c.family));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('gives a binary the slab and text its size', () => {
    const slab = base.blocks.get(at('apps/web/src/assets/fonts/inter.woff2'))!;
    const text = base.blocks.get(at('libs/story/engine/src/lib/engine.ts'))!;
    expect(slab.binary).toBe(true);
    expect(slab.height).toBeLessThan(text.height);
  });

  it('round-trips through serialisation', () => {
    const wire = JSON.parse(JSON.stringify(serializeLayout(base))) as SerializedLayout;
    expect(parseLayout(wire)).toEqual(base);
  });
});

describe('applyTerrain', () => {
  it('adds a block within slack without moving anything else', () => {
    const added = block('libs/shared/models/src/lib/session.ts');
    const { layout, placement, repack } = applyTerrain(base, { kind: 'block.added', block: added });
    expect(repack).toBeUndefined();
    expect(placement?.district).toBe('src/lib');
    expect(layout.blocks.get(added.id)).toEqual(placement);
    expect(unchangedExcept(base, layout, [added.id])).toEqual([]);
    expect(layout.districts).toEqual(base.districts);
  });

  it('takes the first free cell, so an arrival after a removal fills the hole', () => {
    const gone = at('libs/shared/ui/src/lib/dialog/dialog.service.ts');
    const hole = base.blocks.get(gone)!.cell;
    const removed = applyTerrain(base, { kind: 'block.removed', id: gone }).layout;
    expect(removed.blocks.has(gone)).toBe(false);
    expect(unchangedExcept(base, removed, [gone])).toEqual([]);
    expect(removed.districts).toEqual(base.districts);
    const added = block('libs/shared/ui/src/lib/dialog/dialog.animations.ts');
    const { placement } = applyTerrain(removed, { kind: 'block.added', block: added });
    expect(placement?.cell).toEqual(hole);
  });

  it('keeps the cell on a rename in place', () => {
    const from = at('apps/api/src/app/rooms/rooms.service.ts');
    const renamed = block('apps/api/src/app/rooms/room.service.ts', 5200);
    const { layout, placement, repack } = applyTerrain(base, {
      kind: 'block.moved',
      from,
      block: renamed,
    });
    expect(repack).toBeUndefined();
    expect(placement?.cell).toEqual(base.blocks.get(from)!.cell);
    expect(layout.blocks.has(from)).toBe(false);
    expect(unchangedExcept(base, layout, [from])).toEqual([]);
  });

  it('grows a full district in place before it moves anything', () => {
    let layout = base;
    const ids: string[] = [];
    let repacked = 0;
    for (let i = 0; i < 6; i++) {
      const added = block(`libs/shared/models/src/lib/entity-${String(i)}.ts`);
      ids.push(added.id);
      const result = applyTerrain(layout, { kind: 'block.added', block: added });
      if (result.repack) {
        repacked++;
        expect(result.repack.scope).toBe('district');
      }
      expect(unchangedExcept(layout, result.layout, [added.id])).toEqual([]);
      layout = result.layout;
    }
    expect(repacked).toBeGreaterThan(0);
    const before = base.districts.find(
      (d) => d.country === at('libs/shared/models') && d.district === 'src/lib',
    )!;
    const after = layout.districts.find(
      (d) => d.country === at('libs/shared/models') && d.district === 'src/lib',
    )!;
    expect(after.w * after.h).toBeGreaterThan(before.w * before.h);
    expect([after.x, after.z]).toEqual([before.x, before.z]);
  });

  it('re-shelves the country only when a platform edge reaches a neighbour', () => {
    let layout = base;
    let scope: string | undefined;
    for (let i = 0; i < 40 && scope !== 'country' && scope !== 'map'; i++) {
      const added = block(`apps/api/src/app/rooms/handler-${String(i)}.ts`);
      const result = applyTerrain(layout, { kind: 'block.added', block: added });
      scope = result.repack?.scope;
      layout = result.layout;
    }
    expect(['country', 'map']).toContain(scope);
    for (const c of layout.countries) {
      expect(
        pairwiseApart(
          layout.districts.filter((d) => d.country === c.country),
          DISTRICT_GAP,
        ),
      ).toBe(true);
    }
    expect(continentsApart(layout)).toBe(true);
    const untouched = layout.countries.filter((c) => c.country !== at('apps/api'));
    expect(untouched).toEqual(base.countries.filter((c) => c.country !== at('apps/api')));
    const outside = [...base.blocks]
      .filter(([, p]) => p.country !== at('apps/api'))
      .map(([id]) => id);
    const moved = unchangedExcept(base, layout, []).filter((id) => outside.includes(id));
    expect(moved).toEqual([]);
  });

  it('places a new district and a new country without moving the rest', () => {
    const inCountry = block('libs/shared/utils/src/lib/dates/parse.ts');
    const one = applyTerrain(base, { kind: 'block.added', block: inCountry });
    expect(['district', 'country']).toContain(one.repack?.scope);
    const inside = [...base.blocks]
      .filter(([, p]) => p.country === at('libs/shared/utils'))
      .map(([id]) => id);
    expect(unchangedExcept(base, one.layout, [inCountry.id, ...inside])).toEqual([]);
    expect(one.layout.countries.filter((c) => c.country !== at('libs/shared/utils'))).toEqual(
      base.countries.filter((c) => c.country !== at('libs/shared/utils')),
    );

    const newCountry = block('libs/story/player/package.json', 600);
    const two = applyTerrain(one.layout, { kind: 'block.added', block: newCountry });
    expect(two.repack?.scope).toBe('map');
    expect(unchangedExcept(one.layout, two.layout, [newCountry.id])).toEqual([]);
    expect(continentsApart(two.layout)).toBe(true);
    expect(two.layout.continents.map((c) => c.at)).toEqual(one.layout.continents.map((c) => c.at));
    expect(
      two.layout.countries.find((c) => c.country === at('libs/story/player'))?.variant,
    ).toBeGreaterThanOrEqual(0);
  });

  it('leaves the others where they were when a country is removed', () => {
    let layout = base;
    const ids = [...base.blocks].filter(([, p]) => p.country === at('apps/web')).map(([id]) => id);
    for (const id of ids) layout = applyTerrain(layout, { kind: 'block.removed', id }).layout;
    expect(unchangedExcept(base, layout, ids)).toEqual([]);
    expect(layout.countries).toEqual(base.countries.filter((c) => c.country !== at('apps/web')));
    expect(layout.districts.some((d) => d.country === at('apps/web'))).toBe(false);
    expect(layout.continents).toEqual(base.continents);
  });

  it('drops a district once its last block has moved away', () => {
    const ids = [...base.blocks]
      .filter(([, p]) => p.country === at('libs/shared/models') && p.district === 'src/lib')
      .map(([id]) => id);
    let layout = base;
    for (const id of ids) {
      const to = block(pathOf(id).replace('src/lib/', 'src/model/'));
      layout = applyTerrain(layout, { kind: 'block.moved', from: id, block: to }).layout;
    }
    const gone = layout.districts.some(
      (d) => d.country === at('libs/shared/models') && d.district === 'src/lib',
    );
    expect(gone).toBe(false);
    expect(
      layout.districts.some(
        (d) => d.country === at('libs/shared/models') && d.district === 'src/model',
      ),
    ).toBe(true);
  });

  it('shrinks a plate to its remaining platforms when districts leave', () => {
    const country = at('apps/api');
    const keep = base.districts
      .filter((d) => d.country === country)
      .sort((a, b) => a.w * a.h - b.w * b.h)[0]!;
    const ids = [...base.blocks]
      .filter(([, p]) => p.country === country && p.district !== keep.district)
      .map(([id]) => id);
    let layout = base;
    for (const id of ids) layout = applyTerrain(layout, { kind: 'block.removed', id }).layout;
    const after = layout.countries.find((c) => c.country === country)!;
    const rest = layout.districts.filter((d) => d.country === country);
    expect(rest.map((d) => [d.district, d.w, d.h])).toEqual([[keep.district, keep.w, keep.h]]);
    expect([after.w, after.h]).toEqual([keep.w, keep.h]);
    expect([after.x, after.z]).toEqual([rest[0]!.x, rest[0]!.z]);
    const outside = [...base.blocks].filter(([, p]) => p.country !== country).map(([id]) => id);
    expect(unchangedExcept(base, layout, []).filter((id) => outside.includes(id))).toEqual([]);
  });

  it('re-shelves a country when a platform arrives, and no other plate', () => {
    const arriving = block('apps/api/src/app/rooms/handlers/create.ts');
    const { layout, repack } = applyTerrain(base, { kind: 'block.added', block: arriving });
    expect(repack?.scope === 'country' || repack?.scope === 'district').toBe(true);
    const plate = layout.countries.find((c) => c.country === at('apps/api'))!;
    const ds = layout.districts.filter((d) => d.country === at('apps/api'));
    expect(pairwiseApart(ds, DISTRICT_GAP)).toBe(true);
    expect(Math.max(...ds.map((d) => d.x + d.w))).toBe(plate.x + plate.w);
    expect(layout.countries.filter((c) => c.country !== at('apps/api'))).toEqual(
      base.countries.filter((c) => c.country !== at('apps/api')),
    );
    const outside = [...base.blocks]
      .filter(([, p]) => p.country !== at('apps/api'))
      .map(([id]) => id);
    expect(unchangedExcept(base, layout, []).filter((id) => outside.includes(id))).toEqual([]);
  });

  it('closes the rows when a platform leaves', () => {
    const country = at('apps/api');
    const plate = base.countries.find((c) => c.country === country)!;
    const ds = base.districts.filter((d) => d.country === country);
    const leaving = ds.find((d) => d.x > plate.x && d.x + d.w < plate.x + plate.w) ?? ds[0]!;
    const ids = [...base.blocks]
      .filter(([, p]) => p.country === country && p.district === leaving.district)
      .map(([id]) => id);
    let layout = base;
    for (const id of ids) layout = applyTerrain(layout, { kind: 'block.removed', id }).layout;
    const after = layout.countries.find((c) => c.country === country)!;
    expect(after.w * after.h).toBeLessThanOrEqual(plate.w * plate.h);
    const rest = layout.districts.filter((d) => d.country === country);
    expect(pairwiseApart(rest, DISTRICT_GAP)).toBe(true);
    const area = rest.reduce((n, d) => n + d.w * d.h, 0);
    const before = ds
      .filter((d) => d.district !== leaving.district)
      .reduce((n, d) => n + d.w * d.h, 0);
    expect(area).toBe(before);
  });

  it('changes only the height on block.changed', () => {
    const id = at('docs/NOTES.md');
    const { layout } = applyTerrain(base, { kind: 'block.changed', id, size: 60000 });
    expect(layout.blocks.get(id)!.height).toBeGreaterThan(base.blocks.get(id)!.height);
    expect(unchangedExcept(base, layout, [])).toEqual([]);
  });
});

describe('layoutFrom', () => {
  it('keeps surviving cells when replaying a new listing over a previous layout', () => {
    const files = fixture().filter((b) => b.id !== at('docs/NOTES.md'));
    files.push(block('docs/ROADMAP.md', 3000));
    const layout = layoutFrom(files, base);
    expect(unchangedExcept(base, layout, [at('docs/NOTES.md')])).toEqual([]);
    expect(layout.blocks.has(at('docs/ROADMAP.md'))).toBe(true);
  });
});
