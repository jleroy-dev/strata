import { COUNTRY_SKIRT, DISTRICT_SKIRT, skirted } from './footprint.js';
import type { Layout } from './layout.js';
import { repoOf, repoOfName, type BlockId, type RepoId } from './qualified.js';
import type { Rect } from './shelf.js';

export interface Tiers {
  water: number;
  land: number;
  country: number;
  district: number;
}

export interface Terrain {
  topAt(x: number, z: number): number;
  baseAt(x: number, z: number): number;
  towerTopAt(x: number, z: number): number | undefined;
}

const key = (x: number, z: number): number => (x + 4096) * 65536 + (z + 4096);

function raise(tops: Map<number, number>, rect: Rect, top: number): void {
  const x0 = Math.floor(rect.x);
  const z0 = Math.floor(rect.z);
  const x1 = Math.ceil(rect.x + rect.w);
  const z1 = Math.ceil(rect.z + rect.h);
  for (let x = x0; x < x1; x++) {
    for (let z = z0; z < z1; z++) {
      const k = key(x, z);
      const held = tops.get(k);
      if (held === undefined || held < top) tops.set(k, top);
    }
  }
}

export function worldCellOf(layout: Layout, id: BlockId): { x: number; z: number } | undefined {
  const block = layout.blocks.get(id);
  if (!block) return undefined;
  const repo = repoOf(id);
  const continent = layout.continents.find((c) => c.repo === repo);
  if (!continent) return undefined;
  return { x: block.cell.x + continent.at.x, z: block.cell.z + continent.at.z };
}

export function terrainOf(layout: Layout, tiers: Tiers): Terrain {
  const origins = new Map<RepoId, { x: number; z: number }>();
  for (const continent of layout.continents) origins.set(continent.repo, continent.at);

  const tops = new Map<number, number>();
  const base = new Map<number, number>();
  const towers = new Map<number, number>();

  for (const continent of layout.continents) raise(tops, continent.land, tiers.land);
  for (const continent of layout.continents) raise(base, continent.land, tiers.land);

  for (const country of layout.countries) {
    const at = origins.get(repoOfName(country.country));
    if (!at) continue;
    const plate = skirted({ ...country, x: country.x + at.x, z: country.z + at.z }, COUNTRY_SKIRT);
    raise(tops, plate, tiers.country);
    raise(base, plate, tiers.country);
  }

  for (const district of layout.districts) {
    const at = origins.get(repoOfName(district.country));
    if (!at) continue;
    const platform = skirted(
      { ...district, x: district.x + at.x, z: district.z + at.z },
      DISTRICT_SKIRT,
    );
    raise(tops, platform, tiers.district);
    raise(base, platform, tiers.district);
  }

  for (const [id, block] of layout.blocks) {
    const at = origins.get(repoOf(id));
    if (!at) continue;
    const x = block.cell.x + at.x;
    const z = block.cell.z + at.z;
    const top = tiers.district + block.height;
    const k = key(x, z);
    const held = towers.get(k);
    if (held === undefined || held < top) towers.set(k, top);
    raise(tops, { x, z, w: 1, h: 1 }, top);
  }

  return {
    topAt: (x, z) => tops.get(key(Math.floor(x), Math.floor(z))) ?? tiers.water,
    baseAt: (x, z) => base.get(key(Math.floor(x), Math.floor(z))) ?? tiers.water,
    towerTopAt: (x, z) => towers.get(key(Math.floor(x), Math.floor(z))),
  };
}
