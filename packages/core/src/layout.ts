import { NO_VARIANT, assignVariants } from './accents.js';
import { isBinary } from './binary.js';
import type { Block, BlockId, TerrainChange } from './events.js';
import { familyOf, familyRank, type Family } from './family.js';
import { heightOf } from './height.js';
import { apart, shelf, shelfAt, type Extent, type Rect } from './shelf.js';

export const DISTRICT_GAP = 1;
export const COUNTRY_GAP = 3;
export const SLACK = 1.2;
export const RESHELVE_ASPECT = 1.5;

/** Why a country's platforms re-shelve; the one place that decides it. */
export type SettleReason = 'district-arrived' | 'district-left' | 'no-room';

export interface Cell {
  x: number;
  z: number;
}

export interface Placement {
  cell: Cell;
  height: number;
  size: number;
  binary: boolean;
  country: string;
  district: string;
}

export interface DistrictPlate extends Rect {
  country: string;
  district: string;
}

export interface CountryPlate extends Rect {
  country: string;
  family: Family;
  variant: number;
}

export interface Layout {
  blocks: ReadonlyMap<BlockId, Placement>;
  districts: readonly DistrictPlate[];
  countries: readonly CountryPlate[];
  extent: Extent;
}

export interface SerializedLayout {
  blocks: [BlockId, Placement][];
  districts: DistrictPlate[];
  countries: CountryPlate[];
  extent: Extent;
}

/**
 * `district`: one platform changed size, nothing on it moved. `country`: that country's
 * platforms moved. `map`: plates moved.
 */
export type RepackScope = 'district' | 'country' | 'map';

export interface Repack {
  scope: RepackScope;
  country: string;
  district?: string;
}

export interface LayoutResult {
  layout: Layout;
  placement?: Placement;
  repack?: Repack;
}

interface Tower {
  id: BlockId;
  x: number;
  z: number;
  height: number;
  size: number;
  binary: boolean;
}

interface District extends Rect {
  name: string;
  towers: Map<BlockId, Tower>;
}

interface Country extends Rect {
  name: string;
  family: Family;
  variant: number;
  districts: District[];
}

interface Model {
  countries: Country[];
  extent: Extent;
}

export function capacity(count: number): number {
  return Math.max(2, Math.ceil(count * SLACK) + 1);
}

function gridFor(count: number): Extent {
  const cap = capacity(count);
  const w = Math.max(1, Math.ceil(Math.sqrt(cap)));
  return { w, h: Math.max(1, Math.ceil(cap / w)) };
}

function tower(block: Block, x: number, z: number): Tower {
  return {
    id: block.id,
    x,
    z,
    height: heightOf(block.id, block.size),
    size: block.size,
    binary: isBinary(block.id),
  };
}

/** The cold layout: same blocks, same picture, whatever their order. */
export function layoutOf(blocks: readonly Block[]): Layout {
  const byCountry = new Map<string, Map<string, Block[]>>();
  for (const block of blocks) {
    let districts = byCountry.get(block.country);
    if (!districts) byCountry.set(block.country, (districts = new Map<string, Block[]>()));
    let list = districts.get(block.district);
    if (!list) districts.set(block.district, (list = []));
    list.push(block);
  }

  const countries: Country[] = [...byCountry].map(([name, byDistrict]) => {
    const districts: District[] = [...byDistrict]
      .sort(([a, la], [b, lb]) => lb.length - la.length || compare(a, b))
      .map(([district, list]) => {
        const { w, h } = gridFor(list.length);
        const towers = new Map<BlockId, Tower>();
        [...list]
          .sort((a, b) => compare(a.id, b.id))
          .forEach((block, i) => towers.set(block.id, tower(block, i % w, Math.floor(i / w))));
        return { name: district, x: 0, z: 0, w, h, towers };
      });
    const extent = shelf(districts, DISTRICT_GAP);
    return { name, family: familyOf(name), variant: NO_VARIANT, x: 0, z: 0, ...extent, districts };
  });
  countries.sort(
    (a, b) =>
      familyRank(a.family) - familyRank(b.family) ||
      b.w * b.h - a.w * a.h ||
      compare(a.name, b.name),
  );
  const extent = shelf(countries, COUNTRY_GAP);
  assignVariants(countries, COUNTRY_GAP);
  return toLayout({ countries, extent });
}

