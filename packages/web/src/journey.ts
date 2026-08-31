import { clampPitch, clampZoom, distanceOf, type View } from './view.js';

/** Below this the camera is correcting itself, above it the camera is going somewhere. */
export const TRAVEL_MIN = 35;

export const TRAVEL_MIN_MS = 420;
export const TRAVEL_MAX_MS = 1700;
export const TRAVEL_MS_PER_CELL = 2.2;

/** How far a journey rises above the zoom it would otherwise hold, at its midpoint. */
export const ARC = 0.3;
/** The journey length that earns the whole arc. */
export const ARC_FULL = 400;

const shortest = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};

export function spanOf(from: View, to: View): number {
  return Math.hypot(to.focus.x - from.focus.x, to.focus.z - from.focus.z);
}

/** True when the camera has somewhere to go rather than a small correction to make. */
export function isJourney(from: View, to: View): boolean {
  return spanOf(from, to) > TRAVEL_MIN;
}

/** How long a journey takes, longer for further but never long enough to be a wait. */
export function journeyMs(from: View, to: View): number {
  const span = spanOf(from, to);
  return Math.max(TRAVEL_MIN_MS, Math.min(TRAVEL_MAX_MS, span * TRAVEL_MS_PER_CELL));
}

/**
 * How high a journey rises on the way. Standing back to cross a long distance is cheaper to
 * watch than racing over the ground, and it shows where the camera is going before it arrives.
 */
export function arcOf(from: View, to: View): number {
  const span = spanOf(from, to);
  if (span <= TRAVEL_MIN) return 0;
  return ARC * Math.min(1, span / ARC_FULL);
}

const ease = (k: number): number => k * k * (3 - 2 * k);

/** Where a journey stands at `k`, from 0 at its start to 1 at its end. */
export function journeyAt(from: View, to: View, k: number): View {
  const t = ease(Math.max(0, Math.min(1, k)));
  const lift = arcOf(from, to) * Math.sin(Math.PI * t);
  const zoom = clampZoom(from.zoom + (to.zoom - from.zoom) * t + lift);
  return {
    focus: {
      x: from.focus.x + (to.focus.x - from.focus.x) * t,
      z: from.focus.z + (to.focus.z - from.focus.z) * t,
    },
    bearing: from.bearing + shortest(to.bearing - from.bearing) * t,
    pitch: clampPitch(from.pitch + (to.pitch - from.pitch) * t, zoom),
    zoom,
  };
}

/** The furthest the eye stands back over a journey, which is its highest point. */
export function peakDistance(from: View, to: View): number {
  let peak = 0;
  for (let i = 0; i <= 20; i++) peak = Math.max(peak, distanceOf(journeyAt(from, to, i / 20).zoom));
  return peak;
}
