import { describe, expect, it } from 'vitest';
import { at, settled, smoothDamp, smoothDampAngle, wrap } from './spring.js';

/** Runs a spring to a target at a given frame time, returning the trace. */
function run(from: number, target: number, smoothTime: number, dt: number, steps = 400): number[] {
  let s = at(from);
  const trace: number[] = [];
  for (let i = 0; i < steps; i++) {
    s = smoothDamp(s, target, smoothTime, dt);
    trace.push(s.value);
  }
  return trace;
}

const timeToArrive = (trace: number[], target: number, dt: number, tol = 0.02): number => {
  const i = trace.findIndex((v) => Math.abs(v - target) <= tol * Math.abs(target || 1));
  return i < 0 ? Infinity : (i + 1) * dt;
};

describe('smoothDamp', () => {
  it('covers most of the distance within the time it is given', () => {
    const dt = 1 / 60;
    const trace = run(0, 100, 0.2, dt);
    const atSmoothTime = trace[Math.round(0.2 / dt) - 1]!;
    expect(atSmoothTime).toBeGreaterThan(55);
    expect(atSmoothTime).toBeLessThan(65);
    expect(timeToArrive(trace, 100, dt, 0.1)).toBeLessThanOrEqual(2 * 0.2);
    expect(timeToArrive(trace, 100, dt, 0.02)).toBeLessThanOrEqual(4 * 0.2);
  });

  it('scales its pace with the time it is given', () => {
    const dt = 1 / 60;
    const quick = timeToArrive(run(0, 100, 0.1, dt), 100, dt, 0.02);
    const slow = timeToArrive(run(0, 100, 0.4, dt), 100, dt, 0.02);
    expect(slow).toBeGreaterThan(quick * 2);
  });

  it('never overshoots, whatever the distance', () => {
    for (const target of [1, 100, -50, 10_000]) {
      const trace = run(0, target, 0.18, 1 / 60);
      for (const v of trace) {
        if (target > 0) expect(v).toBeLessThanOrEqual(target + 1e-9);
        else expect(v).toBeGreaterThanOrEqual(target - 1e-9);
      }
    }
  });

  it('covers the same ground per second at any frame rate', () => {
    const after = (dt: number, seconds: number): number => {
      let s = at(0);
      for (let t = 0; t < seconds; t += dt) s = smoothDamp(s, 100, 0.25, dt);
      return s.value;
    };
    const slow = after(1 / 24, 0.5);
    const fast = after(1 / 144, 0.5);
    expect(Math.abs(slow - fast)).toBeLessThan(2);
  });

  it('settles rather than creeping forever', () => {
    let s = at(0);
    for (let i = 0; i < 200; i++) s = smoothDamp(s, 100, 0.15, 1 / 60);
    expect(settled(s, 100, 1e-3)).toBe(true);
    expect(Math.abs(s.value - 100)).toBeLessThan(1e-9);
  });

  it('holds still when it is already there', () => {
    const s = smoothDamp(at(5), 5, 0.2, 1 / 60);
    expect(s.value).toBe(5);
    expect(s.velocity).toBe(0);
  });

  it('refuses to move on a frame with no time in it', () => {
    expect(smoothDamp(at(3), 99, 0.2, 0)).toEqual({ value: 3, velocity: 0 });
  });

  it('obeys a speed limit when given one', () => {
    let s = at(0);
    for (let i = 0; i < 30; i++) s = smoothDamp(s, 1000, 0.2, 1 / 60, 100);
    expect(s.value).toBeLessThan(1000);
  });
});

describe('wrap', () => {
  it('brings an angle into the half turn either side of zero', () => {
    expect(wrap(0)).toBeCloseTo(0, 12);
    expect(wrap(Math.PI * 2)).toBeCloseTo(0, 12);
    expect(Math.abs(wrap(Math.PI * 3))).toBeCloseTo(Math.PI, 12);
    expect(wrap(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('always lands inside the half turn', () => {
    for (const a of [0, 1, -1, 7, -7, 100, -100, Math.PI, -Math.PI]) {
      const w = wrap(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThanOrEqual(Math.PI);
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-9);
      expect(Math.abs(Math.cos(w) - Math.cos(a))).toBeLessThan(1e-9);
    }
  });
});

describe('smoothDampAngle', () => {
  it('turns the short way round rather than unwinding', () => {
    const from = 0.1;
    const target = Math.PI * 2 - 0.1;
    let s = at(from);
    for (let i = 0; i < 200; i++) s = smoothDampAngle(s, target, 0.2, 1 / 60);
    expect(Math.abs(wrap(s.value - target))).toBeLessThan(1e-6);
    expect(s.value).toBeLessThan(from + 0.001);
  });

  it('crosses the seam without a jump', () => {
    let s = at(Math.PI - 0.05);
    let biggest = 0;
    for (let i = 0; i < 200; i++) {
      const before = s.value;
      s = smoothDampAngle(s, -Math.PI + 0.05, 0.2, 1 / 60);
      biggest = Math.max(biggest, Math.abs(s.value - before));
    }
    expect(biggest).toBeLessThan(0.05);
  });
});
