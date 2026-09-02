import { describe, expect, it } from 'vitest';
import { canGrapple, canStrike, fired, GUN, NO_TRIM, stepTrim, type Trim } from './weapons.js';

const rad = (deg: number): number => (deg * Math.PI) / 180;

const settle = (trim: Trim, seconds: number): Trim => {
  let t = trim;
  for (let i = 0; i < seconds * 60; i++) t = stepTrim(t, 1 / 60);
  return t;
};

describe('the trigger', () => {
  it('holds the striker to its rate', () => {
    const after = fired(NO_TRIM, 1000, 'striker');
    expect(canStrike(after, 1000)).toBe(false);
    expect(canStrike(after, 1000 + 1000 / GUN.fireRate - 1)).toBe(false);
    expect(canStrike(after, 1000 + 1000 / GUN.fireRate)).toBe(true);
  });

  it('holds the grapple to a single shot', () => {
    const after = fired(NO_TRIM, 1000, 'grapple');
    expect(canGrapple(after, 1000 + GUN.grappleRefire - 1)).toBe(false);
    expect(canGrapple(after, 1000 + GUN.grappleRefire)).toBe(true);
  });

  it('leaves the striker cadence alone when the grapple goes out', () => {
    const after = fired(NO_TRIM, 1000, 'grapple');
    expect(after.nextRound).toBeGreaterThan(1000);
  });
});

describe('the kick', () => {
  it('throws the nose up and brings it back without crossing over', () => {
    let t = fired(NO_TRIM, 0, 'striker');
    let lowest = 0;
    let crossed = false;
    for (let i = 0; i < 120; i++) {
      t = stepTrim(t, 1 / 60);
      lowest = Math.min(lowest, t.recoil);
      if (t.recoil > 1e-4) crossed = true;
    }
    expect(lowest).toBeLessThan(-rad(0.4));
    expect(lowest).toBeGreaterThan(-rad(1.2));
    expect(crossed).toBe(false);
    expect(Math.abs(t.recoil)).toBeLessThan(1e-3);
  });

  it('scales with the power of the shot', () => {
    const light = settle(fired(NO_TRIM, 0, 'striker'), 0.05);
    const heavy = settle(fired(NO_TRIM, 0, 'grapple'), 0.05);
    expect(heavy.recoil).toBeLessThan(light.recoil);
  });

  it('shakes briefly and stops', () => {
    const t = fired(NO_TRIM, 0, 'striker');
    expect(t.shake).toBeCloseTo(GUN.shake, 9);
    expect(settle(t, 0.5).shake).toBeLessThan(GUN.shake * 0.001);
  });

  it('flashes for a few frames only', () => {
    const t = fired(NO_TRIM, 0, 'striker');
    expect(settle(t, 4 / 60).flash).toBeLessThan(GUN.flash * 0.2);
  });

  it('punches the view in for the heavy shot and lets it back out', () => {
    const t = fired(NO_TRIM, 0, 'grapple');
    expect(t.punch).toBeLessThan(0);
    expect(Math.abs(settle(t, 1).punch)).toBeLessThan(0.01);
  });

  it('never narrows the view under automatic fire', () => {
    let t = NO_TRIM;
    let now = 0;
    for (let i = 0; i < 180; i++) {
      now += 1000 / 60;
      if (canStrike(t, now)) t = fired(t, now, 'striker');
      t = stepTrim(t, 1 / 60);
      expect(t.punch).toBe(0);
    }
  });

  it('holds the nose inside a few degrees under sustained fire', () => {
    let t = NO_TRIM;
    let now = 0;
    let lowest = 0;
    for (let i = 0; i < 180; i++) {
      now += 1000 / 60;
      if (canStrike(t, now)) t = fired(t, now, 'striker');
      t = stepTrim(t, 1 / 60);
      lowest = Math.min(lowest, t.recoil);
    }
    expect(lowest).toBeLessThan(-rad(0.8));
    expect(lowest).toBeGreaterThan(-rad(2));
  });

  it('stays still when nothing has been fired', () => {
    const quiet = settle(NO_TRIM, 2);
    expect(quiet.recoil).toBe(0);
    expect(quiet.shake).toBe(0);
    expect(quiet.flash).toBe(0);
  });
});
