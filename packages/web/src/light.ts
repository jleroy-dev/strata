/** How long the key light takes to come back to where it started. */
export const LIGHT_DRIFT_MS = 10 * 60_000;

/** How far the key light swings either side of its rest bearing, in radians. */
export const LIGHT_SWING = 0.25;

export const KEY_BEARING = -0.6;
export const KEY_ELEVATION = 0.8;
export const KEY_DISTANCE = 100;

export interface Vector {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the key light stands at `now`. The one thing on the map that moves while nothing is
 * happening, and far too slow to read as an event.
 */
export function keyLightAt(now: number): Vector {
  const phase = ((now % LIGHT_DRIFT_MS) / LIGHT_DRIFT_MS) * Math.PI * 2;
  const swing = LIGHT_SWING * Math.sin(phase);
  return {
    x: (KEY_BEARING + swing) * KEY_DISTANCE,
    y: KEY_ELEVATION * KEY_DISTANCE,
    z: (0.4 + swing * 0.5) * KEY_DISTANCE,
  };
}
