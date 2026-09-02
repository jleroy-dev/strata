import { describe, expect, it } from 'vitest';
import {
  DRONE,
  enterAt,
  leadOf,
  LOOK_PER_PIXEL,
  leaveDrone,
  leadCapFor,
  speedAt,
  climbAt,
  descentAt,
  pullSpeedFor,
  rangeTo,
  speedOf,
  stepDrone,
  turnFor,
  type Drone,
  type Ground,
  type Sticks,
} from './drone.js';
import { distanceOf, pitchBandAt } from './view.js';

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (rad: number): number => (rad * 180) / Math.PI;

const flat: Ground = { surfaceAt: () => 0, baseAt: () => 0 };

const withTower = (at: { x: number; z: number }, top: number): Ground => ({
  surfaceAt: (x, z) => (Math.floor(x) === at.x && Math.floor(z) === at.z ? top : 0),
  baseAt: () => 0,
});

const still: Sticks = { forward: 0, strafe: 0, lift: 0, boost: false, precise: false };
const ahead: Sticks = { ...still, forward: 1 };
const none = { x: 0, y: 0 };

const droneAt = (alt: number, tilt = 0.4): Drone => ({
  eye: { x: 0, z: 0, alt, bearing: 0, tilt },
  aim: { bearing: 0, tilt },
  vel: { f: 0, s: 0, u: 0 },
  lean: { pitch: 0, roll: 0 },
  fovBoost: 0,
  lens: 0,
  energy: 0,
});

const run = (drone: Drone, sticks: Sticks, look = none, frames = 60, dt = 1 / 60): Drone => {
  let d = drone;
  for (let i = 0; i < frames; i++) d = stepDrone(d, sticks, look, dt, flat);
  return d;
};

describe('the turn curve', () => {
  it('is still inside the dead zone', () => {
    expect(turnFor(DRONE.deadZone * 0.5, DRONE.yawRate, 1 / 60)).toBe(0);
  });

  it('grows with the deflection', () => {
    const cap = leadCapFor(DRONE.yawRate);
    const small = turnFor(cap * 0.2, DRONE.yawRate, 1 / 60);
    const half = turnFor(cap * 0.5, DRONE.yawRate, 1 / 60);
    const full = turnFor(cap, DRONE.yawRate, 1 / 60);
    expect(small).toBeLessThan(half);
    expect(half).toBeLessThan(full);
  });

  it('is softer than linear through the middle', () => {
    const cap = leadCapFor(DRONE.yawRate);
    const half = turnFor(cap * 0.5, DRONE.yawRate, 1);
    expect(half).toBeLessThan(DRONE.yawRate * 0.5);
  });

  it('reaches the rate cap at full deflection', () => {
    const step = turnFor(leadCapFor(DRONE.yawRate), DRONE.yawRate, 1 / 60);
    expect(step).toBeCloseTo(DRONE.yawRate / 60, 6);
  });

  it('never steps past the target, whatever the frame length', () => {
    for (const lead of [0.02, 0.4, 1.2]) {
      for (const dt of [1 / 60, 0.5, 10]) {
        const step = turnFor(lead, DRONE.yawRate, dt);
        expect(Math.abs(step)).toBeLessThanOrEqual(lead + 1e-12);
        expect(Math.sign(step)).toBe(1);
      }
    }
  });

  it('leaves the dead zone without a step in the rate', () => {
    const dt = 1 / 60;
    const at = (deg: number): number =>
      turnFor(DRONE.deadZone + rad(deg), DRONE.yawRate, dt) / (DRONE.yawRate * dt);
    expect(at(0.01)).toBeLessThan(DRONE.minClose * 0.1);
    const walk = [0.01, 0.5, 1, 2, 3, 4, 6, 10].map(at);
    walk.reduce((previous, rate) => {
      expect(rate).toBeGreaterThanOrEqual(previous);
      expect(rate - previous).toBeLessThan(DRONE.minClose * 0.75);
      return rate;
    }, 0);
    expect(at(deg(DRONE.closeBlend))).toBeGreaterThanOrEqual(DRONE.minClose - 1e-9);
  });

  it('brakes to a stop rather than crawling into the dead zone', () => {
    let d = droneAt(10);
    for (let i = 0; i < 40; i++) d = stepDrone(d, still, { x: 0.5, y: 0 }, 1 / 60, flat);
    let frames = 0;
    while (Math.abs(leadOf(d)) > DRONE.deadZone && frames < 60 * 10) {
      d = stepDrone(d, still, none, 1 / 60, flat);
      frames++;
    }
    expect(frames).toBeLessThan(60 * 7);
  });

  it('slows evenly at the end, the way a mass under a brake does', () => {
    const dt = 1 / 60;
    let lead = DRONE.closeBlend + DRONE.deadZone;
    let previous = turnFor(lead, DRONE.yawRate, dt) / dt;
    let peak = 0;
    for (let i = 0; i < 10_000 && lead > DRONE.deadZone; i++) {
      const step = turnFor(lead, DRONE.yawRate, dt);
      const rate = step / dt;
      peak = Math.max(peak, (previous - rate) / dt);
      previous = rate;
      lead -= step;
    }
    expect(lead).toBeLessThanOrEqual(DRONE.deadZone);
    expect(peak).toBeLessThan(rad(30));
  });

  it('keeps the most a sweep can bank well clear of half a turn', () => {
    expect(leadCapFor(DRONE.yawRate)).toBeLessThan(rad(165));
  });

  it('lets a single pixel of drag clear the dead zone', () => {
    expect(DRONE.deadZone).toBeLessThan(LOOK_PER_PIXEL);
  });

  it('mirrors on the sign', () => {
    const cap = leadCapFor(DRONE.yawRate);
    expect(turnFor(-cap * 0.4, DRONE.yawRate, 1 / 60)).toBeCloseTo(
      -turnFor(cap * 0.4, DRONE.yawRate, 1 / 60),
      12,
    );
  });
});

