import * as THREE from 'three';
import { route, type BlockId, type Layout, type Road } from '@strata/core';
import type { Segment, SegmentSource } from './lines.js';
import type { Stage } from './stage.js';
import { occupiedBy, smooth, type Occupied } from './streets.js';
import type { Terrain } from './terrain.js';

const STREET_Y = 0.5;

interface Lit {
  road: Road;
  outgoing: boolean;
  points?: THREE.Vector3[];
}

/** The selected block's imports, lit along the streets one road per frame. */
export class RoadLights implements SegmentSource {
  readonly width = 4;
  private selected: BlockId | undefined;
  private lit: Lit[] = [];
  private layout: Layout | undefined;
  private color = new THREE.Color(1, 1, 1);
  private dim = 1;
  private occupied: Occupied = () => false;

  constructor(
    private readonly stage: Stage,
    private readonly terrain: Terrain,
  ) {}

  /** Called when the selection, the roads or the ground changed. */
  select(
    id: BlockId | undefined,
    roads: ReadonlySet<string>,
    layout: Layout,
    color: THREE.Color,
  ): void {
    const same =
      id === this.selected && layout === this.layout && this.lit.length === countFor(id, roads);
    if (same) return;
    this.selected = id;
    this.layout = layout;
    this.occupied = occupiedBy(layout);
    this.color = color;
    this.lit = [];
    if (id === undefined) return;
    for (const key of roads) {
      const [from = '', to = ''] = key.split('\0');
      if (from === id) this.lit.push({ road: { from, to }, outgoing: true });
      else if (to === id) this.lit.push({ road: { from, to }, outgoing: false });
    }
  }

  update(dim: number): void {
    this.dim = dim;
    const pending = this.lit.find((l) => !l.points);
    if (pending && this.layout) {
      const corners = route(this.layout, pending.road.from, pending.road.to);
      const a = this.terrain.top(pending.road.from);
      const b = this.terrain.top(pending.road.to);
      const ground = smooth(
        corners.map((c) => this.stage.world(c.x, c.z).setY(STREET_Y)),
        this.occupied,
        (p) => this.stage.cell(p),
        (x, z) => this.stage.world(x, z),
      );
      pending.points = [...(a ? [a] : []), ...ground, ...(b ? [b] : [])];
    }
  }

  *segments(): Iterable<Segment> {
    for (const l of this.lit) {
      if (!l.points) continue;
      const color = this.color.clone().multiplyScalar((l.outgoing ? 2.2 : 0.9) * this.dim);
      for (let i = 0; i < l.points.length - 1; i++) {
        const a = l.points[i];
        const b = l.points[i + 1];
        if (a && b) yield { a, b, color };
      }
    }
  }
}

function countFor(id: BlockId | undefined, roads: ReadonlySet<string>): number {
  if (id === undefined) return 0;
  let n = 0;
  for (const key of roads) {
    const [from, to] = key.split('\0');
    if (from === id || to === id) n++;
  }
  return n;
}
