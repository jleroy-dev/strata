import { zoomOf, type Point } from './view.js';

/** How long the smoothed position takes to catch a step, which takes the staircase out. */
export const SMOOTH_MS = 320;

/** How far ahead of the agent the camera looks, in seconds of its own speed. */
export const LEAD_SECONDS = 0.5;
export const LEAD_MAX = 90;

/** How long the camera remembers where an agent has been when judging how far to stand back. */
export const RANGE_MS = 25_000;
export const RANGE_MIN = 8;
/** Which part of an agent's touches the standing has to cover. */
export const RANGE_QUANTILE = 0.8;

/**
 * How the range an agent works over becomes the distance the camera stands at. The band is
 * narrow on purpose: an agent that moves should read as the same shot pulled back a little,
 * not as a different view of the map.
 */
export const STANDOFF_PER_CELL = 0.22;
export const STANDOFF_BASE = 42;
export const STANDOFF_MIN = 50;
export const STANDOFF_MAX = 95;

/** How far back a sample counts when reading the agent's current speed. */
export const SPEED_MS = 700;

interface Seen extends Point {
  t: number;
}

export interface Chase {
  /** Where the camera is aiming: the agent's path, smoothed and led. */
  at: Point;
  /** The agent's own position, smoothed, before the lead is added. */
  centre: Point;
  /** How far ahead the camera is looking, smoothed so a hop does not snap it. */
  lead: Point;
  /** How widely the agent has been working lately, in cells. */
  range: number;
  seen: Seen[];
  at_: number;
}

export const INITIAL_CHASE: Chase = {
  at: { x: 0, z: 0 },
  centre: { x: 0, z: 0 },
  lead: { x: 0, z: 0 },
  range: RANGE_MIN,
  seen: [],
  at_: 0,
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The ground an agent has been working over, read off where most of its touches were rather
 * than off the furthest one, so a single trip across the repo does not push the camera out.
 */
export function rangeOf(seen: readonly Seen[]): number {
  if (seen.length === 0) return RANGE_MIN;
  const mid = {
    x: median(seen.map((s) => s.x)),
    z: median(seen.map((s) => s.z)),
  };
  const spread = seen.map((s) => Math.hypot(s.x - mid.x, s.z - mid.z)).sort((a, b) => a - b);
  const at = spread[Math.ceil((spread.length - 1) * RANGE_QUANTILE)] ?? 0;
  return Math.max(RANGE_MIN, at);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** How fast the agent is moving, from the tail of its path. */
export function speedOf(seen: readonly Seen[], now: number): Point {
  const recent = seen.filter((s) => now - s.t <= SPEED_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t <= first.t) return { x: 0, z: 0 };
  const dt = (last.t - first.t) / 1000;
  return { x: (last.x - first.x) / dt, z: (last.z - first.z) / dt };
}

/** How far back to stand over an agent working across that much ground. */
export function standoffOf(range: number): number {
  return clamp(STANDOFF_BASE + range * STANDOFF_PER_CELL, STANDOFF_MIN, STANDOFF_MAX);
}

export function standoffZoom(range: number): number {
  return zoomOf(standoffOf(range));
}

/**
 * Follows an agent rather than the ground it stands on: its path is smoothed so a hop between
 * blocks is not a hop of the camera, and led a little so the frame shows where it is going.
 */
export function chase(previous: Chase, at: Point | undefined, now: number): Chase {
  if (!at) return previous;
  const seen = [...previous.seen, { ...at, t: now }].filter((s) => now - s.t <= RANGE_MS);
  const first = previous.seen.length === 0;
  const dt = first ? 0 : Math.max(0, now - previous.at_);
  const k = first ? 1 : 1 - Math.exp(-dt / SMOOTH_MS);
  const centre = {
    x: previous.centre.x + (at.x - previous.centre.x) * k,
    z: previous.centre.z + (at.z - previous.centre.z) * k,
  };
  const speed = speedOf(seen, now);
  const wanted = { x: speed.x * LEAD_SECONDS, z: speed.z * LEAD_SECONDS };
  const reach = Math.hypot(wanted.x, wanted.z);
  const scale = reach > LEAD_MAX ? LEAD_MAX / reach : 1;
  const lead = first
    ? { x: 0, z: 0 }
    : {
        x: previous.lead.x + (wanted.x * scale - previous.lead.x) * k,
        z: previous.lead.z + (wanted.z * scale - previous.lead.z) * k,
      };
  return {
    at: { x: centre.x + lead.x, z: centre.z + lead.z },
    centre,
    lead,
    range: rangeOf(seen),
    seen,
    at_: now,
  };
}
