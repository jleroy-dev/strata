export type Ease = (k: number) => number;

export const easeOutCubic: Ease = (k) => 1 - Math.pow(1 - k, 3);
export const easeInOutQuad: Ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeOutBack: Ease = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);
export const linear: Ease = (k) => k;

export interface Tween {
  start: number;
  duration: number;
  ease: Ease;
}

/** Progress of a tween at `now`, 0 before it starts and 1 once it is over. */
export function progress(tween: Tween, now: number): number {
  if (tween.duration <= 0) return 1;
  const k = (now - tween.start) / tween.duration;
  return k <= 0 ? 0 : k >= 1 ? 1 : tween.ease(k);
}

export function done(tween: Tween, now: number): boolean {
  return now >= tween.start + tween.duration;
}
