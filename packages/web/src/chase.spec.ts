import { describe, expect, it } from 'vitest';
import {
  INITIAL_CHASE,
  LEAD_MAX,
  RANGE_MIN,
  RANGE_MS,
  STANDOFF_MAX,
  STANDOFF_MIN,
  chase,
  rangeOf,
  speedOf,
  standoffOf,
} from './chase.js';

const NOW = 400_000;
const at = (x: number, z: number) => ({ x, z });
/** How many cells of ground the frame covers at a distance, which is what standing means. */
const across = (d: number) => 2 * Math.tan((30 * Math.PI) / 360) * d;

/** Walks an agent along a path, one sample per frame, and returns the trace. */
function walk(path: { x: number; z: number }[], stepMs = 16) {
  let c = INITIAL_CHASE;
  const trace = [];
  for (let i = 0; i < path.length; i++) {
    c = chase(c, path[i], NOW + i * stepMs);
    trace.push({ ...c.at });
  }
  return { chase: c, trace };
}

/** An agent that hops between blocks, holding each for a while. */
function hops(places: { x: number; z: number }[], framesEach = 120) {
  const path = [];
  for (const p of places) for (let i = 0; i < framesEach; i++) path.push(p);
  return path;
}

describe('chase', () => {
  it('lands on the agent when it first appears rather than easing in from nowhere', () => {
    const c = chase(INITIAL_CHASE, at(500, -300), NOW);
    expect(c.centre).toEqual(at(500, -300));
  });

  it('turns a hop between blocks into a move the eye can follow', () => {
    const { trace } = walk(hops([at(0, 0), at(120, 0)]));
    let biggest = 0;
    for (let i = 1; i < trace.length; i++) {
      biggest = Math.max(
        biggest,
        Math.hypot(trace[i]!.x - trace[i - 1]!.x, trace[i]!.z - trace[i - 1]!.z),
      );
    }
    expect(biggest).toBeLessThan(120 * 0.12);
  });

  it('arrives where the agent is once it has settled there', () => {
    const { chase: c } = walk(hops([at(0, 0), at(200, 90)], 400));
    expect(c.centre.x).toBeCloseTo(200, 0);
    expect(c.centre.z).toBeCloseTo(90, 0);
  });

  it('looks ahead of an agent that is on the move', () => {
    const path = [];
    for (let i = 0; i < 120; i++) path.push(at(i * 4, 0));
    const { chase: c } = walk(path);
    expect(c.at.x).toBeGreaterThan(c.centre.x);
  });

  it('looks nowhere in particular once the agent has stopped', () => {
    const path = [];
    for (let i = 0; i < 60; i++) path.push(at(i * 4, 0));
    for (let i = 0; i < 200; i++) path.push(at(236, 0));
    const { chase: c } = walk(path);
    expect(Math.abs(c.at.x - c.centre.x)).toBeLessThan(1);
  });

  it('never leads so far that the agent leaves the frame behind it', () => {
    const path = [];
    for (let i = 0; i < 200; i++) path.push(at(i * 400, 0));
    const { chase: c } = walk(path);
    expect(Math.hypot(c.at.x - c.centre.x, c.at.z - c.centre.z)).toBeLessThanOrEqual(
      LEAD_MAX + 1e-6,
    );
  });
});

describe('the range an agent works over', () => {
  it('is small for an agent staying put and large for one ranging about', () => {
    expect(rangeOf([{ x: 0, z: 0, t: 0 }])).toBe(RANGE_MIN);
    expect(
      rangeOf([
        { x: 0, z: 0, t: 0 },
        { x: 300, z: 200, t: 1 },
      ]),
    ).toBeGreaterThan(150);
  });

  it('is not dragged out by a single trip away from where the work is', () => {
    const here = [];
    for (let i = 0; i < 40; i++) here.push({ x: (i % 5) * 4, z: Math.floor(i / 5) * 4, t: i });
    const settled = rangeOf(here);
    const withTrip = rangeOf([...here, { x: 900, z: 900, t: 41 }]);
    expect(withTrip).toBeLessThan(settled * 2);
  });

  it('forgets where the agent used to be, so old wandering stops counting', () => {
    let c = INITIAL_CHASE;
    c = chase(c, at(0, 0), NOW);
    c = chase(c, at(600, 0), NOW + 100);
    const wide = c.range;
    c = chase(c, at(600, 0), NOW + RANGE_MS + 200);
    expect(c.range).toBeLessThan(wide / 2);
  });
});

describe('standoff', () => {
  it('stands further back the wider the agent works', () => {
    expect(standoffOf(200)).toBeGreaterThan(standoffOf(20));
  });

  it('never looms and never loses the agent entirely', () => {
    for (const r of [0, 10, 100, 5000]) {
      expect(standoffOf(r)).toBeGreaterThanOrEqual(STANDOFF_MIN);
      expect(standoffOf(r)).toBeLessThanOrEqual(STANDOFF_MAX);
    }
  });

  it('stands close enough to read the district an agent is working in', () => {
    expect(across(standoffOf(RANGE_MIN))).toBeLessThan(40);
    expect(across(standoffOf(RANGE_MIN))).toBeGreaterThan(12);
  });

  it('never stands so far back that Follow reads as Overview', () => {
    expect(across(standoffOf(10_000))).toBeLessThan(60);
  });

  it('pulls back only a little for an agent on the move, not into a different shot', () => {
    const resting = standoffOf(RANGE_MIN);
    const ranging = standoffOf(400);
    expect(ranging / resting).toBeGreaterThan(1.4);
    expect(ranging / resting).toBeLessThan(2.3);
  });

  it('keeps a working agent nearer than half the way to the widest standing', () => {
    expect(standoffOf(40)).toBeLessThan((STANDOFF_MIN + STANDOFF_MAX) / 2);
  });

  it('rises smoothly rather than stepping', () => {
    let biggest = 0;
    for (let r = 0; r < 300; r += 1) biggest = Math.max(biggest, standoffOf(r + 1) - standoffOf(r));
    expect(biggest).toBeLessThan(5);
  });
});

describe('speedOf', () => {
  it('reads nothing from an agent that has not moved', () => {
    expect(
      speedOf(
        [
          { x: 5, z: 5, t: NOW },
          { x: 5, z: 5, t: NOW + 300 },
        ],
        NOW + 300,
      ),
    ).toEqual({ x: 0, z: 0 });
  });

  it('reads the direction the agent is going', () => {
    const s = speedOf(
      [
        { x: 0, z: 0, t: NOW },
        { x: 100, z: -50, t: NOW + 500 },
      ],
      NOW + 500,
    );
    expect(s.x).toBeGreaterThan(0);
    expect(s.z).toBeLessThan(0);
  });
});