describe('the gimbal', () => {
  it('turns towards where the hand pointed', () => {
    const after = run(droneAt(10), still, { x: 0.4, y: 0 }, 1);
    expect(after.eye.bearing).toBeLessThan(0);
  });

  it('never lets the aim run further ahead than the lead cap', () => {
    let d = droneAt(10);
    for (let i = 0; i < 120; i++) d = stepDrone(d, still, { x: 0.5, y: 0 }, 1 / 60, flat);
    expect(Math.abs(leadOf(d))).toBeLessThanOrEqual(leadCapFor(DRONE.yawRate) + 1e-9);
  });

  it('closes the lead once the hand stops, without overshooting', () => {
    let d = droneAt(10);
    for (let i = 0; i < 30; i++) d = stepDrone(d, still, { x: 0.5, y: 0 }, 1 / 60, flat);
    const opened = leadOf(d);
    let previous = Math.abs(opened);
    for (let i = 0; i < 60 * 20; i++) {
      d = stepDrone(d, still, none, 1 / 60, flat);
      const now = Math.abs(leadOf(d));
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      expect(Math.sign(leadOf(d)) === Math.sign(opened) || now === 0).toBe(true);
      previous = now;
    }
    expect(previous).toBeLessThan(DRONE.deadZone * 2);
  });

  it('carries the turn on well after the hand has let go', () => {
    let d = droneAt(10);
    for (let i = 0; i < 40; i++) d = stepDrone(d, still, { x: 0.5, y: 0 }, 1 / 60, flat);
    const released = d.eye.bearing;
    const marks: number[] = [];
    for (let second = 0; second < 5; second++) {
      for (let i = 0; i < 60; i++) d = stepDrone(d, still, none, 1 / 60, flat);
      marks.push(Math.abs(d.eye.bearing - released));
    }
    const [first, ...rest] = marks;
    expect(first).toBeGreaterThan(0.2);
    rest.reduce((previous, mark) => {
      expect(mark).toBeGreaterThan(previous);
      return mark;
    }, first ?? 0);
    expect(rest.at(-1) ?? 0).toBeGreaterThan(1);
  });

  it('stays settled through a frame long enough to break an explicit spring', () => {
    let d = droneAt(10);
    d = stepDrone(d, still, { x: 0.6, y: 0 }, 1 / 60, flat);
    for (let i = 0; i < 200; i++) d = stepDrone(d, still, none, 0.5, flat);
    expect(Number.isFinite(d.eye.bearing)).toBe(true);
    expect(Math.abs(leadOf(d))).toBeLessThan(DRONE.deadZone + 1e-6);
  });

  it('raises the nose above the horizon, as far as the gimbal travels', () => {
    let d = droneAt(10, 0.2);
    for (let i = 0; i < 900; i++) d = stepDrone(d, still, { x: 0, y: -0.5 }, 1 / 60, flat);
    expect(d.eye.tilt).toBeLessThan(0);
    expect(d.eye.tilt).toBeGreaterThanOrEqual(-DRONE.lookUp);
    expect(d.eye.tilt + DRONE.lookUp).toBeLessThanOrEqual(DRONE.deadZone * 2);
  });

  it('tilts no further than straight down', () => {
    let d = droneAt(10, 0.2);
    for (let i = 0; i < 900; i++) d = stepDrone(d, still, { x: 0, y: 0.5 }, 1 / 60, flat);
    expect(d.eye.tilt).toBeLessThanOrEqual(DRONE.lookDown);
    expect(DRONE.lookDown - d.eye.tilt).toBeLessThanOrEqual(DRONE.deadZone * 2);
  });

  it('does not care which frames a drag lands its events on', () => {
    const turned = (every: boolean): number => {
      let d = droneAt(10);
      for (let i = 0; i < 240; i++) {
        const hit = every || i % 2 === 0;
        d = stepDrone(d, still, hit ? { x: every ? 0.005 : 0.01, y: 0 } : none, 1 / 60, flat);
      }
      return d.eye.bearing - 0;
    };
    const smooth = Math.abs(turned(true));
    const beating = Math.abs(turned(false));
    expect(smooth).toBeGreaterThan(0.4);
    expect(beating).toBeGreaterThan(smooth * 0.9);
    expect(beating).toBeLessThan(smooth * 1.1);
  });

  it('bounds the tilt lead the way it bounds the yaw', () => {
    let d = droneAt(10, 0.2);
    for (let i = 0; i < 120; i++) d = stepDrone(d, still, { x: 0, y: 0.5 }, 1 / 60, flat);
    const cap = leadCapFor(DRONE.yawRate * DRONE.tiltRatio);
    expect(Math.abs(d.aim.tilt - d.eye.tilt)).toBeLessThanOrEqual(cap + 1e-9);
  });
});

