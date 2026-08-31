import { WORLD_RADIUS } from '@strata/core';

export interface Point {
  x: number;
  z: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** A point of the frame, from -1 to 1 on each axis, with y up. */
export interface Ndc {
  x: number;
  y: number;
}

/** Where the camera stands, as four numbers: a point on the ground and how it is looked at. */
export interface View {
  /** The point the camera looks at, on the ground, in world cells from the world's centre. */
  focus: Point;
  /** Rotation about the vertical, from the world's z axis towards its x axis. */
  bearing: number;
  /** Angle above the ground. A quarter turn looks straight down. */
  pitch: number;
  /** 0 stands on the ground, 1 stands as far back as the map allows. */
  zoom: number;
}

export const FOV = 30;
export const ZOOM_NEAR = 45;
export const ZOOM_FAR = 3000;
/** How much of the zoom range one wheel notch covers. */
export const ZOOM_STEP = 0.03;

const rad = (deg: number): number => (deg * Math.PI) / 180;

/** How low the eye may drop and how far it may rise, at the near end and the far end of zoom. */
export const PITCH_NEAR = { min: rad(7), max: rad(80) };
export const PITCH_FAR = { min: rad(28), max: rad(80) };

/** A full turn of bearing per screen height dragged, matching the pitch rate. */
export const ORBIT_TURNS = 1;
/** The most a tilted view may stretch a vertical drag, so panning near the horizon stays sane. */
export const PAN_STRETCH_MAX = 4;

export const FOCUS_MARGIN = 60;

/** How far back Follow stands at the closest, so an agent is watched rather than loomed over. */
export const FOLLOW_ZOOM_FLOOR = 0.17;

/** Slower than this at release and the drag simply stops, in screen pixels a second. */
export const FLICK_FLOOR = 260;

/** How far above the ground the eye must stay, so it never stands inside a tower. */
export const EYE_CLEARANCE = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const smooth = (k: number): number => k * k * (3 - 2 * k);

/** How far the eye stands from its focus, growing exponentially with zoom. */
export function distanceOf(zoom: number): number {
  return ZOOM_NEAR * Math.pow(ZOOM_FAR / ZOOM_NEAR, clampZoom(zoom));
}

export function zoomOf(distance: number): number {
  const d = clamp(distance, ZOOM_NEAR, ZOOM_FAR);
  return Math.log(d / ZOOM_NEAR) / Math.log(ZOOM_FAR / ZOOM_NEAR);
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, 0, 1);
}

/** The pitch a view may take at a zoom: low angles close in, flatter as the eye pulls back. */
export function pitchBandAt(zoom: number): { min: number; max: number } {
  const k = smooth(clampZoom(zoom));
  return {
    min: PITCH_NEAR.min + (PITCH_FAR.min - PITCH_NEAR.min) * k,
    max: PITCH_NEAR.max + (PITCH_FAR.max - PITCH_NEAR.max) * k,
  };
}

/** The shallowest angle that still holds the eye clear of the tallest thing standing. */
export function clearingPitch(zoom: number): number {
  const d = distanceOf(zoom);
  return Math.asin(Math.min(1, EYE_CLEARANCE / d));
}

export function clampPitch(pitch: number, zoom: number): number {
  const band = pitchBandAt(zoom);
  return clamp(pitch, Math.max(band.min, clearingPitch(zoom)), band.max);
}

export function clampFocus(focus: Point, world: { w: number; h: number }): Point {
  const x = world.w / 2 + FOCUS_MARGIN;
  const z = world.h / 2 + FOCUS_MARGIN;
  return { x: clamp(focus.x, -x, x), z: clamp(focus.z, -z, z) };
}

