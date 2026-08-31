import * as THREE from 'three';
import {
  WORLD_RADIUS,
  bendAt,
  bendNormal,
  chordFor,
  continentOf,
  repoOfName,
  type Cell,
  type Layout,
  type Rect,
  type RepoId,
} from '@strata/core';

const UP = new THREE.Vector3(0, 1, 0);
/** The sphere's centre in the ground's own space, where the world's centre sits at the origin. */
const PIVOT = new THREE.Vector3(0, -WORLD_RADIUS, 0);
const PLATE_SAG = 0.02;

export interface Placed {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * The one ground. A cell is local to its continent, so every point on the map is that cell
 * plus the continent's own corner, taken from the world's centre, then bent over the single
 * sphere the world sits on. One cell is one world unit and the centre of the world is the
 * origin.
 */
export class Surface {
  private layout: Layout | undefined;
  private offsets = new Map<RepoId, Cell>();
  private cx = 0;
  private cz = 0;

  constructor(readonly group: THREE.Group) {}

  setLayout(layout: Layout): void {
    this.layout = layout;
    this.offsets = new Map(layout.continents.map((c) => [c.repo, c.at]));
    this.cx = layout.world.w / 2;
    this.cz = layout.world.h / 2;
  }

  /** World units per cell. */
  readonly scale = 1;

  get centre(): Cell {
    return { x: this.cx, z: this.cz };
  }

  get extent(): { w: number; h: number } {
    return this.layout?.world ?? { w: 0, h: 0 };
  }

  offsetOf(country: string): Cell {
    return this.offsets.get(repoOfName(country)) ?? { x: 0, z: 0 };
  }

  landOf(repo: RepoId): Rect | undefined {
    return this.layout?.continents.find((c) => c.repo === repo)?.land;
  }

  /** A continent-local cell as a cell of the world. */
  cellOf(country: string, x: number, z: number): Cell {
    const at = this.offsetOf(country);
    return { x: at.x + x, z: at.z + z };
  }

  /** A point above a continent-local cell. */
  at(country: string, x: number, z: number, y = 0): THREE.Vector3 {
    const cell = this.cellOf(country, x, z);
    return this.atCell(cell.x, cell.z, y);
  }

  /** A point above a cell of the world. */
  atCell(x: number, z: number, y = 0): THREE.Vector3 {
    return this.atOffset(x - this.cx, z - this.cz, y);
  }

  /** A point above an offset in cells from the world's centre. */
  atOffset(u: number, v: number, y = 0): THREE.Vector3 {
    const p = bendAt(u, v, y);
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  /** The height of the ground under a point, in the ground's own space. */
  groundAt(x: number, z: number): number {
    const r2 = x * x + z * z;
    if (r2 >= WORLD_RADIUS * WORLD_RADIUS) return -WORLD_RADIUS;
    return Math.sqrt(WORLD_RADIUS * WORLD_RADIUS - r2) - WORLD_RADIUS;
  }

  /** The ground's normal at a cell, which anything standing there is stood along. */
  normal(country: string, x: number, z: number): THREE.Vector3 {
    const cell = this.cellOf(country, x, z);
    const n = bendNormal(cell.x - this.cx, cell.z - this.cz);
    return new THREE.Vector3(n.x, n.y, n.z);
  }

  /** The rotation that stands y-up geometry on the ground with its x along the lattice's x. */
  orientation(country: string, x: number, z: number): THREE.Quaternion {
    const n = this.normal(country, x, z);
    const ahead = this.at(country, x + 0.5, z).sub(this.at(country, x, z));
    const ex = ahead.sub(n.clone().multiplyScalar(ahead.dot(n)));
    if (ex.lengthSq() < 1e-14) return new THREE.Quaternion().setFromUnitVectors(UP, n);
    ex.normalize();
    const ez = new THREE.Vector3().crossVectors(ex, n).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, n, ez));
  }

  place(country: string, x: number, z: number, y = 0): Placed {
    return {
      position: this.at(country, x, z, y),
      quaternion: this.orientation(country, x, z),
    };
  }

  /** How far apart two continent-local cells lie, in cells across the world. */
  span(fromCountry: string, from: Cell, toCountry: string, to: Cell): number {
    const a = this.cellOf(fromCountry, from.x, from.z);
    const b = this.cellOf(toCountry, to.x, to.z);
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  /** How many segments a plate that wide needs before its chord leaves the ground. */
  segmentsFor(cells: number): number {
    return Math.max(1, Math.ceil(cells / chordFor(PLATE_SAG)));
  }

  local(country: string, x: number, z: number, y = 0): THREE.Vector3 {
    return this.at(country, x, z, y);
  }

  world(country: string, x: number, z: number, y = 0): THREE.Vector3 {
    return this.group.localToWorld(this.at(country, x, z, y));
  }

  lift(local: THREE.Vector3, y: number): THREE.Vector3 {
    return local.clone().addScaledVector(radialAt(local), y);
  }

  upAt(local: THREE.Vector3): THREE.Vector3 {
    return radialAt(local).transformDirection(this.group.matrixWorld);
  }

  toWorld(local: THREE.Vector3): THREE.Vector3 {
    return this.group.localToWorld(local.clone());
  }

  toLocal(world: THREE.Vector3): THREE.Vector3 {
    return this.group.worldToLocal(world.clone());
  }

  eyeLocal(camera: THREE.Camera): THREE.Vector3 {
    return this.group.worldToLocal(camera.position.clone());
  }

  /** Points along an arc between two local points that stay above the ground. */
  arc(from: THREE.Vector3, to: THREE.Vector3, lift: number, n = 24): THREE.Vector3[] {
    const a = from.clone().sub(PIVOT);
    const b = to.clone().sub(PIVOT);
    const ra = a.length();
    const rb = b.length();
    const da = a.clone().normalize();
    const db = b.clone().normalize();
    const angle = da.angleTo(db);
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const dir =
        angle < 1e-9
          ? da.clone()
          : da
              .clone()
              .multiplyScalar(Math.sin((1 - k) * angle) / Math.sin(angle))
              .addScaledVector(db, Math.sin(k * angle) / Math.sin(angle));
      const r = ra + (rb - ra) * k + lift * Math.sin(Math.PI * k);
      out.push(dir.multiplyScalar(r).add(PIVOT));
    }
    return out;
  }

  /** True when a country stands on ground the layout knows about. */
  knows(country: string): boolean {
    return this.layout !== undefined && continentOf(this.layout, country) !== undefined;
  }
}

function radialAt(local: THREE.Vector3): THREE.Vector3 {
  return local.clone().sub(PIVOT).normalize();
}