describe('flight', () => {
  it('holds station with the stick centred', () => {
    const after = run(droneAt(10), still);
    expect(after.eye.x).toBeCloseTo(0, 6);
    expect(after.eye.z).toBeCloseTo(0, 6);
  });

  it('flies the way the nose points, not the way the eye tilts', () => {
    const after = run(droneAt(40, 1.2), ahead, none, 30);
    const level = run(droneAt(40, 0), ahead, none, 30);
    expect(after.eye.z).toBeLessThan(0);
    expect(after.eye.alt).toBeCloseTo(level.eye.alt, 6);
    expect(after.eye.z).toBeCloseTo(level.eye.z, 6);
  });

  it('coasts after the stick is released instead of stopping dead', () => {
    const moving = run(droneAt(10), ahead, none, 60);
    const released = stepDrone(moving, still, none, 1 / 60, flat);
    expect(speedOf(released)).toBeGreaterThan(0);
    expect(speedOf(released)).toBeLessThan(speedOf(moving));
  });

  it('comes to rest', () => {
    const moving = run(droneAt(10), ahead, none, 60);
    const stopped = run(moving, still, none, 600);
    expect(speedOf(stopped)).toBeLessThan(0.01);
  });

  it('never exceeds the speed its altitude allows', () => {
    let d = droneAt(10);
    for (let i = 0; i < 600; i++) {
      d = stepDrone(d, ahead, none, 1 / 60, flat);
      expect(speedOf(d)).toBeLessThanOrEqual(speedAt(10, ahead) + 1e-6);
    }
  });

  it('goes faster the higher it is', () => {
    expect(speedAt(100, still)).toBeGreaterThan(speedAt(5, still));
  });

  it('crosses its own height at about the same rate whatever the height', () => {
    const flow = (height: number): number => speedAt(height, still) / height;
    expect(flow(60) / flow(10)).toBeGreaterThan(0.7);
    expect(flow(60) / flow(10)).toBeLessThan(1.3);
    expect(speedAt(1000, still)).toBe(DRONE.speedCeiling);
  });

  it('climbs slower than it cruises, and dives faster than it climbs', () => {
    for (const height of [6, 40, 200]) {
      const cruising = speedAt(height, still);
      expect(climbAt(cruising)).toBeLessThan(cruising);
      expect(descentAt(cruising)).toBeGreaterThan(climbAt(cruising));
    }
    expect(climbAt(speedAt(1000, still))).toBe(DRONE.upCeiling);
    expect(descentAt(speedAt(1000, still))).toBe(DRONE.downCeiling);
  });

  it('never climbs or dives faster than the vertical cap', () => {
    let up = droneAt(10);
    let down = droneAt(200);
    for (let i = 0; i < 600; i++) {
      up = stepDrone(up, { ...still, lift: 1 }, none, 1 / 60, flat);
      down = stepDrone(down, { ...still, lift: -1 }, none, 1 / 60, flat);
      expect(up.vel.u).toBeLessThanOrEqual(DRONE.upCeiling + 1e-6);
      expect(-down.vel.u).toBeLessThanOrEqual(DRONE.downCeiling + 1e-6);
    }
    expect(up.eye.alt).toBeGreaterThan(100);
  });

  it('banks speed in a dive and runs on it past the altitude cap', () => {
    let d = droneAt(60);
    let past = false;
    for (let i = 0; i < 150; i++) {
      d = stepDrone(d, { ...still, forward: 1, lift: -1 }, none, 1 / 60, flat);
      if (d.vel.f > speedAt(d.eye.alt, still) + 1) past = true;
    }
    expect(past).toBe(true);
    for (let i = 0; i < 60; i++) d = stepDrone(d, ahead, none, 1 / 60, flat);
    expect(d.vel.f).toBeGreaterThan(speedAt(d.eye.alt, still) + 1);
    const energy = d.energy;
    for (let i = 0; i < 600; i++) d = stepDrone(d, ahead, none, 1 / 60, flat);
    expect(d.energy).toBeLessThan(energy * 0.3);
  });

  it('banks nothing from a vertical drop', () => {
    let d = droneAt(60);
    for (let i = 0; i < 120; i++) d = stepDrone(d, { ...still, lift: -1 }, none, 1 / 60, flat);
    expect(d.energy).toBe(0);
    for (let i = 0; i < 120; i++) {
      const allowed = speedAt(d.eye.alt, still);
      d = stepDrone(d, ahead, none, 1 / 60, flat);
      expect(d.vel.f).toBeLessThanOrEqual(allowed + 1e-6);
    }
  });

  it('dips on the nose-over and holds its height at cruise', () => {
    let d = droneAt(20);
    let lowest = 20;
    for (let i = 0; i < 240; i++) {
      d = stepDrone(d, ahead, none, 1 / 60, flat);
      lowest = Math.min(lowest, d.eye.alt);
    }
    expect(lowest).toBeLessThan(20);
    expect(lowest).toBeGreaterThan(20 * 0.9);
    const settled = d.eye.alt;
    for (let i = 0; i < 120; i++) d = stepDrone(d, ahead, none, 1 / 60, flat);
    expect(Math.abs(d.eye.alt - settled)).toBeLessThan(0.1);
  });

  it('boosts and eases off the same base', () => {
    expect(speedAt(20, { ...still, boost: true })).toBeCloseTo(speedAt(20, still) * DRONE.boost, 6);
    expect(speedAt(20, { ...still, precise: true })).toBeCloseTo(
      speedAt(20, still) * DRONE.precise,
      6,
    );
  });

  it('settles onto the floor rather than striking it', () => {
    let d = droneAt(60);
    const rates: number[] = [];
    for (let i = 0; i < 900; i++) {
      const before = d.eye.alt;
      d = stepDrone(d, { ...still, lift: -1, boost: true }, none, 1 / 60, flat);
      rates.push((before - d.eye.alt) * 60);
    }
    expect(d.eye.alt).toBeCloseTo(DRONE.clearance, 2);
    expect(rates[rates.length - 1]).toBeLessThan(1);
    expect(Math.max(...rates)).toBeGreaterThan(20);
  });

  it('never sinks below its clearance', () => {
    let d = droneAt(3);
    for (let i = 0; i < 600; i++) {
      d = stepDrone(d, { ...still, lift: -1 }, none, 1 / 60, flat);
      expect(d.eye.alt).toBeGreaterThanOrEqual(DRONE.clearance - 1e-6);
    }
  });

  it('climbs over a tower rather than being stopped by one', () => {
    const top = 4;
    const ground = withTower({ x: 0, z: -12 }, top);
    let d: Drone = {
      eye: { x: 0.5, z: 0.5, alt: 1, bearing: 0, tilt: 0.2 },
      aim: { bearing: 0, tilt: 0.2 },
      vel: { f: 0, s: 0, u: 0 },
      lean: { pitch: 0, roll: 0 },
      fovBoost: 0,
      lens: 0,
      energy: 0,
    };
    for (let i = 0; i < 60; i++) d = stepDrone(d, ahead, none, 1 / 60, ground);
    const cruising = speedOf(d);
    let slowest = cruising;
    while (d.eye.z > -12.5) {
      d = stepDrone(d, ahead, none, 1 / 60, ground);
      if (d.eye.z < -8) slowest = Math.min(slowest, speedOf(d));
    }
    expect(d.eye.alt).toBeGreaterThanOrEqual(top + DRONE.clearance - 0.1);
    expect(slowest).toBeGreaterThan(cruising * 0.75);
  });

  it('keeps its speed crossing a field of towers', () => {
    const rows: Ground = {
      surfaceAt: (x, z) => (Math.floor(z) % 2 === 0 ? 1.8 : 0.36),
      baseAt: () => 0.36,
    };
    let d: Drone = {
      eye: { x: 0.5, z: 0.5, alt: 2.3, bearing: 0, tilt: 0.2 },
      aim: { bearing: 0, tilt: 0.2 },
      vel: { f: 0, s: 0, u: 0 },
      lean: { pitch: 0, roll: 0 },
      fovBoost: 0,
      lens: 0,
      energy: 0,
    };
    for (let i = 0; i < 180; i++) d = stepDrone(d, ahead, none, 1 / 60, rows);
    const cruising = speedOf(d);
    let slowest = cruising;
    for (let i = 0; i < 600; i++) {
      d = stepDrone(d, ahead, none, 1 / 60, rows);
      slowest = Math.min(slowest, speedOf(d));
    }
    expect(cruising).toBeGreaterThan(4);
    expect(slowest).toBeGreaterThan(cruising * 0.85);
  });

  it('starts rising before it reaches what it has to clear', () => {
    const ground = withTower({ x: 0, z: -12 }, 4);
    let d: Drone = {
      eye: { x: 0.5, z: 0.5, alt: 1, bearing: 0, tilt: 0.2 },
      aim: { bearing: 0, tilt: 0.2 },
      vel: { f: 0, s: 0, u: 0 },
      lean: { pitch: 0, roll: 0 },
      fovBoost: 0,
      lens: 0,
      energy: 0,
    };
    let liftedAt = 0;
    while (d.eye.z > -11.9) {
      const before = d.eye.alt;
      d = stepDrone(d, ahead, none, 1 / 60, ground);
      if (d.eye.alt > before + 1e-6 && liftedAt === 0) liftedAt = d.eye.z;
    }
    expect(liftedAt).toBeLessThan(0);
    expect(liftedAt).toBeGreaterThan(-12);
  });

  it('never sits below the ground it is over', () => {
    const ground = withTower({ x: 0, z: -6 }, 5);
    let d: Drone = {
      eye: { x: 0.5, z: 0.5, alt: 1, bearing: 0, tilt: 0.2 },
      aim: { bearing: 0, tilt: 0.2 },
      vel: { f: 0, s: 0, u: 0 },
      lean: { pitch: 0, roll: 0 },
      fovBoost: 0,
      lens: 0,
      energy: 0,
    };
    for (let i = 0; i < 600; i++) {
      d = stepDrone(d, ahead, none, 1 / 60, ground);
      expect(d.eye.alt).toBeGreaterThanOrEqual(
        ground.surfaceAt(d.eye.x, d.eye.z) + DRONE.clearance - 1e-6,
      );
    }
  });
});

