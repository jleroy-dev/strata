import * as THREE from 'three';
import type { Family } from '@strata/core';

export const U = 1;
export const TOWER = 0.8;
export const PLATFORM_LIFT = 0.25;
export const PLATFORM_HEIGHT = 0.25;
export const PLATFORM_Y = 0.12;
export const PLATE_HEIGHT = 0.3;
export const PLATE_Y = -0.15;
export const CAP_HEIGHT = 0.06;

export const BLOOM = { strength: 0.5, radius: 0.3, threshold: 1.0 };
export const WINDOW = { half: 1.6, feather: 0.9, alpha: 0.12, reach: 14 };
export const BACKGROUND = 0x2d2f38;
export const HAZE = 0x3a3c46;
export const GROUND = new THREE.Color().setHSL(228 / 360, 0.08, 0.24);
export const GRID = 0x3a3d48;
export const EXPOSURE = 0.85;

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
