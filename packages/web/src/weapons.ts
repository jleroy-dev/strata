const rad = (deg: number): number => (deg * Math.PI) / 180;

export const GUN = {
  fireRate: 9,
  strikerRange: 72,
  grappleRange: 60,
  grappleRefire: 600,
  tracerSpeed: 120,
  grappleSpeed: 85,
  recoil: rad(5.5),
  recoilGain: 4.5,
  recoilEase: 0.085,
  shake: rad(1.1),
  shakeEase: 0.045,
  punch: 2.4,
  punchEase: 0.16,
  flash: 0.3,
  flashEase: 0.028,
  standoff: 6,
  hardPower: 1.2,
} as const;

export interface Trim {
  recoil: number;
  recoilVel: number;
  shake: number;
  punch: number;
  flash: number;
  nextRound: number;
  nextGrapple: number;
}

export const NO_TRIM: Trim = {
  recoil: 0,
  recoilVel: 0,
  shake: 0,
  punch: 0,
  flash: 0,
  nextRound: 0,
  nextGrapple: 0,
};

export function canStrike(trim: Trim, now: number): boolean {
  return now >= trim.nextRound;
}

export function canGrapple(trim: Trim, now: number): boolean {
  return now >= trim.nextGrapple;
}

export type Shot = 'striker' | 'grapple';

export function fired(trim: Trim, now: number, shot: Shot): Trim {
  const power = shot === 'grapple' ? GUN.hardPower : 1;
  return {
    ...trim,
    recoilVel: trim.recoilVel - GUN.recoil * GUN.recoilGain * power,
    shake: GUN.shake * power,
    punch: shot === 'grapple' ? -GUN.punch * power : trim.punch,
    flash: GUN.flash * power,
    nextRound: now + 1000 / GUN.fireRate,
    nextGrapple: shot === 'grapple' ? now + GUN.grappleRefire : trim.nextGrapple,
  };
}

export function stepTrim(trim: Trim, dt: number): Trim {
  const w = 1 / GUN.recoilEase;
  const recoilVel =
    (trim.recoilVel + w * w * -trim.recoil * dt) / (1 + 2 * dt * w + dt * dt * w * w);
  return {
    ...trim,
    recoilVel,
    recoil: trim.recoil + recoilVel * dt,
    shake: trim.shake * Math.exp(-dt / GUN.shakeEase),
    punch: trim.punch * Math.exp(-dt / GUN.punchEase),
    flash: trim.flash * Math.exp(-dt / GUN.flashEase),
  };
}