/** Applies one structural change, keeping every cell that still fits. */
export function applyTerrain(layout: Layout, change: TerrainChange): LayoutResult {
  const model = toModel(layout);
  switch (change.kind) {
    case 'block.added': {
      const { placement, repack } = add(model, change.block);
      return { layout: toLayout(model), placement, ...(repack && { repack }) };
    }
    case 'block.removed': {
      const repack = remove(model, change.id);
      return { layout: toLayout(model), ...(repack && { repack }) };
    }
    case 'folder.moved':
      return { layout };
    case 'block.changed': {
      const found = find(model, change.id);
      if (!found) return { layout: toLayout(model) };
      found.tower.height = heightOf(change.id, change.size);
      found.tower.size = change.size;
      return {
        layout: toLayout(model),
        placement: placementOf(found.country, found.district, found.tower),
      };
    }
    case 'block.moved': {
      const found = find(model, change.from);
      const { block } = change;
      if (found?.country.name === block.country && found.district.name === block.district) {
        found.district.towers.delete(change.from);
        const moved = { ...found.tower, ...tower(block, found.tower.x, found.tower.z) };
        found.district.towers.set(block.id, moved);
        return {
          layout: toLayout(model),
          placement: placementOf(found.country, found.district, moved),
        };
      }
      const dropped = remove(model, change.from);
      const { placement, repack } = add(model, block);
      const ground = repack ?? dropped;
      return { layout: toLayout(model), placement, ...(ground && { repack: ground }) };
    }
  }
}

/** Replays the difference between `previous` and `blocks` so surviving blocks keep their cells. */
export function layoutFrom(blocks: readonly Block[], previous: Layout): Layout {
  let layout = previous;
  const next = new Map(blocks.map((block) => [block.id, block]));
  for (const id of previous.blocks.keys()) {
    if (!next.has(id)) layout = applyTerrain(layout, { kind: 'block.removed', id }).layout;
  }
  for (const block of [...blocks].sort((a, b) => compare(a.id, b.id))) {
    const placed = layout.blocks.get(block.id);
    if (!placed) layout = applyTerrain(layout, { kind: 'block.added', block }).layout;
    else if (placed.country !== block.country || placed.district !== block.district) {
      layout = applyTerrain(layout, { kind: 'block.moved', from: block.id, block }).layout;
    } else {
      layout = applyTerrain(layout, {
        kind: 'block.changed',
        id: block.id,
        size: block.size,
      }).layout;
    }
  }
  return layout;
}

export function serializeLayout(layout: Layout): SerializedLayout {
  return {
    blocks: [...layout.blocks].sort(([a], [b]) => compare(a, b)),
    districts: [...layout.districts],
    countries: [...layout.countries],
    extent: layout.extent,
  };
}

/** Placements in `next` that are new or differ from `previous`, sorted by id. */
export function placementDelta(previous: Layout, next: Layout): [BlockId, Placement][] {
  const out: [BlockId, Placement][] = [];
  for (const [id, p] of next.blocks) {
    const before = previous.blocks.get(id);
    if (!before) {
      out.push([id, p]);
      continue;
    }
    const same =
      before.cell.x === p.cell.x &&
      before.cell.z === p.cell.z &&
      before.height === p.height &&
      before.size === p.size &&
      before.country === p.country &&
      before.district === p.district;
    if (!same) out.push([id, p]);
  }
  return out.sort(([a], [b]) => compare(a, b));
}

/** The rects and extent of a layout, what a repack carries beside its placements. */
export function groundOf(layout: Layout): {
  districts: DistrictPlate[];
  countries: CountryPlate[];
  extent: Extent;
} {
  return {
    districts: [...layout.districts],
    countries: [...layout.countries],
    extent: layout.extent,
  };
}

