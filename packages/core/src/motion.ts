import type { BlockId } from './events.js';
import type { Cell, ContinentPlate, CountryPlate, DistrictPlate, Layout } from './layout.js';
import type { Sessions } from './weather.js';

export const RISE_MS = 600;
export const SINK_MS = 800;
export const SCAR_MS = 10_000;
export const FLIGHT_MIN_MS = 300;
export const FLIGHT_MAX_MS = 800;
export const RIBBON_RETRACT_MS = 1_500;
export const HOVER_ARC_MS = 60_000;
export const TRAIL_MS = 2_250;
export const DISSOLVE_MS = 500;
export const BREATH_MS = 300;
export const BREATH_THRESHOLD = 30;
export const FLOCK_STAGGER_MS = 30;
export const ARRIVAL_MS = 700;
export const DEPARTURE_MS = 800;

export interface World {
  layout: Layout;
  sessions: Sessions;
}

export type Motion =
  | { kind: 'rise'; id: BlockId; cell: Cell }
  | { kind: 'sink'; id: BlockId; cell: Cell }
  | { kind: 'flight'; id: BlockId; from: BlockId; fromCell: Cell; toCell: Cell }
  | { kind: 'slide'; id: BlockId; fromCell: Cell; toCell: Cell }
  | {
      kind: 'platform';
      country: string;
      district: string;
      moves: { id: BlockId; from: BlockId; fromCell: Cell; toCell: Cell }[];
      /** The folder rename this platform is part of, when it is one. */
      folder?: string;
    }
  | { kind: 'blink'; id: BlockId; from: BlockId }
  | {
      kind: 'ground';
      districts: readonly DistrictPlate[];
      countries: readonly CountryPlate[];
      continents: readonly ContinentPlate[];
    }
  | { kind: 'arrive'; agentId: string }
  | { kind: 'depart'; agentId: string }
  | { kind: 'trip'; agentId: string; from?: BlockId; to: BlockId };

/** How long a flight takes and how high it goes, from the lattice distance it covers. */
export function flightFor(distance: number): { duration: number; apex: number } {
  const duration = Math.min(FLIGHT_MAX_MS, FLIGHT_MIN_MS + distance * 12.5);
  return { duration, apex: Math.min(12, 1.5 + distance * 0.12) };
}

/** The motions that take the picture from `previous` to `next`; `renames` maps new ids to old. */
export function motions(
  previous: World,
  next: World,
  renames: ReadonlyMap<BlockId, BlockId> = new Map(),
  folders: ReadonlyMap<string, string> = new Map(),
): Motion[] {
  const out: Motion[] = [];
  const flights: Extract<Motion, { kind: 'flight' }>[] = [];
  const sources = new Set(renames.values());

  for (const [id, placed] of next.layout.blocks) {
    const from = renames.get(id) ?? id;
    const before = previous.layout.blocks.get(from);
    if (!before) {
      out.push({ kind: 'rise', id, cell: placed.cell });
    } else if (before.cell.x !== placed.cell.x || before.cell.z !== placed.cell.z) {
      if (before.country === placed.country && before.district === placed.district) {
        out.push({ kind: 'slide', id, fromCell: before.cell, toCell: placed.cell });
      } else {
        flights.push({ kind: 'flight', id, from, fromCell: before.cell, toCell: placed.cell });
      }
    } else if (from !== id) {
      out.push({ kind: 'blink', id, from });
    }
  }
  for (const [id, placed] of previous.layout.blocks) {
    if (!next.layout.blocks.has(id) && !sources.has(id))
      out.push({ kind: 'sink', id, cell: placed.cell });
  }
  out.push(...groupPlatforms(flights, previous, next, folders));

  if (
    !sameRects(previous.layout.districts, next.layout.districts) ||
    !sameRects(previous.layout.countries, next.layout.countries) ||
    !sameContinents(previous.layout.continents, next.layout.continents)
  ) {
    out.push({
      kind: 'ground',
      districts: next.layout.districts,
      countries: next.layout.countries,
      continents: next.layout.continents,
    });
  }

  for (const [id, session] of next.sessions) {
    const before = previous.sessions.get(id);
    if (!before || (before.leftAt !== undefined && session.leftAt === undefined)) {
      out.push({ kind: 'arrive', agentId: id });
      if (session.block !== undefined) out.push({ kind: 'trip', agentId: id, to: session.block });
      continue;
    }
    if (before.leftAt === undefined && session.leftAt !== undefined) {
      out.push({ kind: 'depart', agentId: id });
      continue;
    }
    const renamed =
      before.block !== undefined &&
      session.block !== undefined &&
      renames.get(session.block) === before.block;
    if (session.block !== undefined && session.block !== before.block && !renamed) {
      out.push({
        kind: 'trip',
        agentId: id,
        to: session.block,
        ...(before.block !== undefined && { from: before.block }),
      });
    }
  }
  return out;
}

