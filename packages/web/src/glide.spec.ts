import { describe, expect, it } from 'vitest';
import {
  PAN_FRICTION,
  PAN_STOP,
  TURN_FRICTION,
  TURN_MAX_CARRY,
  TURN_STOP,
  capped,
  decay,
  duration,
  reach,
  stopped,
} from './glide.js';

/** Runs a glide frame by frame and reports what it actually did. */
function run(v0: number, friction: number, stop: number, dt = 1 / 60) {
  let v = v0;
  let travelled = 0;
  let seconds = 0;
  for (let i = 0; i < 6000 && !stopped(v, stop); i++) {
    travelled += v * dt;
    v = decay(v, friction, dt);
    seconds += dt;
  }
  return { travelled: Math.abs(travelled), seconds };
}

describe('decay', () => {
  it('bleeds speed away and never reverses it', () => {
    let v = 100;
    for (let i = 0; i < 200; i++) {
      const next = decay(v, PAN_FRICTION, 1 / 60);
      expect(Math.abs(next)).toBeLessThan(Math.abs(v));
      expect(Math.sign(next)).toBe(1);
      v = next;
    }
  });

  it('loses the same fraction per second at any frame rate', () => {
    const slow = decay(decay(100, PAN_FRICTION, 1 / 30), PAN_FRICTION, 1 / 30);
    let fast = 100;
    for (let i = 0; i < 4; i++) fast = decay(fast, PAN_FRICTION, 1 / 60);
    expect(slow).toBeCloseTo(fast, 9);
  });
});

describe('a thrown map', () => {
  it('goes further the harder it is thrown', () => {
    let previous = 0;
    for (const v of [200, 600, 1500, 3000]) {
      const far = reach(v, PAN_FRICTION, PAN_STOP);
      expect(far).toBeGreaterThan(previous);
      previous = far;
    }
  });

  it('glides for longer the harder it is thrown, which is what reads as weight', () => {
    const gentle = duration(300, PAN_FRICTION, PAN_STOP);
    const hard = duration(3000, PAN_FRICTION, PAN_STOP);
    expect(hard).toBeGreaterThan(gentle * 1.5);
  });

  it('glides long enough to be seen as motion rather than as a nudge', () => {
    expect(duration(1500, PAN_FRICTION, PAN_STOP)).toBeGreaterThan(0.7);
    expect(duration(1500, PAN_FRICTION, PAN_STOP)).toBeLessThan(4);
  });

  it('always comes to rest rather than creeping on forever', () => {
    const { seconds } = run(4000, PAN_FRICTION, PAN_STOP);
    expect(seconds).toBeLessThan(6);
  });

  it('travels about as far as the reach it promises', () => {
    const { travelled } = run(1500, PAN_FRICTION, PAN_STOP);
    const promised = reach(1500, PAN_FRICTION, PAN_STOP);
    expect(travelled / promised).toBeGreaterThan(0.85);
    expect(travelled / promised).toBeLessThan(1.15);
  });

  it('does not move at all below the speed that counts as stopped', () => {
    expect(reach(PAN_STOP - 1, PAN_FRICTION, PAN_STOP)).toBe(0);
    expect(duration(PAN_STOP - 1, PAN_FRICTION, PAN_STOP)).toBe(0);
    expect(stopped(PAN_STOP - 1, PAN_STOP)).toBe(true);
  });
});

describe('a turned map', () => {
  it('carries, but never past the cap, however hard it is spun', () => {
    for (const v of [1, 5, 40, 500]) {
      const held = capped(v, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY);
      expect(reach(held, TURN_FRICTION, TURN_STOP)).toBeLessThanOrEqual(TURN_MAX_CARRY + 1e-9);
    }
  });

  it('leaves a gentle turn alone rather than capping everything', () => {
    const gentle = 0.2;
    expect(capped(gentle, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY)).toBe(gentle);
  });

  it('keeps the direction it was spun', () => {
    expect(Math.sign(capped(-500, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY))).toBe(-1);
  });

  it('settles far sooner than a thrown map, so the bearing stays learnable', () => {
    const turn = duration(
      capped(500, TURN_FRICTION, TURN_STOP, TURN_MAX_CARRY),
      TURN_FRICTION,
      TURN_STOP,
    );
    const pan = duration(1500, PAN_FRICTION, PAN_STOP);
    expect(turn).toBeLessThan(pan);
    expect(turn).toBeLessThan(0.9);
  });
});
