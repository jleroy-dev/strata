/** How far off the middle the centre of activity may drift before the camera answers, in NDC. */
export const DEAD_ZONE = { x: 0.55, y: 0.5 };

/** How long one move takes, and how long the camera holds still before it will move again. */
export const EASE_MS = 2000;
export const SETTLE_MS = 20_000;

export interface Point {
  x: number;
  y: number;
}

export interface AttentionState {
  startedAt: number;
  moves: number;
}

export const INITIAL_ATTENTION: AttentionState = { startedAt: 0, moves: 0 };

export interface AttentionInput {
  /** The centre of activity in normalised device coordinates, absent when nothing is live. */
  centre?: Point;
  now: number;
}

export interface Attention {
  state: AttentionState;
  /** The offset to take out, set on the one frame a move begins. */
  began?: Point;
  moving: boolean;
  /** Activity is off the frame and the camera is not going to chase it. */
  stranded: boolean;
}

export function outside(centre: Point): boolean {
  return Math.abs(centre.x) > DEAD_ZONE.x || Math.abs(centre.y) > DEAD_ZONE.y;
}

export function offFrame(centre: Point): boolean {
  return Math.abs(centre.x) > 1 || Math.abs(centre.y) > 1;
}

/**
 * Whether the camera moves. It eases once when the centre of activity leaves the dead zone and
 * then stops, so screen position is never a function of the current event.
 */
export function attend(previous: AttentionState, input: AttentionInput): Attention {
  const { centre, now } = input;
  const since = now - previous.startedAt;
  const moving = previous.startedAt > 0 && since < EASE_MS;
  if (moving) return { state: previous, moving: true, stranded: false };
  if (!centre) return { state: previous, moving: false, stranded: false };
  const settled = previous.startedAt === 0 || since >= SETTLE_MS;
  if (outside(centre) && settled) {
    return {
      state: { startedAt: now, moves: previous.moves + 1 },
      began: centre,
      moving: true,
      stranded: false,
    };
  }
  return { state: previous, moving: false, stranded: offFrame(centre) };
}

/** The middle of a set of points, or nothing when there are none. */
export function centreOf(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}
