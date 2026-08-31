import { describe, expect, it } from 'vitest';
import { DRIFT_MS, DRIFT_SMOOTH, SMOOTH } from './camera.js';
import { PAN_FRICTION, PAN_STOP, TURN_FRICTION, TURN_STOP, duration } from './glide.js';
import { TRAVEL_MAX_MS, TRAVEL_MIN_MS } from './journey.js';
import { at, smoothDamp } from './spring.js';

/** How long a channel takes to be visually done, at 60 frames a second. */
function settleMs(smoothTime: number): number {
  let s = at(0);
  const dt = 1 / 60;
  for (let i = 1; i <= 600; i++) {
    s = smoothDamp(s, 100, smoothTime, dt);
    if (Math.abs(s.value - 100) < 0.5) return Math.round(i * dt * 1000);
  }
  return Infinity;
}

describe('the pace of a hand', () => {
  it('answers a drag inside a quarter of a second', () => {
    for (const t of [SMOOTH.move, SMOOTH.turn, SMOOTH.zoom]) {
      expect(settleMs(t)).toBeGreaterThan(100);
      expect(settleMs(t)).toBeLessThan(350);
    }
  });

  it('lets zoom lag turning and moving a little, never lead them', () => {
    expect(SMOOTH.zoom).toBeGreaterThanOrEqual(SMOOTH.move);
    expect(SMOOTH.zoom).toBeGreaterThanOrEqual(SMOOTH.turn);
  });
});

describe('the pace of a drift', () => {
  it('takes about two seconds, which is not a pace a hand sets', () => {
    const t = settleMs(DRIFT_SMOOTH);
    expect(t).toBeGreaterThan(1500);
    expect(t).toBeLessThan(3000);
  });

  it('is far slower than answering a drag, so the two never read alike', () => {
    expect(settleMs(DRIFT_SMOOTH)).toBeGreaterThan(settleMs(SMOOTH.move) * 5);
  });

  it('holds the slow pace long enough for the move to finish', () => {
    expect(DRIFT_MS).toBeGreaterThan(settleMs(DRIFT_SMOOTH));
  });
});

describe('the paces, against each other', () => {
  it('answers the hand fastest of all', () => {
    expect(settleMs(SMOOTH.move)).toBeLessThan(TRAVEL_MIN_MS);
    expect(settleMs(SMOOTH.move)).toBeLessThan(settleMs(DRIFT_SMOOTH));
  });

  it('glides a throw for longer than it takes to answer a drag', () => {
    expect(duration(1500, PAN_FRICTION, PAN_STOP) * 1000).toBeGreaterThan(
      settleMs(SMOOTH.move) * 3,
    );
  });

  it('lets a turn settle sooner than a throw, so the bearing stays learnable', () => {
    expect(duration(1.5, TURN_FRICTION, TURN_STOP)).toBeLessThan(
      duration(1500, PAN_FRICTION, PAN_STOP),
    );
  });

  it('keeps every journey shorter than a drift, which is the slowest thing on screen', () => {
    expect(TRAVEL_MAX_MS).toBeLessThan(DRIFT_MS);
  });
});
