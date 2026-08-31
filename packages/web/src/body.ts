import * as THREE from 'three';
import type { CountryActivity, Family, Layout, RepoId } from '@strata/core';
import { repoOfName } from '@strata/core';
import { districtKey, landKey, type Settling } from './settle.js';
import { slabIndices } from './slab.js';
import type { Surface } from './surface.js';
import { COAST, GROUND, OCEAN, accentOf, paint } from './theme.js';

/**
 * Grid lines across a span: the two coast lines, then the inside at the tessellation the sag
 * asks for.
 */
function gridLines(from: number, span: number, segments: number): number[] {
  const band = Math.min(COAST, span / 3);
  const a = from + band;
  const b = from + span - band;
  const out = [from];
  for (let i = 0; i <= segments; i++) out.push(a + ((b - a) * i) / segments);
  out.push(from + span);
  return out;
}

const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** How far the water runs, in cells: past the horizon at any distance Overview stands back to. */
const OCEAN_REACH = 2400;
const OCEAN_RINGS = 72;
const OCEAN_SPOKES = 96;

/** What a continent's land carries at rest, and how much its warmth adds back. */
const LAND_REST = 0.55;
const LAND_WAKE = 0.75;
const DISTRICT_REST = 0.5;
const DISTRICT_WAKE = 0.45;

/**
 * The ground under everything: one land per continent and one quad per district. Drawn at
 * every distance, whatever the towers are doing, so a repo nobody has admitted is still land.
 */
export class Body {
  private land: THREE.Mesh | undefined;
  private districts: THREE.InstancedMesh | undefined;
  private owners: { country: string; district: string; family: Family; variant: number }[] = [];
  private landOwners: {
    repo: RepoId;
    from: number;
    count: number;
    nx: number;
    nz: number;
  }[] = [];
  private shore: boolean[] = [];
  private layout: Layout | undefined;
  private admitted: ReadonlySet<string> = new Set();
  private shapes: THREE.Matrix4[] = [];

  constructor(
    private readonly surface: Surface,
    private readonly group: THREE.Group,
    private readonly settling: Settling,
  ) {
    this.group.add(this.water());
  }