describe('the grapple pull', () => {
  const anchor = { x: 0, z: -40, alt: 10 };
  const pull = { at: anchor, span: 40 };

  it('accelerates towards what it bit', () => {
    let d = droneAt(10);
    for (let i = 0; i < 30; i++) d = stepDrone(d, still, none, 1 / 60, flat, pull);
    expect(d.eye.z).toBeLessThan(0);
    expect(rangeTo(d, anchor)).toBeLessThan(40);
  });

  it('carries the speed it already had rather than dropping it', () => {
    const moving = run(droneAt(10), ahead, none, 60);
    const before = speedOf(moving);
    const pulled = stepDrone(moving, still, none, 1 / 60, flat, pull);
    expect(speedOf(pulled)).toBeGreaterThanOrEqual(before);
  });

  it('is allowed more speed than the altitude alone would give', () => {
    let d = droneAt(6);
    let fastest = 0;
    for (let i = 0; i < 240; i++) {
      d = stepDrone(d, still, none, 1 / 60, flat, pull);
      fastest = Math.max(fastest, speedOf(d));
    }
    expect(fastest).toBeGreaterThan(speedAt(6, still));
    expect(fastest).toBeLessThanOrEqual(pullSpeedFor(pull.span) + 1e-6);
  });

  it('goes faster for a longer shot', () => {
    expect(pullSpeedFor(60)).toBeGreaterThan(pullSpeedFor(20));
  });

  it('flies past rather than parking, once the cable is let go', () => {
    let d = droneAt(10);
    let released: Drone | undefined;
    for (let i = 0; i < 600; i++) {
      const holding = released === undefined && rangeTo(d, anchor) > 6;
      d = stepDrone(d, still, none, 1 / 60, flat, holding ? pull : undefined);
      if (!holding && released === undefined) released = d;
    }
    expect(released).toBeDefined();
    expect(speedOf(released!)).toBeGreaterThan(5);
    expect(rangeTo(d, anchor)).toBeGreaterThan(6);
  });

  it('coasts to rest on its own once nothing is pulling', () => {
    let d = droneAt(10);
    for (let i = 0; i < 120; i++) d = stepDrone(d, still, none, 1 / 60, flat, pull);
    for (let i = 0; i < 600; i++) d = stepDrone(d, still, none, 1 / 60, flat);
    expect(speedOf(d)).toBeLessThan(0.05);
  });

  it('leaves the stick working while the cable is out', () => {
    const drifting = stepDrone(droneAt(10), still, none, 1 / 60, flat, pull);
    const steered = stepDrone(droneAt(10), { ...still, strafe: 1 }, none, 1 / 60, flat, pull);
    expect(Math.abs(steered.vel.s)).toBeGreaterThan(Math.abs(drifting.vel.s));
  });
});

