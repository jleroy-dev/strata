import type { Agent, BlockId, Layout, Rect } from '@strata/core';
import type { Point } from './grid.js';

/** Cells framed around a beacon that stands on no block. */
export const HOVER_SPAN = 10;

/** A rect of cells on one country's continent, and the tallest thing standing on it. */
export interface Framed {
  country: string;
  rect: Rect;
  top: number;
  bias?: Point;
}

export interface FollowState {
  followed?: string;
  framed?: Framed;
}

export interface FollowInput {
  agent?: Agent;
  layout: Layout;
  /** The block the beacon set off from, while it is still on its way. */
  origin?: BlockId;
  tallest: (country: string, district: string) => number;
}

export const INITIAL_FOLLOW: FollowState = {};

/**
 * What Follow should frame. A blank `framed` means there is nothing to follow and the caller
 * falls back to Overview.
 */
export function follow(previous: FollowState, input: FollowInput): FollowState {
  const id = input.agent?.id;
  const carried = id === previous.followed ? previous.framed : undefined;
  const state: FollowState = { ...(id !== undefined && { followed: id }) };
  const next = input.agent === undefined ? undefined : framed(input);
  const keep = next ?? carried;
  return keep === undefined ? state : { ...state, framed: keep };
}

/** The district a block sits in, widened to hold any extra cells of the same continent. */
export function districtFrame(
  layout: Layout,
  block: BlockId,
  tallest: (country: string, district: string) => number,
  include: readonly Point[] = [],
): Framed | undefined {
  const placed = layout.blocks.get(block);
  if (!placed) return undefined;
  const district = layout.districts.find(
    (d) => d.country === placed.country && d.district === placed.district,
  );
  if (!district) return undefined;
  let rect: Rect = { x: district.x, z: district.z, w: district.w, h: district.h };
  for (const p of include) {
    const x0 = Math.min(rect.x, p.x - 1);
    const z0 = Math.min(rect.z, p.z - 1);
    const x1 = Math.max(rect.x + rect.w, p.x + 2);
    const z1 = Math.max(rect.z + rect.h, p.z + 2);
    rect = { x: x0, z: z0, w: x1 - x0, h: z1 - z0 };
  }
  return { country: placed.country, rect, top: tallest(placed.country, placed.district) };
}

function framed(input: FollowInput): Framed | undefined {
  const { agent, layout } = input;
  if (agent?.block === undefined) return undefined;
  const placed = layout.blocks.get(agent.block);
  if (!placed) return undefined;
  const at: Point = { x: placed.cell.x, z: placed.cell.z };
  const from = input.origin === undefined ? undefined : layout.blocks.get(input.origin);
  const include =
    from?.country === placed.country ? [at, { x: from.cell.x, z: from.cell.z }] : [at];
  const district = districtFrame(layout, agent.block, input.tallest, include);
  return district ? { ...district, bias: at } : undefined;
}
