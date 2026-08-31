/** How quickly a thrown map loses its speed, and the speed below which it has stopped. */
export const PAN_FRICTION = 2.6;
export const PAN_STOP = 5;

/** Turning loses its speed faster and is capped, so the bearing lands where it was aimed. */
export const TURN_FRICTION = 6.5;
export const TURN_STOP = 0.02;
export const TURN_MAX_CARRY = (14 * Math.PI) / 180;

/** What is left of a speed after `dt` seconds of friction. */
export function decay(speed: number, friction: number, dt: number): number {
  return speed * Math.exp(-friction * dt);
}

/** How far a glide travels in total before it stops. */
export function reach(speed: number, friction: number, stop: number): number {
  const v = Math.abs(speed);
  if (v <= stop) return 0;
  return (v - stop) / friction;
}

/** How long a glide lasts, which grows with the speed it started at. */
export function duration(speed: number, friction: number, stop: number): number {
  const v = Math.abs(speed);
  if (v <= stop) return 0;
  return Math.log(v / stop) / friction;
}

/** A speed cut back so its whole glide covers no more than `limit`. */
export function capped(speed: number, friction: number, stop: number, limit: number): number {
  const v = Math.abs(speed);
  if (reach(v, friction, stop) <= limit) return speed;
  return Math.sign(speed) * (limit * friction + stop);
}

export function stopped(speed: number, stop: number): boolean {
  return Math.abs(speed) <= stop;
}
