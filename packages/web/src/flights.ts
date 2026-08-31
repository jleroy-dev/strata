import * as THREE from 'three';
import { HOVER_ARC_MS, ribbonPhase } from '@strata/core';
import type { Effects, Frame } from './effects.js';
import type { Segment, SegmentSource } from './lines.js';
import { easeInOutQuad } from './tween.js';

/**
 * A flight from one place to another over `duration`, `apex` cells high. `at(k, y)` is the
 * point a fraction `k` of the way along and `y` cells above the ground there, in the planet
 * group's units; the flat arithmetic is the caller's and the sphere is inside `at`.
 */
export interface FlightPath {
  from: THREE.Vector3;
  to: THREE.Vector3;
  apex: number;
  start: number;
  duration: number;
  at(k: number, y: number): THREE.Vector3;
}

/** Where a flying thing is at `now`: its fraction along, its height, its stretch, and whether it landed. */
export function flightPose(
  f: FlightPath,
  now: number,
): { position: THREE.Vector3; y: number; sy: number; k: number } {
  const k = Math.max(0, Math.min(1, (now - f.start) / f.duration));
  const e = easeInOutQuad(k);
  const dip = k < 0.08 ? -0.06 * Math.sin((k / 0.08) * Math.PI) : 0;
  const y = f.apex * Math.sin(Math.PI * k) + dip;
  const v = Math.cos(Math.PI * k);
  const sy =
    1 + 0.25 * Math.abs(v) * (k > 0.08 ? 1 : 0) - (k > 0.9 ? 0.3 * (1 - (1 - k) / 0.1) : 0);
  return { position: f.at(e, y), y, sy, k };
}

export function arcPoints(f: FlightPath, lift: number, n = 40, head = 1): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = (i / n) * head;
    pts.push(f.at(k, lift + f.apex * Math.sin(Math.PI * k)));
  }
  return pts;
}

interface Ribbon {
  path: FlightPath;
  color: THREE.Color;
  lift: number;
  scar?: THREE.Mesh;
  dyingAt?: number;
}

interface Landing {
  id: string;
  path: FlightPath;
  color: THREE.Color | undefined;
  at: number;
}

const NEUTRAL = new THREE.Color(0.8, 0.85, 1);

/** The ribbon a flight leaves along its arc, retracting after landing, and the scar it fades with. */
export class Flights implements SegmentSource {
  readonly width = 4;
  private ribbons: Ribbon[] = [];
  private landings = new Map<string, Landing>();
  private readonly hoverArc: THREE.Line;

  *segments(now: number): Iterable<Segment> {
    for (const r of this.ribbons) {
      const { head, retract } = ribbonPhase(r.path.start, r.path.duration, now, r.dyingAt);
      const pts = arcPoints(r.path, r.lift).map((p) => this.toWorld(p));
      const n = pts.length - 1;
      const from = Math.floor(retract * n);
      const to = Math.max(from, Math.floor(head * n));
      for (let j = from; j < to; j++) {
        const a = pts[j];
        const b = pts[j + 1];
        if (!a || !b) continue;
        yield {
          a,
          b,
          color: r.color
            .clone()
            .multiplyScalar((0.2 + 5 * Math.pow(j / n, 2)) * (1 - Math.pow(retract, 2))),
        };
      }
    }
  }

  constructor(
    private readonly group: THREE.Object3D,
    private readonly effects: Effects,
    private readonly toWorld: (local: THREE.Vector3) => THREE.Vector3,
    private readonly frameAt: (local: THREE.Vector3) => Frame,
  ) {
    this.hoverArc = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        toneMapped: false,
        fog: false,
      }),
    );
    this.hoverArc.visible = false;
    group.add(this.hoverArc);
  }

  get count(): number {
    return this.ribbons.length;
  }

  /** Age of the oldest live ribbon in ms, 0 when none. */
  oldest(now: number): number {
    let age = 0;
    for (const r of this.ribbons) age = Math.max(age, now - r.path.start);
    return age;
  }

  /** A flight that was replaced before it landed: its ribbon dissolves from now. */
  abandon(path: FlightPath, now: number): void {
    for (const r of this.ribbons) {
      if (r.path === path && r.dyingAt === undefined) r.dyingAt = now;
    }
  }

  ribbon(
    path: FlightPath,
    color: THREE.Color | undefined,
    lift: number,
    scar: THREE.Mesh | undefined,
  ): void {
    this.ribbons.push({ path, color: color ?? NEUTRAL, lift, ...(scar && { scar }) });
  }

  /** A landing to remember for the hover arc, and the ripple that marks it. */
  landed(
    id: string,
    path: FlightPath,
    color: THREE.Color | undefined,
    size: number,
    now: number,
  ): void {
    this.landings.set(id, { id, path, color, at: now });
    const local = path.at(1, 0.29);
    this.effects.add({
      kind: 'ripple',
      at: this.toWorld(local),
      frame: this.frameAt(local),
      color,
      born: now,
      life: 600,
      size,
    });
  }

  forget(id: string): void {
    this.landings.delete(id);
  }

  dissolve(inside: (p: THREE.Vector3) => boolean, now: number): void {
    for (const r of this.ribbons) {
      if (r.dyingAt === undefined && now >= r.path.start + r.path.duration && inside(r.path.from)) {
        r.dyingAt = now;
      }
    }
    for (const [id, l] of this.landings) if (inside(l.path.from)) this.landings.delete(id);
  }

  update(now: number, hover: string | undefined): void {
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const r = this.ribbons[i];
      if (!r) continue;
      const { retract } = ribbonPhase(r.path.start, r.path.duration, now, r.dyingAt);
      if (r.scar) (r.scar.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - retract);
      if (retract >= 1) {
        if (r.scar) r.scar.removeFromParent();
        this.ribbons.splice(i, 1);
        continue;
      }
    }
    for (const [id, l] of this.landings) if (now - l.at > HOVER_ARC_MS) this.landings.delete(id);
    const landing = hover === undefined ? undefined : this.landings.get(hover);
    if (landing) {
      const pts = arcPoints(landing.path, 0.3, 30);
      this.hoverArc.geometry.setFromPoints(pts);
      (this.hoverArc.material as THREE.LineBasicMaterial).color = (
        landing.color ?? new THREE.Color(0xdfe6f5)
      )
        .clone()
        .multiplyScalar(1.6);
      this.hoverArc.visible = true;
    } else {
      this.hoverArc.visible = false;
    }
  }
}