describe('the body under the camera', () => {
  it('noses over into a push, then settles to a cruise attitude', () => {
    let d = droneAt(20);
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      d = stepDrone(d, ahead, none, 1 / 60, flat);
      peak = Math.max(peak, d.lean.pitch);
    }
    expect(peak).toBeGreaterThan(DRONE.leanRest * 1.5);
    const cruising = run(d, ahead, none, 180);
    expect(cruising.lean.pitch).toBeCloseTo(DRONE.leanRest, 2);
    const eased = run(cruising, still, none, 120);
    expect(Math.abs(eased.lean.pitch)).toBeLessThan(DRONE.leanRest * 0.05);
  });

  it('banks into a turn and levels out after it', () => {
    let d = run(droneAt(20), ahead, none, 90);
    for (let i = 0; i < 30; i++) d = stepDrone(d, ahead, { x: 0.3, y: 0 }, 1 / 60, flat);
    expect(d.lean.roll).toBeGreaterThan(DRONE.bank * 0.3);
    let mirror = run(droneAt(20), ahead, none, 90);
    for (let i = 0; i < 30; i++) mirror = stepDrone(mirror, ahead, { x: -0.3, y: 0 }, 1 / 60, flat);
    expect(mirror.lean.roll).toBeCloseTo(-d.lean.roll, 6);
    const levelled = run(d, ahead, none, 600);
    expect(Math.abs(levelled.lean.roll)).toBeLessThan(DRONE.bank * 0.05);
  });

  it('does not bank while hovering on the spot', () => {
    let d = droneAt(20);
    for (let i = 0; i < 30; i++) d = stepDrone(d, still, { x: 0.3, y: 0 }, 1 / 60, flat);
    expect(Math.abs(d.lean.roll)).toBeLessThan(1e-6);
  });

  it('leans harder under boost', () => {
    const cruising = run(droneAt(20), ahead, none, 40);
    const boosted = run(droneAt(20), { ...ahead, boost: true }, none, 40);
    expect(boosted.lean.pitch).toBeGreaterThan(cruising.lean.pitch * 1.2);
  });

  it('leans back when the stick is pulled', () => {
    const braking = run(droneAt(20), { ...still, forward: -1 }, none, 40);
    expect(braking.lean.pitch).toBeLessThan(-DRONE.leanRest * 0.7);
  });

  it('rolls into a strafe, and mirrors on the side', () => {
    const right = run(droneAt(20), { ...still, strafe: 1 }, none, 40);
    const left = run(droneAt(20), { ...still, strafe: -1 }, none, 40);
    expect(right.lean.roll).toBeGreaterThan(DRONE.roll * 0.7);
    expect(left.lean.roll).toBeCloseTo(-right.lean.roll, 9);
  });

  it('does not roll for a straight run', () => {
    expect(run(droneAt(20), ahead, none, 60).lean.roll).toBeCloseTo(0, 9);
  });

  it('opens the field of view with speed and closes it at rest', () => {
    const fast = run(droneAt(60), ahead, none, 120);
    expect(fast.fovBoost).toBeGreaterThan(DRONE.fovKick * 0.7);
    expect(fast.fovBoost).toBeLessThanOrEqual(DRONE.fovKick + 1e-9);
    const stopped = run(fast, still, none, 300);
    expect(stopped.fovBoost).toBeLessThan(0.1);
  });
});

