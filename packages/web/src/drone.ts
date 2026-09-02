import { clampZoom, distanceOf, pitchBandAt, zoomOf, type View } from './view.js';

export interface Eye {
  x: number;
  z: number;
  alt: number;
  bearing: number;
  tilt: number;
}

export interface Drone {
  eye: Eye;
  aim: { bearing: number; tilt: number };
  vel: { f: number; s: number; u: number };
  lean: { pitch: number; roll: number };
  fovBoost: number;
  lens: number;
  energy: number;
}

export interface Sticks {
  forward: number;
  strafe: number;
  lift: number;
  boost: boolean;
  precise: boolean;
}

export interface Look {
  x: number;
  y: number;
}

export interface Pull {
  at: { x: number; z: number; alt: number };
  span: number;
}

export interface Ground {
  surfaceAt(x: number, z: number): number;
  baseAt(x: number, z: number): number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;

export const DRONE = {
  yawRate: rad(130),
  tiltRatio: 0.5,
  expo: 0.6,
  minClose: 0.15,
  closeBlend: rad(20),
  leanRest: rad(2.5),
  leanSurge: rad(4),
  roll: rad(1.8),
  bank: rad(5),
  leanBoost: 1.5,
  leanIn: 0.06,
  leanEase: 0.2,
  dip: 0.25,
  diveGain: 0.8,
  energyBleed: 0.18,
  fovKick: 8,
  rush: 1.4,
  fovEase: 0.28,
  fovOpen: 20,
  lensEase: 0.5,
  leadSeconds: 1.2,
  deadZone: rad(0.25),
  lookUp: rad(35),
  lookDown: rad(85),
  speedFloor: 3,
  speedGain: 1.75,
  speedPower: 1,
  speedCeiling: 240,
  climb: 0.35,
  upFloor: 2,
  upCeiling: 40,
  descent: 0.55,
  downFloor: 3,
  downCeiling: 60,
  boost: 4,
  precise: 0.25,
  thrust: 3,
  drag: 0.9,
  brake: 3.2,
  clearance: 0.45,
  cushion: 5,
  cushionReach: 2,
  lookAhead: 3,
  climbFloor: 6,
  climbCeiling: 90,
  entryZoom: 0.12,
  pullAccel: 80,
  pullPerCell: 1.2,
  pullFloor: 22,
  pullCeiling: 160,
  pullTaper: 0.3,
} as const;

export const LOOK_PER_PIXEL = rad(0.58);

export function lookRadians(pixels: number): number {
  return pixels * LOOK_PER_PIXEL;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function wrap(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function leadCapFor(rateCap: number): number {
  return rateCap * DRONE.leadSeconds;
}

export function turnFor(lead: number, rateCap: number, dt: number): number {
  const magnitude = Math.abs(lead);
  if (magnitude <= DRONE.deadZone) return 0;
  const span = Math.max(1e-6, leadCapFor(rateCap) - DRONE.deadZone);
  const past = magnitude - DRONE.deadZone;
  const u = Math.min(1, past / span);
  const t = Math.min(1, past / DRONE.closeBlend);
  const eased = Math.sqrt(t);
  const curve = (1 - DRONE.expo) * u + DRONE.expo * u * u * u;
  const shaped = Math.max(curve, DRONE.minClose * eased);
  const step = Math.sign(lead) * rateCap * shaped * dt;
  return Math.abs(step) > magnitude ? lead : step;
}

export function speedAt(above: number, sticks: Sticks): number {
  const climbed = Math.pow(Math.max(0, above), DRONE.speedPower);
  const base = Math.min(DRONE.speedFloor + DRONE.speedGain * climbed, DRONE.speedCeiling);
  if (sticks.boost) return base * DRONE.boost;
  if (sticks.precise) return base * DRONE.precise;
  return base;
}

export function climbAt(speed: number): number {
  return clamp(speed * DRONE.climb, DRONE.upFloor, DRONE.upCeiling);
}

export function descentAt(speed: number): number {
  return clamp(speed * DRONE.descent, DRONE.downFloor, DRONE.downCeiling);
}

export function enterAt(
  at: { x: number; z: number; alt: number },
  bearing: number,
  tilt: number,
  ground: Ground,
): Drone {
  return {
    eye: {
      x: at.x,
      z: at.z,
      alt: Math.max(ground.surfaceAt(at.x, at.z) + DRONE.clearance, at.alt),
      bearing,
      tilt,
    },
    aim: { bearing, tilt },
    vel: { f: 0, s: 0, u: 0 },
    lean: { pitch: 0, roll: 0 },
    fovBoost: 0,
    lens: 0,
    energy: 0,
  };
}

export function leaveDrone(drone: Drone): View {
  const band = pitchBandAt(1);
  const pitch = clamp(drone.eye.tilt, band.min, band.max);
  const distance = drone.eye.alt / Math.sin(pitch);
  const zoom = clampZoom(zoomOf(distance));
  const flat = Math.cos(pitch) * distanceOf(zoom);
  return {
    focus: {
      x: drone.eye.x - Math.sin(drone.eye.bearing) * flat,
      z: drone.eye.z - Math.cos(drone.eye.bearing) * flat,
    },
    bearing: drone.eye.bearing,
    pitch,
    zoom,
  };
}

function gimbal(drone: Drone, look: Look, dt: number): void {
  const aim = drone.aim;
  aim.bearing -= look.x;
  aim.tilt = clamp(aim.tilt + look.y, -DRONE.lookUp, DRONE.lookDown);

  const yawLeadCap = leadCapFor(DRONE.yawRate);
  const lead = wrap(aim.bearing - drone.eye.bearing);
  if (lead > yawLeadCap) aim.bearing = drone.eye.bearing + yawLeadCap;
  else if (lead < -yawLeadCap) aim.bearing = drone.eye.bearing - yawLeadCap;

  const tiltRate = DRONE.yawRate * DRONE.tiltRatio;
  const tiltLeadCap = leadCapFor(tiltRate);
  aim.tilt = clamp(aim.tilt, drone.eye.tilt - tiltLeadCap, drone.eye.tilt + tiltLeadCap);

  drone.eye.bearing += turnFor(wrap(aim.bearing - drone.eye.bearing), DRONE.yawRate, dt);
  drone.eye.tilt = clamp(
    drone.eye.tilt + turnFor(aim.tilt - drone.eye.tilt, tiltRate, dt),
    -DRONE.lookUp,
    DRONE.lookDown,
  );
}

export function rangeTo(drone: Drone, at: { x: number; z: number; alt: number }): number {
  return Math.hypot(at.x - drone.eye.x, at.z - drone.eye.z, at.alt - drone.eye.alt);
}

export function pullSpeedFor(span: number): number {
  return clamp(span * DRONE.pullPerCell, DRONE.pullFloor, DRONE.pullCeiling);
}

function fly(
  drone: Drone,
  sticks: Sticks,
  dt: number,
  ground: Ground,
  pull: Pull | undefined,
  yawRate: number,
): void {
  const eye = drone.eye;
  const vel = drone.vel;
  const above = eye.alt - ground.baseAt(eye.x, eye.z);
  const speed = speedAt(above, sticks);

  const heldFlat = Math.hypot(vel.f, vel.s);
  const heldUp = vel.u;
  const held = Math.hypot(vel.f, vel.s, vel.u);
  const length = Math.hypot(sticks.forward, sticks.strafe, sticks.lift) || 1;
  const thrusting =
    pull !== undefined || sticks.forward !== 0 || sticks.strafe !== 0 || sticks.lift !== 0;
  const push = speed * DRONE.thrust * dt;
  vel.f += (sticks.forward / length) * push;
  vel.s += (sticks.strafe / length) * push;
  vel.u += (sticks.lift / length) * push;

  const decay = Math.exp(-(thrusting ? DRONE.drag : DRONE.brake) * dt);
  const lifting = pull !== undefined || sticks.lift !== 0;
  vel.f *= decay;
  vel.s *= decay;
  vel.u *= lifting ? decay : Math.exp(-DRONE.brake * dt);

  if (sticks.lift < 0 && vel.u < 0 && vel.f > 0)
    drone.energy += DRONE.diveGain * -vel.u * Math.min(1, vel.f / speed) * dt;
  drone.energy *= Math.exp(-DRONE.energyBleed * dt);

  let allow = speed + drone.energy;
  let allowUp = climbAt(speed);
  let allowDown = descentAt(speed);
  if (pull) {
    const range = rangeTo(drone, pull.at);
    if (range > 1e-4) {
      const sb0 = Math.sin(eye.bearing);
      const cb0 = Math.cos(eye.bearing);
      const dx = (pull.at.x - eye.x) / range;
      const dz = (pull.at.z - eye.z) / range;
      const taper = Math.min(1, range / Math.max(1e-6, pull.span * DRONE.pullTaper));
      const gain = DRONE.pullAccel * taper * dt;
      vel.f += -(dx * sb0 + dz * cb0) * gain;
      vel.s += (dx * cb0 - dz * sb0) * gain;
      vel.u += ((pull.at.alt - eye.alt) / range) * gain;
      allow = Math.max(allow, pullSpeedFor(pull.span));
      allowUp = Math.max(allowUp, allow);
      allowDown = Math.max(allowDown, allow);
    }
  }

  const leanGain = sticks.boost ? DRONE.leanBoost : 1;
  const surge = sticks.forward > 0 ? clamp(1 - vel.f / allow, 0, 1) : 0;
  const rest = DRONE.leanRest * leanGain * (sticks.forward / length);
  const nose = rest + DRONE.leanSurge * leanGain * surge;
  const kNose = 1 - Math.exp(-dt / (nose > drone.lean.pitch ? DRONE.leanIn : DRONE.leanEase));
  drone.lean.pitch += (nose - drone.lean.pitch) * kNose;
  const kLean = 1 - Math.exp(-dt / DRONE.leanEase);
  const turning = clamp(-yawRate / DRONE.yawRate, -1, 1);
  const moving = Math.min(1, Math.hypot(vel.f, vel.s) / allow);
  const roll = (DRONE.roll * (sticks.strafe / length) + DRONE.bank * turning * moving) * leanGain;
  drone.lean.roll += (roll - drone.lean.roll) * kLean;

  if (sticks.forward > 0 && sticks.lift === 0) {
    const over = Math.max(0, drone.lean.pitch - rest) / (DRONE.leanSurge * leanGain);
    vel.u -= DRONE.dip * allowDown * over * DRONE.thrust * dt;
  }

  const flat = Math.hypot(vel.f, vel.s);
  if (flat > allow && flat > heldFlat) {
    const trim = allow / flat;
    vel.f *= trim;
    vel.s *= trim;
  }
  if (vel.u > allowUp && vel.u > heldUp) vel.u = allowUp;
  if (vel.u < -allowDown && vel.u < heldUp) vel.u = -allowDown;
  if (pull) {
    const carried = Math.hypot(vel.f, vel.s, vel.u);
    if (carried > allow && carried > held) {
      const trim = allow / carried;
      vel.f *= trim;
      vel.s *= trim;
      vel.u *= trim;
    }
  }

  const fraction = Math.min(DRONE.rush, Math.hypot(vel.f, vel.s, vel.u) / Math.max(1e-6, speed));
  drone.fovBoost +=
    (DRONE.fovKick * fraction - drone.fovBoost) * (1 - Math.exp(-dt / DRONE.fovEase));
  drone.lens += (DRONE.fovOpen - drone.lens) * (1 - Math.exp(-dt / DRONE.lensEase));

  const sb = Math.sin(eye.bearing);
  const cb = Math.cos(eye.bearing);
  const vx = vel.f * -sb + vel.s * cb;
  const vz = vel.f * -cb + vel.s * -sb;

  eye.x += vx * dt;
  eye.z += vz * dt;
  eye.alt += vel.u * dt;

  const floor = ground.surfaceAt(eye.x, eye.z) + DRONE.clearance;
  const flatSpeed = Math.hypot(vx, vz);
  const ahead =
    flatSpeed > 1e-4
      ? ground.surfaceAt(
          eye.x + (vx / flatSpeed) * DRONE.lookAhead,
          eye.z + (vz / flatSpeed) * DRONE.lookAhead,
        ) + DRONE.clearance
      : floor;
  const want = Math.max(floor, ahead);

  const gap = eye.alt - floor;
  if (gap < DRONE.cushionReach) {
    const limit = -(Math.max(0, gap) * DRONE.cushion + 0.15);
    if (vel.u < limit) vel.u = limit;
  }

  if (eye.alt < want) {
    const reach = (want - eye.alt) * (flatSpeed / DRONE.lookAhead);
    const rate = clamp(Math.max(DRONE.climbFloor, reach), 0, DRONE.climbCeiling);
    eye.alt = Math.min(want, eye.alt + rate * dt);
  }
  if (eye.alt < floor) {
    eye.alt = floor;
    if (vel.u < 0) vel.u = 0;
  }
}

export function stepDrone(
  drone: Drone,
  sticks: Sticks,
  look: Look,
  dt: number,
  ground: Ground,
  pull?: Pull,
): Drone {
  const next: Drone = {
    eye: { ...drone.eye },
    aim: { ...drone.aim },
    vel: { ...drone.vel },
    lean: { ...drone.lean },
    fovBoost: drone.fovBoost,
    lens: drone.lens,
    energy: drone.energy,
  };
  const before = next.eye.bearing;
  gimbal(next, look, dt);
  const yawRate = dt > 0 ? wrap(next.eye.bearing - before) / dt : 0;
  fly(next, sticks, dt, ground, pull, yawRate);
  return next;
}

export function speedOf(drone: Drone): number {
  return Math.hypot(drone.vel.f, drone.vel.s, drone.vel.u);
}

export function leadOf(drone: Drone): number {
  return wrap(drone.aim.bearing - drone.eye.bearing);
}