export function parseLayout(serialized: SerializedLayout): Layout {
  return { ...serialized, blocks: new Map(serialized.blocks) };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function placementOf(country: Country, district: District, t: Tower): Placement {
  return {
    cell: { x: country.x + district.x + t.x, z: country.z + district.z + t.z },
    height: t.height,
    size: t.size,
    binary: t.binary,
    country: country.name,
    district: district.name,
  };
}

/** Every plate is the bounding box of its platforms; block cells never change. */
function normalize(model: Model): void {
  for (const c of model.countries) {
    if (c.districts.length === 0) continue;
    const x0 = Math.min(...c.districts.map((d) => d.x));
    const z0 = Math.min(...c.districts.map((d) => d.z));
    const x1 = Math.max(...c.districts.map((d) => d.x + d.w));
    const z1 = Math.max(...c.districts.map((d) => d.z + d.h));
    for (const d of c.districts) {
      d.x -= x0;
      d.z -= z0;
    }
    c.x += x0;
    c.z += z0;
    c.w = x1 - x0;
    c.h = z1 - z0;
  }
}

function toLayout(model: Model): Layout {
  normalize(model);
  const entries: [BlockId, Placement][] = [];
  const districts: DistrictPlate[] = [];
  const countries: CountryPlate[] = [];
  for (const c of model.countries) {
    countries.push({
      country: c.name,
      family: c.family,
      variant: c.variant,
      x: c.x,
      z: c.z,
      w: c.w,
      h: c.h,
    });
    for (const d of c.districts) {
      districts.push({
        country: c.name,
        district: d.name,
        x: c.x + d.x,
        z: c.z + d.z,
        w: d.w,
        h: d.h,
      });
      for (const t of d.towers.values()) entries.push([t.id, placementOf(c, d, t)]);
    }
  }
  entries.sort(([a], [b]) => compare(a, b));
  return { blocks: new Map(entries), districts, countries, extent: { ...model.extent } };
}

function toModel(layout: Layout): Model {
  const countries: Country[] = layout.countries.map((c) => ({
    name: c.country,
    family: c.family,
    variant: c.variant,
    x: c.x,
    z: c.z,
    w: c.w,
    h: c.h,
    districts: [],
  }));
  const byName = new Map(countries.map((c) => [c.name, c]));
  const districts = new Map<string, District>();
  for (const d of layout.districts) {
    const c = byName.get(d.country);
    if (!c) continue;
    const district: District = {
      name: d.district,
      x: d.x - c.x,
      z: d.z - c.z,
      w: d.w,
      h: d.h,
      towers: new Map(),
    };
    c.districts.push(district);
    districts.set(`${d.country}\0${d.district}`, district);
  }
  for (const [id, p] of layout.blocks) {
    const c = byName.get(p.country);
    const d = districts.get(`${p.country}\0${p.district}`);
    if (!c || !d) continue;
    d.towers.set(id, {
      id,
      x: p.cell.x - c.x - d.x,
      z: p.cell.z - c.z - d.z,
      height: p.height,
      size: p.size,
      binary: p.binary,
    });
  }
  return { countries, extent: { ...layout.extent } };
}

function find(
  model: Model,
  id: BlockId,
): { country: Country; district: District; tower: Tower } | undefined {
  for (const country of model.countries) {
    for (const district of country.districts) {
      const t = district.towers.get(id);
      if (t) return { country, district, tower: t };
    }
  }
  return undefined;
}

function remove(model: Model, id: BlockId): Repack | undefined {
  const found = find(model, id);
  if (!found) return undefined;
  found.district.towers.delete(id);
  if (found.district.towers.size > 0) return undefined;
  found.country.districts = found.country.districts.filter((d) => d !== found.district);
  if (found.country.districts.length > 0) return settle(model, found.country, 'district-left');
  model.countries = model.countries.filter((c) => c !== found.country);
  return { scope: 'country', country: found.country.name };
}

function freeCell(district: District): Cell | undefined {
  const taken = new Set([...district.towers.values()].map((t) => `${String(t.x)},${String(t.z)}`));
  for (let z = 0; z < district.h; z++) {
    for (let x = 0; x < district.w; x++) {
      if (!taken.has(`${String(x)},${String(z)}`)) return { x, z };
    }
  }
  return undefined;
}

/** First position, row-major, where `size` sits `gap` away from every obstacle inside `within`. */
function findSpot(
  size: Extent,
  within: Extent,
  obstacles: readonly Rect[],
  gap: number,
): Cell | undefined {
  for (let z = 0; z + size.h <= within.h; z++) {
    for (let x = 0; x + size.w <= within.w; x++) {
      const rect = { x, z, w: size.w, h: size.h };
      if (obstacles.every((o) => apart(rect, o, gap))) return { x, z };
    }
  }
  return undefined;
}

function grownSizes(rect: Rect): [Extent, Extent] {
  const column = { w: rect.w + 1, h: rect.h };
  const row = { w: rect.w, h: rect.h + 1 };
  return rect.w <= rect.h ? [column, row] : [row, column];
}

function add(model: Model, block: Block): { placement: Placement; repack?: Repack } {
  let repack: Repack | undefined;
  let country = model.countries.find((c) => c.name === block.country);
  if (!country) {
    country = {
      name: block.country,
      family: familyOf(block.country),
      variant: NO_VARIANT,
      x: 0,
      z: 0,
      w: 0,
      h: 0,
      districts: [],
    };
    model.countries.push(country);
  }
  let district = country.districts.find((d) => d.name === block.district);
  if (!district) {
    district = { name: block.district, x: 0, z: 0, ...gridFor(1), towers: new Map() };
    country.districts.push(district);
    repack = placeDistrict(model, country, district);
  }

  let cell = freeCell(district);
  if (!cell) {
    const siblings = country.districts.filter((d) => d !== district);
    const inPlace = grownSizes(district).find((size) => {
      const rect = { x: district.x, z: district.z, ...size };
      return (
        rect.x + rect.w <= country.w &&
        rect.z + rect.h <= country.h &&
        siblings.every((s) => apart(rect, s, DISTRICT_GAP))
      );
    });
    const size = inPlace ?? grownSizes(district)[0];
    district.w = size.w;
    district.h = size.h;
    repack = inPlace
      ? { scope: 'district', country: country.name, district: district.name }
      : settle(model, country, 'no-room');
    cell = freeCell(district);
    if (!cell) throw new Error(`no free cell in ${country.name}/${district.name} after growth`);
  }

  const t = tower(block, cell.x, cell.z);
  district.towers.set(block.id, t);
  return { placement: placementOf(country, district, t), ...(repack && { repack }) };
}

function placeDistrict(model: Model, country: Country, district: District): Repack {
  void district;
  return settle(model, country, 'district-arrived');
}

function settle(model: Model, country: Country, reason: SettleReason): Repack {
  void reason;
  const size = reshelve(country);
  country.w = size.w;
  country.h = size.h;
  const others = model.countries.filter((c) => c !== country);
  const fits = others.every((o) => apart(country, o, COUNTRY_GAP));
  if (fits) {
    model.extent = bounds(model.countries);
    return { scope: 'country', country: country.name };
  }
  const spot = findSpot(country, model.extent, others, COUNTRY_GAP);
  if (spot) {
    country.x = spot.x;
    country.z = spot.z;
  } else if (others.length === 0) {
    country.x = 0;
    country.z = 0;
  } else {
    const right = model.extent.w + COUNTRY_GAP + country.w;
    const below = model.extent.h + COUNTRY_GAP + country.h;
    const growRight =
      Math.abs(Math.log(right / model.extent.h)) <= Math.abs(Math.log(model.extent.w / below));
    country.x = growRight ? model.extent.w + COUNTRY_GAP : 0;
    country.z = growRight ? 0 : model.extent.h + COUNTRY_GAP;
  }
  model.extent = bounds(model.countries);
  assignVariants(model.countries, COUNTRY_GAP);
  return { scope: 'map', country: country.name };
}

function bounds(rects: readonly Rect[]): Extent {
  let w = 0;
  let h = 0;
  for (const r of rects) {
    w = Math.max(w, r.x + r.w);
    h = Math.max(h, r.z + r.h);
  }
  return { w, h };
}

/** Rows close at the plate's current width; the aspect search only runs when that reads badly. */
function reshelve(country: Country): Extent {
  if (country.w > 0) {
    const kept = shelfAt(country.districts, country.w, DISTRICT_GAP);
    const aspect = Math.max(kept.w / Math.max(1, kept.h), kept.h / Math.max(1, kept.w));
    if (aspect <= RESHELVE_ASPECT) return kept;
  }
  return shelf(country.districts, DISTRICT_GAP);
}