/** Every limit at once, so no view reaches the renderer out of bounds. */
export function settle(view: View, world: { w: number; h: number }): View {
  const zoom = clampZoom(view.zoom);
  return {
    focus: clampFocus(view.focus, world),
    bearing: view.bearing,
    pitch: clampPitch(view.pitch, zoom),
    zoom,
  };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where the eye stands relative to its focus. */
export function eyeOffset(view: View): Vec3 {
  const d = distanceOf(view.zoom);
  const flat = Math.cos(view.pitch) * d;
  return {
    x: Math.sin(view.bearing) * flat,
    y: Math.sin(view.pitch) * d,
    z: Math.cos(view.bearing) * flat,
  };
}

/** The horizontal direction the camera faces, and the one to its right. */
export function groundBasis(bearing: number): { forward: Point; right: Point } {
  return {
    forward: { x: -Math.sin(bearing), z: -Math.cos(bearing) },
    right: { x: Math.cos(bearing), z: -Math.sin(bearing) },
  };
}

/** World cells covered by one screen pixel at the focus. */
export function unitsPerPixel(view: View, viewport: Viewport): number {
  const tanHalf = Math.tan(rad(FOV) / 2);
  return (2 * tanHalf * distanceOf(view.zoom)) / Math.max(1, viewport.height);
}

/** How far the ground sits above or below the focus, a given offset away from it. */
function reliefAt(focus: Point, offset: Point): number {
  return groundHeight(focus.x + offset.x, focus.z + offset.z) - groundHeight(focus.x, focus.z);
}

function groundHeight(x: number, z: number): number {
  const r2 = x * x + z * z;
  if (r2 >= WORLD_RADIUS * WORLD_RADIUS) return -WORLD_RADIUS;
  return Math.sqrt(WORLD_RADIUS * WORLD_RADIUS - r2) - WORLD_RADIUS;
}

/**
 * Where the ground under a point of the frame lies, as an offset from the focus. The ground
 * curves away from the focus, so the ray is met against the surface rather than a flat plane.
 * Nothing when that point is above the horizon and its ray never meets the ground.
 */
export function groundOffsetAt(view: View, ndc: Ndc, aspect: number): Point | undefined {
  const eye = eyeOffset(view);
  const d = distanceOf(view.zoom);
  const forward = { x: -eye.x / d, y: -eye.y / d, z: -eye.z / d };
  const { right } = groundBasis(view.bearing);
  const up = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y,
  };
  const tanHalf = Math.tan(rad(FOV) / 2);
  const sx = ndc.x * tanHalf * aspect;
  const sy = ndc.y * tanHalf;
  const dir = {
    x: forward.x + right.x * sx + up.x * sy,
    y: forward.y + up.y * sy,
    z: forward.z + right.z * sx + up.z * sy,
  };
  if (dir.y >= -1e-6) return undefined;
  let hit = { x: 0, z: 0 };
  let relief = 0;
  for (let i = 0; i < 4; i++) {
    const t = (relief - eye.y) / dir.y;
    hit = { x: eye.x + dir.x * t, z: eye.z + dir.z * t };
    relief = reliefAt(view.focus, hit);
  }
  return hit;
}

/** Where a point of the ground shows up in the frame, or nothing when it is behind the eye. */
export function ndcOf(view: View, offset: Point, aspect: number): Ndc | undefined {
  const eye = eyeOffset(view);
  const d = distanceOf(view.zoom);
  const forward = { x: -eye.x / d, y: -eye.y / d, z: -eye.z / d };
  const { right } = groundBasis(view.bearing);
  const up = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y,
  };
  const p = {
    x: offset.x - eye.x,
    y: reliefAt(view.focus, offset) - eye.y,
    z: offset.z - eye.z,
  };
  const depth = p.x * forward.x + p.y * forward.y + p.z * forward.z;
  if (depth <= 1e-6) return undefined;
  const tanHalf = Math.tan(rad(FOV) / 2);
  return {
    x: (p.x * right.x + p.z * right.z) / (depth * tanHalf * aspect),
    y: (p.x * up.x + p.y * up.y + p.z * up.z) / (depth * tanHalf),
  };
}

/**
 * The focus that holds `target` inside the dead zone. While the target is already inside it
 * the focus does not move at all, which is what keeps a camera still over an agent at work.
 */
