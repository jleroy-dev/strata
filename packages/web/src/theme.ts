import * as THREE from 'three';
import { COUNTRY_SKIRT, SHORE, type Family } from '@strata/core';

export const TOWER = 0.8;
export const CAP_HEIGHT = 0.06;

/**
 * The ground stack in cells above the bent surface, lowest first. Every layer clears the one
 * under it by more than a plate's chord can sag away from the ground, so no two ever meet.
 */
export const GROUND = {
  water: -1.2,
  continent: { top: 0, bottom: -1.55 },
  country: { top: 0.18, bottom: -0.68 },
  district: { top: 0.36, bottom: -0.5 },
  patch: 0.06,
  shade: { land: 0.06, country: 0.24 },
} as const;

export const PLATFORM_LIFT = GROUND.district.top;

export const BLOOM = { strength: 0.5, radius: 0.3, threshold: 1.0 };
export const WINDOW = { half: 1.6, feather: 0.9, alpha: 0.12, reach: 14 };
export const BACKGROUND = 0x06070b;
export const HAZE = 0x0a0c12;
export const EXPOSURE = 0.85;
export const OCEAN = {
  body: new THREE.Color().setHSL(210 / 360, 0.42, 0.022),
  glow: new THREE.Color().setHSL(200 / 360, 0.85, 0.01),
  land: new THREE.Color().setHSL(216 / 360, 0.14, 0.075),
  coast: new THREE.Color().setHSL(206 / 360, 0.18, 0.135),
};

/** The band of coast a continent's land carries at its rim, in cells. */
export const COAST = SHORE - COUNTRY_SKIRT;

/** The dark a plate lays on what it stands on: how far it reaches, and how deep it starts. */
export const SHADE = { spread: 0.5, alpha: 0.45 };

const HUES: Record<Family, number> = { apps: 28, libs: 212, docs: 95, plumbing: 220 };

export interface Accent {
  hue: number;
  s: number;
  l: number;
}

export function accentOf(family: Family, variant: number): Accent {
  if (family === 'plumbing') {
    return {
      hue: HUES.plumbing,
      s: 0.04,
      l: 0.42 + Math.floor(variant / 3) * 0.06 + (variant % 3) * 0.02,
    };
  }
  return {
    hue: HUES[family] + ((variant % 3) - 1) * 14,
    s: 0.3,
    l: 0.46 + Math.floor(variant / 3) * 0.1,
  };
}

const hsl = (h: number, s: number, l: number): THREE.Color =>
  new THREE.Color().setHSL(h / 360, s, l);

export const paint = {
  plate: (a: Accent): THREE.Color => hsl(a.hue, a.s * 0.6, 0.3),
  platform: (a: Accent): THREE.Color => hsl(a.hue, a.s * 0.75, 0.36),
  tower: (a: Accent): THREE.Color => hsl(a.hue, a.s, a.l),
  cap: (a: Accent): THREE.Color => hsl(a.hue, Math.min(1, a.s * 1.5), a.l + 0.08),
  agent: (hue: number): THREE.Color => hsl(hue, 1, 0.6),
};
