export interface Damped {
  value: number;
  velocity: number;
}

const TAU = Math.PI * 2;

/**
 * A critically damped approach to `target`. It covers most of the distance in `smoothTime`
 * seconds and the rest on an asymptote, never overshoots, and moves the same amount per second
 * whatever the frame rate.
 */
export function smoothDamp(
  current: Damped,
  target: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): Damped {
  if (dt <= 0) return { ...current };
  const time = Math.max(1e-4, smoothTime);
  const omega = 2 / time;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const limit = maxSpeed * time;
  const change = Math.max(-limit, Math.min(limit, current.value - target));
  const rest = current.value - change;
  const temp = (current.velocity + omega * change) * dt;
  let velocity = (current.velocity - omega * temp) * decay;
  let value = rest + (change + temp) * decay;
  if (target - current.value > 0 === value > target) {
    value = target;
    velocity = (value - rest) / dt;
  }
  return { value, velocity };
}

/** The same approach taken the short way round a circle. */
export function smoothDampAngle(
  current: Damped,
  target: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): Damped {
  const shortest = current.value + wrap(target - current.value);
  return smoothDamp(current, shortest, smoothTime, dt, maxSpeed);
}

/** An angle brought into the half turn either side of zero. */
export function wrap(angle: number): number {
  let a = (angle + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const at = (value: number): Damped => ({ value, velocity: 0 });

/** True once a spring has arrived and stopped, so a frame can be skipped. */
export function settled(current: Damped, target: number, epsilon: number): boolean {
  return Math.abs(current.value - target) < epsilon && Math.abs(current.velocity) < epsilon;
}