export function followFocus(view: View, target: Point, dead: Ndc, aspect: number): Point {
  const offset = { x: target.x - view.focus.x, z: target.z - view.focus.z };
  const ndc = ndcOf(view, offset, aspect);
  if (!ndc) return target;
  const held = {
    x: Math.max(-dead.x, Math.min(dead.x, ndc.x)),
    y: Math.max(-dead.y, Math.min(dead.y, ndc.y)),
  };
  if (held.x === ndc.x && held.y === ndc.y) return view.focus;
  const back = groundOffsetAt(view, held, aspect);
  if (!back) return view.focus;
  return { x: target.x - back.x, z: target.z - back.z };
}

/** Drags the map under the pointer: the focus moves against the drag. */
export function panBy(
  view: View,
  dx: number,
  dy: number,
  viewport: Viewport,
  world: { w: number; h: number },
): View {
  const per = unitsPerPixel(view, viewport);
  const { forward, right } = groundBasis(view.bearing);
  const stretch = Math.min(PAN_STRETCH_MAX, 1 / Math.max(0.05, Math.sin(view.pitch)));
  const alongRight = -dx * per;
  const alongForward = dy * per * stretch;
  return settle(
    {
      ...view,
      focus: {
        x: view.focus.x + right.x * alongRight + forward.x * alongForward,
        z: view.focus.z + right.z * alongRight + forward.z * alongForward,
      },
    },
    world,
  );
}

/** A drag's speed on screen turned into the speed the ground moves under it, per second. */
export function panVelocity(view: View, vx: number, vy: number, viewport: Viewport): Point {
  const per = unitsPerPixel(view, viewport);
  const { forward, right } = groundBasis(view.bearing);
  const stretch = Math.min(PAN_STRETCH_MAX, 1 / Math.max(0.05, Math.sin(view.pitch)));
  const alongRight = -vx * per;
  const alongForward = vy * per * stretch;
  return {
    x: right.x * alongRight + forward.x * alongForward,
    z: right.z * alongRight + forward.z * alongForward,
  };
}

/** A drag's speed on screen turned into how fast the map turns under it, per second. */
export function turnVelocity(
  vx: number,
  vy: number,
  viewport: Viewport,
): { bearing: number; pitch: number } {
  const perPixel = (ORBIT_TURNS * 2 * Math.PI) / Math.max(1, viewport.height);
  return { bearing: -vx * perPixel, pitch: vy * perPixel };
}

/** Nudges the focus by a distance already in world cells. */
export function shiftBy(view: View, dx: number, dz: number, world: { w: number; h: number }): View {
  return settle({ ...view, focus: { x: view.focus.x + dx, z: view.focus.z + dz } }, world);
}

/** Turns the map about the middle of the frame, which never moves. */
export function orbitBy(view: View, dx: number, dy: number, viewport: Viewport): View {
  const perPixel = (ORBIT_TURNS * 2 * Math.PI) / Math.max(1, viewport.height);
  return {
    ...view,
    bearing: view.bearing - dx * perPixel,
    pitch: clampPitch(view.pitch + dy * perPixel, view.zoom),
  };
}

/**
 * Zooms about a point of the frame, holding the ground under it still. The anchor is a point
 * on the ground rather than a hit along a ray, so the focus can never leave the surface.
 */
export function zoomAt(
  view: View,
  notches: number,
  ndc: Ndc,
  viewport: Viewport,
  world: { w: number; h: number },
): View {
  const aspect = viewport.width / Math.max(1, viewport.height);
  const zoom = clampZoom(view.zoom + notches * ZOOM_STEP);
  const next = settle({ ...view, zoom }, world);
  const before = groundOffsetAt(view, ndc, aspect);
  if (!before) return next;
  const anchor = { x: view.focus.x + before.x, z: view.focus.z + before.z };
  return settle({ ...next, focus: focusHolding(next, anchor, ndc, aspect) }, world);
}

/** The focus that puts `anchor` under `ndc`, found by walking in rather than in one step. */
export function focusHolding(view: View, anchor: Point, ndc: Ndc, aspect: number): Point {
  let focus = view.focus;
  for (let i = 0; i < 4; i++) {
    const off = groundOffsetAt({ ...view, focus }, ndc, aspect);
    if (!off) return focus;
    focus = { x: anchor.x - off.x, z: anchor.z - off.z };
  }
  return focus;
}
