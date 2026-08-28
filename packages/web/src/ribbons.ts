import type * as THREE from 'three';
import { DISSOLVE_MS, TRAIL_MS } from '@strata/core';
import type { Segment, SegmentSource } from './lines.js';

export const GROUND_Y = 0.29;

export interface Trail {
  a: THREE.Vector3;
  b: THREE.Vector3;
  at: number;
  color: THREE.Color;
  agentId?: string;
  dyingAt?: number;
}

/** Light lying on the streets behind a travelling agent, brightest at its fresh end. */
export class Ribbons implements SegmentSource {
  readonly width = 3;
  private trails: Trail[] = [];

  constructor(
    private readonly dim: (agentId: string | undefined) => number,
    private readonly life = TRAIL_MS,
  ) {}

  lay(trail: Trail): void {
    this.trails.push(trail);
  }

  dissolve(inside: (p: THREE.Vector3) => boolean, at: number): void {
    for (const t of this.trails) {
      if (t.dyingAt === undefined && (inside(t.a) || inside(t.b))) t.dyingAt = at;
    }
  }

  *segments(now: number): Iterable<Segment> {
    this.trails = this.trails.filter(
      (t) => now - t.at < this.life && (t.dyingAt === undefined || now - t.dyingAt < DISSOLVE_MS),
    );
    for (const t of this.trails) {
      let k = 1 - (now - t.at) / this.life;
      if (t.dyingAt !== undefined) k = Math.min(k, 1 - (now - t.dyingAt) / DISSOLVE_MS);
      if (k <= 0) continue;
      const a = t.a.clone().setY(GROUND_Y);
      const b = t.b.clone().setY(GROUND_Y);
      yield {
        a,
        b,
        color: t.color.clone().multiplyScalar((0.2 + 10 * k * k * k) * this.dim(t.agentId)),
      };
    }
  }
}