describe('the lens', () => {
  it('opens on entry and stays open', () => {
    const entered = enterAt({ x: 0, z: 0, alt: 10 }, 0, 0.4, flat);
    expect(entered.lens).toBe(0);
    const soon = run(entered, still, none, 6);
    expect(soon.lens).toBeGreaterThan(0);
    expect(soon.lens).toBeLessThan(DRONE.fovOpen);
    expect(run(entered, still, none, 240).lens).toBeCloseTo(DRONE.fovOpen, 1);
  });
});

describe('entering and leaving', () => {
  it('stands exactly where it is put, aimed the way the camera was', () => {
    const d = enterAt({ x: 12, z: -30, alt: 18 }, 0.7, 0.9, flat);
    expect(d.eye).toEqual({ x: 12, z: -30, alt: 18, bearing: 0.7, tilt: 0.9 });
    expect(d.aim).toEqual({ bearing: 0.7, tilt: 0.9 });
    expect(speedOf(d)).toBe(0);
  });

  it('never enters below the clearance', () => {
    const d = enterAt({ x: 0, z: 0, alt: 0.1 }, 0, 0.02, withTower({ x: 0, z: 0 }, 3));
    expect(d.eye.alt).toBeCloseTo(3 + DRONE.clearance, 9);
  });

  it('hands back a view the camera can hold, whatever the nose was doing', () => {
    const looking = droneAt(20, -DRONE.lookUp);
    const view = leaveDrone(looking);
    const band = pitchBandAt(view.zoom);
    expect(view.pitch).toBeGreaterThanOrEqual(band.min);
    expect(view.pitch).toBeLessThanOrEqual(band.max);
  });

  it('keeps where it was pointed, so the way out is not a cut', () => {
    const turned = droneAt(20, 0.5);
    turned.eye.bearing = 1.2;
    expect(leaveDrone(turned).bearing).toBeCloseTo(1.2, 9);
  });

  it('hands the eye back where it stood, so leaving is not a cut either', () => {
    const flying = droneAt(40, 0.8);
    flying.eye.x = 15;
    flying.eye.z = -22;
    flying.eye.bearing = 1.1;
    const view = leaveDrone(flying);
    const distance = distanceOf(view.zoom);
    const flatSpan = Math.cos(view.pitch) * distance;
    expect(view.focus.x + Math.sin(view.bearing) * flatSpan).toBeCloseTo(flying.eye.x, 3);
    expect(view.focus.z + Math.cos(view.bearing) * flatSpan).toBeCloseTo(flying.eye.z, 3);
    expect(Math.sin(view.pitch) * distance).toBeCloseTo(flying.eye.alt, 3);
  });
});