  /** The water, bent over the same sphere, out past the horizon. */
  private water(): THREE.Mesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= OCEAN_RINGS; j++) {
      const d = OCEAN_REACH * Math.pow(j / OCEAN_RINGS, 1.6);
      for (let i = 0; i <= OCEAN_SPOKES; i++) {
        const a = (i / OCEAN_SPOKES) * Math.PI * 2;
        const p = this.surface.atOffset(Math.cos(a) * d, Math.sin(a) * d, GROUND.water);
        positions.push(p.x, p.y, p.z);
      }
    }
    const row = OCEAN_SPOKES + 1;
    for (let j = 0; j < OCEAN_RINGS; j++) {
      for (let i = 0; i < OCEAN_SPOKES; i++) {
        const a = j * row + i;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: OCEAN.body,
        emissive: OCEAN.glow,
        roughness: 0.88,
        side: THREE.DoubleSide,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    return mesh;
  }

  apply(layout: Layout): void {
    this.layout = layout;
    this.buildLand(layout);
    this.buildDistricts(layout);
    this.hideAdmitted();
  }

  /** The ground carries on travelling after the layout has landed; both tiers follow it. */
  settle(): void {
    this.moveLand();
    this.moveDistricts();
    this.hideAdmitted();
  }

  /** A country whose towers are drawn keeps its own plates; the patch under it stands down. */
  setAdmitted(admitted: ReadonlySet<string>): void {
    this.admitted = admitted;
    this.hideAdmitted();
  }

  private hideAdmitted(): void {
    const mesh = this.districts;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.owners.length; i++) {
      const o = this.owners[i];
      const shape = this.shapes[i];
      if (!o || !shape) continue;
      mesh.setMatrixAt(i, this.admitted.has(o.country) ? hidden : shape);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  paint(activity: ReadonlyMap<string, CountryActivity>, warmth: ReadonlyMap<RepoId, number>): void {
    this.paintDistricts(activity, warmth);
    this.paintLand(warmth);
  }

  private paintDistricts(
    activity: ReadonlyMap<string, CountryActivity>,
    warmth: ReadonlyMap<RepoId, number>,
  ): void {
    const mesh = this.districts;
    if (!mesh) return;
    const rest = new THREE.Color();
    const hot = new THREE.Color();
    const c = new THREE.Color();
    for (let i = 0; i < this.owners.length; i++) {
      const o = this.owners[i];
      if (!o) continue;
      const w = warmth.get(repoOfName(o.country)) ?? 0;
      const accent = accentOf(o.family, o.variant);
      rest.copy(paint.plate(accent)).multiplyScalar(DISTRICT_REST + DISTRICT_WAKE * w);
      const a = activity.get(o.country);
      if (a) {
        hot.copy(paint.agent(a.hue)).multiplyScalar(a.present ? 1.4 : 0.9);
        c.copy(rest).lerp(hot, Math.min(1, a.trace));
      } else c.copy(rest);
      mesh.setColorAt(i, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  private paintLand(warmth: ReadonlyMap<RepoId, number>): void {
    const mesh = this.land;
    const colors = mesh?.geometry.getAttribute('color');
    if (!mesh || !colors) return;
    const c = new THREE.Color();
    for (const owner of this.landOwners) {
      const w = warmth.get(owner.repo) ?? 0;
      const lit = LAND_REST + LAND_WAKE * w;
      for (let i = 0; i < owner.count; i++) {
        const v = owner.from + i;
        c.copy(this.shore[v] === true ? OCEAN.coast : OCEAN.land).multiplyScalar(lit);
        colors.setXYZ(v, c.r, c.g, c.b);
      }
    }
    colors.needsUpdate = true;
  }

  private buildLand(layout: Layout): void {
    if (this.land) {
      this.group.remove(this.land);
      this.land.geometry.dispose();
    }
    const positions: number[] = [];
    const indices: number[] = [];
    const rim: boolean[] = [];
    this.landOwners = [];
    for (const ct of layout.continents) {
      const target = this.settling.targetOf(landKey(ct.repo)) ?? ct.land;
      const nx = this.surface.segmentsFor(target.w) + 2;
      const nz = this.surface.segmentsFor(target.h) + 2;
      const base = positions.length / 3;
      this.landOwners.push({
        repo: ct.repo,
        from: base,
        count: 2 * (nx + 1) * (nz + 1),
        nx,
        nz,
      });
      for (let k = 0; k < 2; k++) {
        for (let j = 0; j <= nz; j++) {
          for (let i = 0; i <= nx; i++) {
            positions.push(0, 0, 0);
            rim.push(i === 0 || i === nx || j === 0 || j === nz);
          }
        }
      }
      for (const k of slabIndices(nx, nz)) indices.push(base + k);
    }
    this.shore = rim;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Float32Array(positions.length), 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    );
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.land = mesh;
    this.moveLand();
  }

  /** Rewrites the land where it stands this frame, at the shape its target already gave it. */
  private moveLand(): void {
    const mesh = this.land;
    const attr = mesh?.geometry.getAttribute('position');
    if (!mesh || !attr) return;
    for (const owner of this.landOwners) {
      const r = this.settling.rectOf(landKey(owner.repo));
      if (!r) continue;
      const xs = gridLines(r.x, r.w, owner.nx - 2);
      const zs = gridLines(r.z, r.h, owner.nz - 2);
      let v = owner.from;
      for (const y of [GROUND.continent.top, GROUND.continent.bottom]) {
        for (let j = 0; j <= owner.nz; j++) {
          for (let i = 0; i <= owner.nx; i++) {
            const p = this.surface.atCell(xs[i] ?? 0, zs[j] ?? 0, y);
            attr.setXYZ(v++, p.x, p.y, p.z);
          }
        }
      }
    }
    attr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  private buildDistricts(layout: Layout): void {
    if (this.districts) {
      this.group.remove(this.districts);
      this.districts.dispose();
    }
    const byCountry = new Map(layout.countries.map((c) => [c.country, c]));
    const mesh = new THREE.InstancedMesh(
      quad,
      new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }),
      Math.max(1, layout.districts.length),
    );
    mesh.frustumCulled = false;
    this.owners = [];
    this.shapes = [];
    layout.districts.forEach((d, i) => {
      mesh.setColorAt(i, OCEAN.land);
      const c = byCountry.get(d.country);
      this.owners.push({
        country: d.country,
        district: d.district,
        family: c?.family ?? 'plumbing',
        variant: c?.variant ?? 0,
      });
    });
    if (layout.districts.length === 0) {
      mesh.setMatrixAt(0, new THREE.Matrix4().makeScale(0, 0, 0));
      mesh.setColorAt(0, OCEAN.land);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
    this.districts = mesh;
    this.moveDistricts();
  }

  /** Every patch on the rect its platform is standing on this frame. */
  private moveDistricts(): void {
    const mesh = this.districts;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    this.shapes = this.owners.map((o) => {
      const r = this.settling.rectOf(districtKey(o.country, o.district));
      if (!r) return hidden.clone();
      const placed = this.surface.place(o.country, r.x + r.w / 2, r.z + r.h / 2, GROUND.patch);
      s.set(Math.max(0.5, r.w - 0.35), 1, Math.max(0.5, r.h - 0.35));
      return m.compose(placed.position, placed.quaternion, s).clone();
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number {
    return this.owners.length;
  }

  get known(): boolean {
    return this.layout !== undefined;
  }
}