function groupPlatforms(
  flights: Extract<Motion, { kind: 'flight' }>[],
  previous: World,
  next: World,
  folders: ReadonlyMap<string, string>,
): Motion[] {
  const folderOf = (id: BlockId): string | undefined =>
    [...folders.keys()].find((dir) => id.startsWith(`${dir}/`));
  const byPair = new Map<string, Extract<Motion, { kind: 'flight' }>[]>();
  for (const f of flights) {
    const a = previous.layout.blocks.get(f.from);
    const b = next.layout.blocks.get(f.id);
    if (!a || !b) continue;
    const key = `${a.country}\0${a.district}\0${b.country}\0${b.district}`;
    byPair.set(key, [...(byPair.get(key) ?? []), f]);
  }
  const out: Motion[] = [];
  for (const group of byPair.values()) {
    const first = group[0];
    if (!first) continue;
    const a = previous.layout.blocks.get(first.from);
    const b = next.layout.blocks.get(first.id);
    const folder = folderOf(first.from);
    const wholeDistrict =
      a !== undefined &&
      b !== undefined &&
      (group.length > 1 || folder !== undefined) &&
      (a.country !== b.country || a.district !== b.district) &&
      [...previous.layout.blocks.values()].filter(
        (p) => p.country === a.country && p.district === a.district,
      ).length === group.length;
    if (a && b && wholeDistrict) {
      out.push({
        kind: 'platform',
        country: b.country,
        district: b.district,
        moves: group.map(({ id, from, fromCell, toCell }) => ({ id, from, fromCell, toCell })),
        ...(folder !== undefined && { folder }),
      });
    } else {
      out.push(...group);
    }
  }
  return out;
}

function sameRects(
  a: readonly { x: number; z: number; w: number; h: number }[],
  b: readonly { x: number; z: number; w: number; h: number }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => {
    const s = b[i];
    if (s === undefined) return false;
    return r.x === s.x && r.z === s.z && r.w === s.w && r.h === s.h;
  });
}

function sameContinents(a: readonly ContinentPlate[], b: readonly ContinentPlate[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((c, i) => {
    const d = b[i];
    if (!d) return false;
    return (
      c.repo === d.repo &&
      c.extent.w === d.extent.w &&
      c.extent.h === d.extent.h &&
      c.land.x === d.land.x &&
      c.land.z === d.land.z &&
      c.land.w === d.land.w &&
      c.land.h === d.land.h &&
      c.claim.w === d.claim.w &&
      c.claim.h === d.claim.h &&
      c.at.x === d.at.x &&
      c.at.z === d.at.z
    );
  });
}

export interface RibbonPhase {
  /** How far along the arc the ribbon has been drawn, 0 to 1. */
  head: number;
  /** How much of it has retracted from the origin, 0 to 1; at 1 the ribbon is gone. */
  retract: number;
}

/**
 * A flight ribbon's shape at `now`: it grows with the flight, retracts from the origin once
 * the flight is over, and dissolves faster from `dyingAt` when abandoned. Ends by itself.
 */
export function ribbonPhase(
  start: number,
  duration: number,
  now: number,
  dyingAt?: number,
  retractMs = RIBBON_RETRACT_MS,
  dissolveMs = DISSOLVE_MS,
): RibbonPhase {
  const k = Math.max(0, Math.min(1, (now - start) / Math.max(1, duration)));
  const head = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const landed = start + duration;
  let retract = now <= landed ? 0 : Math.min(1, (now - landed) / retractMs);
  if (dyingAt !== undefined) retract = Math.min(1, Math.max(retract, (now - dyingAt) / dissolveMs));
  return { head, retract };
}
