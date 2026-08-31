import * as THREE from 'three';
import {
  BREATH_MS,
  COUNTRY_SKIRT,
  DISTRICT_SKIRT,
  FLOCK_STAGGER_MS,
  RIBBON_RETRACT_MS,
  RISE_MS,
  SCAR_MS,
  SINK_MS,
  flightFor,
  repoOfName,
  type BlockId,
  type Cell,
  type Layout,
  type Memory,
  type Motion,
  type CountryPlate,
  type Rect,
} from '@strata/core';
import type { Effects, Frame } from './effects.js';
import { Flights, flightPose, type FlightPath } from './flights.js';
import { Instances } from './instances.js';
import { SETTLE_MIN, countryKey, districtKey, landKey, type Settling } from './settle.js';
import { shadeGeometry, shadeMesh } from './shade.js';
import { slabIndices } from './slab.js';
import type { Ribbons } from './ribbons.js';
import type { Surface } from './surface.js';
import {
  CAP_HEIGHT,
  GROUND,
  PLATFORM_LIFT,
  SHADE,
  TOWER,
  WINDOW,
  accentOf,
  paint,
  type Accent,
} from './theme.js';
import { done, linear, progress, type Tween } from './tween.js';
import { windowUniforms, windowed } from './window.js';

export interface Presence {
  hue: number;
  verb: 'reading' | 'editing';
  flicker: number;
}

/** The followed subject the window opens onto: its block, where it stands, where its light is. */
export interface Subject {
  id: BlockId;
  foot: THREE.Vector3;
  beacon: THREE.Vector3;
}

interface Flight {
  path: FlightPath;
  fromAccent: Accent;
  silent: boolean;
}

/** `pos` is flat: a continent cell with a height, and `country` says which continent. */
interface View {
  id: BlockId;
  index: number;
  cell: Cell;
  pos: THREE.Vector3;
  height: number;
  accent: Accent;
  scale: number;
  stretch: number;
  country: string;
  district: string;
  cut: number;
  rise?: Tween;
  sink?: Tween;
  target: THREE.Vector3;
  flight?: Flight;
  blinkAt?: number;
}

interface Plate {
  mesh: THREE.Mesh;
  rim?: THREE.LineLoop;
  shade: THREE.Mesh;
  country: string;
  built: Rect;
  top: number;
  bottom: number;
  skirt: number;
  shadeAt: number;
  flight?: FlightPath;
  gone?: boolean;
}

interface Scar {
  mesh: THREE.Mesh;
  born: number;
  life: number;
}

const box = new THREE.BoxGeometry(1, 1, 1);
const capGeometry = new THREE.BoxGeometry(TOWER + 0.04, CAP_HEIGHT, TOWER + 0.04);
const halfCapGeometry = new THREE.BoxGeometry((TOWER + 0.04) / 2, CAP_HEIGHT, TOWER + 0.04);
const scarGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const SCAR_COLOR = 0x1e2028;
const PLUMBING: Accent = { hue: 220, s: 0.04, l: 0.42 };
const UP = new THREE.Vector3(0, 1, 0);

/** Towers, caps, platforms and plates of one planet, in its group's cell units. */
export class Terrain {
  readonly flights: Flights;
  private views = new Map<BlockId, View>();
  private plates = new Map<string, Plate>();
  private scars: Scar[] = [];
  private admitted = new Set<string>();
  private readonly towers: Instances;
  private readonly caps: Instances;
  private readonly halfCaps: THREE.InstancedMesh;
  private readonly ground = new THREE.Group();
  private readonly scarGroup = new THREE.Group();
  private layout: Layout | undefined;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly base = new THREE.Color();
  private readonly cap = new THREE.Color();
  private readonly other = new THREE.Color();
  private readonly ray = new THREE.Raycaster();
  private readonly window = windowUniforms();
  private byCountry = new Map<string, CountryPlate>();
  private tops = new Map<string, number>();
  private subject: Subject | undefined;
  private lastAt = 0;
  private ease = 0.1;

  constructor(
    private readonly surface: Surface,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly viewport: () => { width: number; height: number },
    private readonly effects: Effects,
    private readonly ribbons: Ribbons,
    private readonly settling: Settling,
  ) {
    const group = surface.group;
    const towerMaterial = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, flatShading: true });
    this.towers = new Instances(
      box,
      windowed(towerMaterial(), this.window, false),
      group,
      64,
      windowed(
        Object.assign(towerMaterial(), { transparent: true, depthWrite: false }),
        this.window,
        true,
      ),
    );
    this.caps = new Instances(
      capGeometry,
      windowed(new THREE.MeshBasicMaterial({ toneMapped: false }), this.window, false),
      group,
      64,
      windowed(
        new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false }),
        this.window,
        true,
      ),
    );
    this.halfCaps = new THREE.InstancedMesh(
      halfCapGeometry,
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      64,
    );
    this.halfCaps.count = 0;
    this.halfCaps.frustumCulled = false;
    group.add(this.halfCaps, this.ground, this.scarGroup);
    this.flights = new Flights(
      group,
      effects,
      (local) => surface.toWorld(local),
      (local) => this.frameAt(local),
    );
  }

  has(id: BlockId): boolean {
    return this.views.has(id);
  }

  get plateCount(): number {
    return this.plates.size;
  }

  get towerCount(): number {
    return this.views.size;
  }

  /** Towers currently opened by the window, and the band's half-width in screen units. */
  get windowed(): { towers: number; half: number } {
    let towers = 0;
    for (const v of this.views.values()) if (v.cut > 0.5) towers++;
    return { towers, half: this.window.uHalf.value };
  }

  /** The block under a pointer, by ray against the towers. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): BlockId | undefined {
    if (this.views.size === 0) return undefined;
    this.ray.setFromCamera(ndc, camera);
    this.towers.mesh.boundingSphere = null;
    const hit = this.ray.intersectObject(this.towers.mesh)[0];
    if (hit?.instanceId === undefined) return undefined;
    for (const v of this.views.values()) if (v.index === hit.instanceId) return v.id;
    return undefined;
  }

  /** The tallest tower standing on a district, in cells. */
  tallest(country: string, district: string): number {
    let top = 1;
    if (!this.layout) return top;
    top = Math.max(top, (this.tops.get(`${country}\0${district}`) ?? 0) + PLATFORM_LIFT);
    for (const v of this.views.values()) {
      if (v.country !== country || v.district !== district) continue;
      top = Math.max(top, v.height * v.scale + PLATFORM_LIFT);
    }
    return top;
  }

  /** Where a block is, drawn or not: its flat point, its country and its height. */
  private standing(
    id: BlockId,
  ): { country: string; x: number; z: number; y: number; height: number } | undefined {
    const v = this.views.get(id);
    if (v) {
      return {
        country: v.country,
        x: v.pos.x,
        z: v.pos.z,
        y: v.pos.y,
        height: v.height * v.scale * v.stretch,
      };
    }
    const placed = this.layout?.blocks.get(id);
    if (!placed) return undefined;
    return {
      country: placed.country,
      x: placed.cell.x + 0.5,
      z: placed.cell.z + 0.5,
      y: 0,
      height: placed.height,
    };
  }

  /** Where light lands on a block: the centre of its cap, following flights, in world units. */
  top(id: BlockId): THREE.Vector3 | undefined {
    const s = this.standing(id);
    if (!s) return undefined;
    return this.surface.world(s.country, s.x, s.z, s.y + PLATFORM_LIFT + s.height + CAP_HEIGHT);
  }

  /** Where a block stands: the centre of its footprint on the platform, in world units. */
  foot(id: BlockId): THREE.Vector3 | undefined {
    const s = this.standing(id);
    if (!s) return undefined;
    return this.surface.world(s.country, s.x, s.z, PLATFORM_LIFT);
  }

  /** The radial and scale at a block, for anything that stands on it in world space. */
  frameOf(id: BlockId): Frame | undefined {
    const s = this.standing(id);
    if (!s) return undefined;
    const local = this.surface.local(s.country, s.x, s.z);
    const quaternion = this.surface
      .orientation(s.country, s.x, s.z)
      .premultiply(
        new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().extractRotation(this.surface.group.matrixWorld),
        ),
      );
    return { ...this.frameAt(local), quaternion };
  }

  frameAt(local: THREE.Vector3): Frame {
    return { up: this.surface.upAt(local), scale: this.surface.scale };
  }

  cellAt(id: BlockId): Cell | undefined {
    return this.views.get(id)?.cell;
  }

  /** The cities that draw towers; the rest stay body patches. */
  setAdmitted(countries: ReadonlySet<string>, now: number): void {
    const layout = this.layout;
    if (!layout) return;
    if (this.byCountry.size === 0) this.index(layout);
    let changed = false;
    for (const c of countries) if (!this.admitted.has(c)) changed = true;
    for (const c of this.admitted) if (!countries.has(c)) changed = true;
    if (!changed) return;
    this.admitted = new Set(countries);
    for (const v of [...this.views.values()]) {
      if (!this.admitted.has(v.country)) this.release(v);
    }
    for (const [id, p] of layout.blocks) {
      if (!this.admitted.has(p.country) || this.views.has(id)) continue;
      this.place(id, p.cell, p.height, this.accentFor(layout, p.country), p.country, p.district, {
        start: now,
        duration: RISE_MS,
        ease: linear,
      });
    }
    this.syncGround(layout, now, false);
  }

  apply(layout: Layout, motions: readonly Motion[], now: number, snap: boolean): void {
    const first = this.layout === undefined;
    this.layout = layout;
    this.index(layout);
    const drawn = (country: string): boolean => this.admitted.has(country);
    if (first || snap) {
      this.syncGround(layout, now, true);
      for (const [id, p] of layout.blocks) {
        if (!drawn(p.country)) continue;
        this.place(
          id,
          p.cell,
          p.height,
          this.accentFor(layout, p.country),
          p.country,
          p.district,
          snap ? undefined : { start: now, duration: RISE_MS, ease: linear },
        );
      }
      return;
    }
    const terrainMotions = motions.filter(
      (m) => m.kind !== 'arrive' && m.kind !== 'depart' && m.kind !== 'trip',
    );
    const burst = terrainMotions.length > 30;
    let stagger = 0;
    const next = (): number => {
      const s = stagger;
      stagger = burst
        ? Math.min(BREATH_MS, stagger + BREATH_MS / terrainMotions.length)
        : stagger + FLOCK_STAGGER_MS;
      return s;
    };
    const platforms = motions.filter(
      (m): m is Extract<Motion, { kind: 'platform' }> => m.kind === 'platform',
    );
    const sources = platforms.map((m) => {
      const first = m.moves[0];
      const source = first ? this.views.get(first.from) : undefined;
      return source && first
        ? { key: districtKey(source.country, source.district), dir: dirOf(first.from) }
        : undefined;
    });
    const tops = new Set(
      platforms.map((m) => m.folder).filter((f): f is string => f !== undefined),
    );
    let body = sources.findIndex((src, i) => src !== undefined && platforms[i]?.folder === src.dir);
    if (body === -1) {
      body = platforms.reduce(
        (best, m, i) => (m.moves.length > (platforms[best]?.moves.length ?? 0) ? i : best),
        0,
      );
    }
    let bodyPath: FlightPath | undefined;
    platforms.forEach((motion, i) => {
      const source = sources[i];
      const rect = layout.districts.find(
        (d) => d.country === motion.country && d.district === motion.district,
      );
      const path = source && rect ? this.flyPlatform(source.key, rect, now, i !== body) : undefined;
      if (i === body) bodyPath = path;
      for (const move of motion.moves)
        this.fly(layout, move.id, move.from, move.toCell, now, now, path);
    });
    const riding = new Set<BlockId>();
    if (bodyPath && tops.size > 0) {
      for (const m of motions) {
        if (m.kind === 'flight' && [...tops].some((top) => m.from.startsWith(`${top}/`))) {
          riding.add(m.id);
          this.fly(layout, m.id, m.from, m.toCell, now, now, bodyPath);
        }
      }
    }
    for (const motion of motions) {
      switch (motion.kind) {
        case 'rise': {
          const p = layout.blocks.get(motion.id);
          if (!p || !drawn(p.country)) break;
          const start = now + next();
          const accent = this.accentFor(layout, p.country);
          this.place(motion.id, p.cell, p.height, accent, p.country, p.district, {
            start,
            duration: RISE_MS,
            ease: linear,
          });
          if (!burst) {
            const local = this.surface.local(
              p.country,
              p.cell.x + 0.5,
              p.cell.z + 0.5,
              PLATFORM_LIFT + p.height + 0.3,
            );
            this.effects.add({
              kind: 'crown',
              at: this.surface.toWorld(local),
              frame: this.frameAt(local),
              color: paint.cap(accent),
              born: start,
              life: 900,
            });
          }
          break;
        }
        case 'sink': {
          const v = this.views.get(motion.id);
          if (v) v.sink = { start: now + next(), duration: SINK_MS, ease: linear };
          break;
        }
        case 'blink': {
          const v = this.views.get(motion.from);
          if (!v) break;
          this.views.delete(motion.from);
          v.id = motion.id;
          v.blinkAt = now;
          this.views.set(motion.id, v);
          break;
        }
        case 'flight':
          if (!riding.has(motion.id)) {
            this.fly(layout, motion.id, motion.from, motion.toCell, now + next(), now, undefined);
          }
          break;
        default:
          break;
      }
    }
    this.syncGround(layout, now, false);
    for (const [id, p] of layout.blocks) {
      const v = this.views.get(id);
      if (!v) continue;
      if (v.height !== p.height && !v.flight) v.height = p.height;
      if (v.cell.x !== p.cell.x || v.cell.z !== p.cell.z) {
        v.cell = p.cell;
        v.target.set(p.cell.x + 0.5, 0, p.cell.z + 0.5);
      }
    }
  }

  update(
    now: number,
    memory: (id: BlockId) => Memory,
    presence: ReadonlyMap<BlockId, Presence>,
    agentColor: (agentId: string) => THREE.Color | undefined,
    dim: (agentId: string | undefined) => number,
    hover: BlockId | undefined,
    subject: Subject | undefined,
  ): void {
    this.subject = subject;
    this.updateWindow();
    this.lastAt = now;
    this.ease = this.settling.factor;
    let halves = 0;
    for (const v of this.views.values()) {
      if (v.sink && done(v.sink, now)) {
        this.remove(v, now);
        continue;
      }
      this.advance(v, now);
      const h = Math.max(0.001, v.height * v.scale * v.stretch);
      const sxz = 1 / Math.sqrt(v.stretch);
      this.q.copy(this.surface.orientation(v.country, v.pos.x, v.pos.z));
      this.s.set(TOWER * sxz, h, TOWER * sxz);
      this.m.compose(
        this.surface.at(v.country, v.pos.x, v.pos.z, v.pos.y + PLATFORM_LIFT + h / 2),
        this.q,
        this.s,
      );
      this.towers.mesh.setMatrixAt(v.index, this.m);
      this.s.set(sxz, 1, sxz);
      this.m.compose(
        this.surface.at(v.country, v.pos.x, v.pos.z, v.pos.y + PLATFORM_LIFT + h + CAP_HEIGHT / 2),
        this.q,
        this.s,
      );
      this.caps.mesh.setMatrixAt(v.index, this.m);
      this.towers.cut.array[v.index] = v.cut;
      this.caps.cut.array[v.index] = v.cut;

      const mem = memory(v.id);
      const lastColor = mem.last ? agentColor(mem.last.agentId) : undefined;
      const on = presence.get(v.id);
      const dimming = dim(mem.last?.agentId);
      this.base.copy(paint.tower(v.accent));
      this.cap.copy(paint.cap(v.accent));
      if (v.flight) {
        this.base
          .copy(paint.tower(v.flight.fromAccent))
          .lerp(paint.tower(v.accent), flightPose(v.flight.path, now).k);
      }
      if (lastColor && mem.trace > 0) {
        this.base.lerp(lastColor, 0.1 + 0.3 * mem.trace);
        if (mem.heat > 0) this.base.lerp(lastColor, mem.heat * 0.5);
      }
      if (v.blinkAt !== undefined && now - v.blinkAt < 150) this.cap.set(4, 4, 4);
      if (mem.contested && !on && halves < 64) {
        const [a, b] = mem.contested;
        const ca = agentColor(a);
        const cb = agentColor(b);
        if (ca && cb) {
          this.cap.copy(cb).multiplyScalar(0.85);
          this.other.copy(ca).multiplyScalar(0.85 * dimming);
          const t1 = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q);
          this.s.set(1, 1, 1);
          this.m.compose(
            this.surface
              .at(v.country, v.pos.x, v.pos.z, v.pos.y + PLATFORM_LIFT + h + CAP_HEIGHT / 2 + 0.005)
              .addScaledVector(t1, -(TOWER + 0.04) / 4),
            this.q,
            this.s,
          );
          this.halfCaps.setMatrixAt(halves, this.m);
          this.halfCaps.setColorAt(halves, this.other);
          halves++;
        }
      }
      if (on)
        this.cap
          .copy(paint.agent(on.hue))
          .multiplyScalar(on.verb === 'editing' ? 6 * (1 + on.flicker) : 3.5);
      this.base.multiplyScalar(dimming);
      this.cap.multiplyScalar(dimming);
      this.towers.mesh.setColorAt(v.index, this.base);
      this.caps.mesh.setColorAt(v.index, this.cap);
    }
    this.halfCaps.count = halves;
    this.halfCaps.instanceMatrix.needsUpdate = true;
    if (this.halfCaps.instanceColor) this.halfCaps.instanceColor.needsUpdate = true;
    this.towers.mesh.instanceMatrix.needsUpdate = true;
    this.caps.mesh.instanceMatrix.needsUpdate = true;
    this.towers.cut.needsUpdate = true;
    this.caps.cut.needsUpdate = true;
    if (this.towers.mesh.instanceColor) this.towers.mesh.instanceColor.needsUpdate = true;
    if (this.caps.mesh.instanceColor) this.caps.mesh.instanceColor.needsUpdate = true;

    for (const [key, plate] of this.plates) {
      const target = this.settling.targetOf(key);
      if (plate.flight && target) {
        const pose = flightPose(plate.flight, now);
        this.showPlate(plate, false);
        plate.mesh.position.copy(pose.position);
        plate.mesh.quaternion.setFromUnitVectors(UP, pose.position.clone().normalize());
        if (plate.rim) {
          plate.rim.position.copy(plate.mesh.position);
          plate.rim.quaternion.copy(plate.mesh.quaternion);
        }
        if (pose.k < 1) continue;
        this.flights.landed(
          `platform\0${key}`,
          plate.flight,
          undefined,
          Math.max(target.w, target.h),
          now,
        );
        delete plate.flight;
        this.settling.arrive(key, target);
        plate.built = { x: NaN, z: NaN, w: 0, h: 0 };
      }
      const r = this.settling.rectOf(key);
      if (plate.gone || !r) {
        this.dropPlate(key, plate, now);
        continue;
      }
      const standing = r.w > SETTLE_MIN && r.h > SETTLE_MIN;
      this.showPlate(plate, standing);
      if (standing) this.buildPlate(plate, r);
    }
    this.scars = this.scars.filter((s) => {
      const k = (now - s.born) / s.life;
      if (k >= 1) {
        this.scarGroup.remove(s.mesh);
        return false;
      }
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
      return true;
    });
    this.flights.update(now, hover);
  }

  private updateWindow(): void {
    const subject = this.subject;
    const camera = this.camera;
    const { width, height } = this.viewport();
    this.window.uAspect.value = width / height;
    const subjectView = subject ? this.views.get(subject.id) : undefined;
    if (!subject || !subjectView) {
      for (const v of this.views.values()) {
        if (v.cut > 0) v.cut = Math.max(0, v.cut - this.ease * v.cut);
        if (v.cut < 0.002) v.cut = 0;
      }
      this.window.uHalf.value = 0;
      return;
    }
    const base = subject.foot.clone().project(camera);
    const top = subject.beacon.clone().project(camera);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const eye = camera.position;
    const subjectAlong = subject.foot.clone().sub(eye).dot(forward);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const mid = subject.foot.clone().lerp(subject.beacon, 0.5);
    const side = mid.clone().addScaledVector(right, this.surface.scale).project(camera);
    const centre = mid.clone().project(camera);
    const asp = width / height;
    const perUnit = Math.hypot((side.x - centre.x) * asp, side.y - centre.y);
    this.window.uBase.value.set(base.x, base.y);
    this.window.uTop.value.set(top.x, top.y + perUnit * 1.2);
    this.window.uHalf.value = perUnit * WINDOW.half;
    this.window.uFeather.value = perUnit * WINDOW.feather;
    this.window.uAlpha.value = WINDOW.alpha;
    const a = this.window.uBase.value.clone().multiply(new THREE.Vector2(asp, 1));
    const b = this.window.uTop.value.clone().multiply(new THREE.Vector2(asp, 1));
    const reach = this.window.uHalf.value + this.window.uFeather.value + perUnit * 0.6;
    const key = repoOfName(subjectView.country);
    for (const v of this.views.values()) {
      let target = 0;
      if (
        v.id !== subject.id &&
        repoOfName(v.country) === key &&
        Math.abs(v.pos.x - subjectView.pos.x) < WINDOW.reach &&
        Math.abs(v.pos.z - subjectView.pos.z) < WINDOW.reach
      ) {
        const world = this.surface.world(
          v.country,
          v.pos.x,
          v.pos.z,
          PLATFORM_LIFT + (v.height * v.scale) / 2,
        );
        const along = world.clone().sub(eye).dot(forward);
        const margin = 0.3 * this.surface.scale;
        const inFront = v.cut > 0.5 ? along < subjectAlong + margin : along < subjectAlong - margin;
        if (inFront) {
          const c = world.project(camera);
          const p = new THREE.Vector2(c.x * asp, c.y);
          const pa = p.clone().sub(a);
          const ba = b.clone().sub(a);
          const h = THREE.MathUtils.clamp(pa.dot(ba) / Math.max(ba.dot(ba), 1e-6), 0, 1);
          if (pa.sub(ba.multiplyScalar(h)).length() < reach) target = 1;
        }
      }
      v.cut += (target - v.cut) * this.ease;
      if (Math.abs(v.cut - target) < 0.002) v.cut = target;
    }
  }

  private advance(v: View, now: number): void {
    if (v.rise) {
      v.scale = progress(v.rise, now);
      if (done(v.rise, now)) delete v.rise;
    }
    if (v.sink) v.scale = 1 - progress(v.sink, now);
    if (!v.flight) {
      v.pos.lerp(v.target, this.ease);
      if (v.pos.distanceTo(v.target) < 0.001) v.pos.copy(v.target);
    }
    if (v.flight) {
      const f = v.flight;
      const pose = flightPose(f.path, now);
      v.pos.set(
        f.path.from.x + (f.path.to.x - f.path.from.x) * pose.k,
        pose.y,
        f.path.from.z + (f.path.to.z - f.path.from.z) * pose.k,
      );
      v.stretch = pose.sy;
      if (pose.k >= 1) {
        v.pos.copy(f.path.to).setY(0);
        v.pos.lerp(v.target, this.ease);
        v.stretch = 1;
        if (!f.silent) this.flights.landed(v.id, f.path, undefined, 1.4, now);
        delete v.flight;
      }
    }
  }

  /** A flight path between two flat points, on the streets when they share a continent. */
  private pathBetween(
    fromCountry: string,
    from: THREE.Vector3,
    toCountry: string,
    to: THREE.Vector3,
    apex: number,
    start: number,
    duration: number,
  ): FlightPath {
    const surface = this.surface;
    const a = surface.cellOf(fromCountry, from.x, from.z);
    const b = surface.cellOf(toCountry, to.x, to.z);
    const at = (k: number, y: number): THREE.Vector3 =>
      surface.atCell(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, y);
    return { from: from.clone(), to: to.clone(), apex, start, duration, at };
  }

  private fly(
    layout: Layout,
    id: BlockId,
    from: BlockId,
    toCell: Cell,
    start: number,
    now: number,
    body: FlightPath | undefined,
  ): void {
    const v = this.views.get(from) ?? this.views.get(id);
    const p = layout.blocks.get(id);
    if (!v || !p) return;
    if (!this.admitted.has(p.country)) {
      this.release(v);
      return;
    }
    this.views.delete(from);
    v.id = id;
    this.views.set(id, v);
    this.flights.forget(from);
    const to = new THREE.Vector3(toCell.x + 0.5, 0, toCell.z + 0.5);
    const origin = v.pos.clone().setY(0);
    const distance = this.surface.span(v.country, { x: origin.x, z: origin.z }, p.country, {
      x: to.x,
      z: to.z,
    });
    const timing = flightFor(distance);
    const path = body
      ? this.pathBetween(v.country, origin, p.country, to, body.apex, body.start, body.duration)
      : this.pathBetween(v.country, origin, p.country, to, timing.apex, start, timing.duration);
    const fromAccent = v.accent;
    const scarAt = this.surface.place(v.country, origin.x, origin.z, PLATFORM_LIFT + 0.02);
    v.accent = this.accentFor(layout, p.country);
    v.height = p.height;
    v.cell = toCell;
    v.target = to.clone();
    v.country = p.country;
    v.district = p.district;
    v.flight = { path, fromAccent, silent: body !== undefined };
    if (!body)
      this.flights.ribbon(path, undefined, v.height + 0.2, this.scar(scarAt, now, 0.9, 0.9, true));
  }

  private flyPlatform(
    key: string,
    rect: Rect & { country: string; district: string },
    now: number,
    silent: boolean,
  ): FlightPath | undefined {
    const plate = this.plates.get(key);
    const was = this.settling.rectOf(key);
    if (!plate || !was) return undefined;
    const from = new THREE.Vector3(was.x + was.w / 2, 0, was.z + was.h / 2);
    const to = new THREE.Vector3(rect.x + rect.w / 2, 0, rect.z + rect.h / 2);
    const timing = flightFor(Math.hypot(to.x - from.x, to.z - from.z));
    const path = this.pathBetween(
      plate.country,
      from,
      rect.country,
      to,
      timing.apex,
      now,
      timing.duration,
    );
    if (!silent) {
      const scarAt = this.surface.place(plate.country, from.x, from.z, PLATFORM_LIFT + 0.02);
      const scar = this.scar(scarAt, now, was.w + 2 * plate.skirt, was.h + 2 * plate.skirt, true);
      this.flights.ribbon(path, undefined, 0.4, scar);
    }
    const landing = districtKey(rect.country, rect.district);
    this.plates.delete(key);
    plate.flight = path;
    plate.country = rect.country;
    this.plates.set(landing, plate);
    this.settling.rename(key, landing);
    this.settling.arrive(landing, rect);
    return path;
  }

  private place(
    id: BlockId,
    cell: Cell,
    height: number,
    accent: Accent,
    country: string,
    district: string,
    rise: Tween | undefined,
  ): void {
    const existing = this.views.get(id);
    if (existing) {
      existing.height = height;
      return;
    }
    const index = this.towers.allocate();
    this.caps.allocate();
    const pos = new THREE.Vector3(cell.x + 0.5, 0, cell.z + 0.5);
    this.views.set(id, {
      id,
      index,
      cell,
      pos,
      height,
      accent,
      target: pos.clone(),
      scale: rise ? 0 : 1,
      stretch: 1,
      country,
      district,
      cut: 0,
      ...(rise && { rise }),
    });
  }

  private release(v: View): void {
    if (v.flight) this.flights.abandon(v.flight.path, this.lastAt);
    this.views.delete(v.id);
    this.flights.forget(v.id);
    this.towers.release(v.index);
    this.caps.release(v.index);
  }

  private remove(v: View, now: number): void {
    const at = this.surface.place(v.country, v.pos.x, v.pos.z, PLATFORM_LIFT + 0.02);
    this.release(v);
    this.scar(at, now, 0.9, 0.9, false);
  }

  private scar(
    at: { position: THREE.Vector3; quaternion: THREE.Quaternion },
    now: number,
    w: number,
    d: number,
    owned: boolean,
    life = SCAR_MS,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      scarGeometry,
      new THREE.MeshBasicMaterial({
        color: SCAR_COLOR,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    mesh.scale.set(w, 1, d);
    mesh.position.copy(at.position);
    mesh.quaternion.copy(at.quaternion);
    this.scarGroup.add(mesh);
    if (!owned) this.scars.push({ mesh, born: now, life });
    return mesh;
  }

  private accentFor(layout: Layout, country: string): Accent {
    void layout;
    const c = this.byCountry.get(country);
    return c ? accentOf(c.family, c.variant) : PLUMBING;
  }

  /** Country plates by name and the tallest block on each district, both read every frame. */
  private index(layout: Layout): void {
    this.byCountry = new Map(layout.countries.map((c) => [c.country, c]));
    this.tops = new Map();
    for (const p of layout.blocks.values()) {
      const key = `${p.country}\0${p.district}`;
      this.tops.set(key, Math.max(this.tops.get(key) ?? 0, p.height));
    }
  }

  /** The ground follows the layout: every plate targets its rect, a flight only overrides its position. */
  private syncGround(layout: Layout, now: number, snap: boolean): void {
    const live = new Set<string>();
    const moved: { country: string; rect: Rect }[] = [];
    for (const ct of layout.continents) {
      const key = landKey(ct.repo);
      live.add(key);
      this.settling.target(key, ct.land, undefined, snap);
    }
    for (const c of layout.countries) {
      const key = countryKey(c.country);
      live.add(key);
      if (this.settling.target(key, c, landKey(repoOfName(c.country)), snap) === 'moved') {
        moved.push({ country: c.country, rect: c });
      }
    }
    for (const d of layout.districts) {
      const key = districtKey(d.country, d.district);
      live.add(key);
      if (this.settling.target(key, d, countryKey(d.country), snap) === 'moved') {
        moved.push({ country: d.country, rect: d });
      }
    }
    this.settling.keep(live);

    const seen = new Set<string>();
    const upsert = (
      key: string,
      country: string,
      top: number,
      bottom: number,
      skirt: number,
      shadeAt: number,
      color: THREE.Color,
      rimColor?: THREE.Color,
    ): void => {
      seen.add(key);
      const existing = this.plates.get(key);
      if (existing) {
        delete existing.gone;
        return;
      }
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
      );
      this.ground.add(mesh);
      const shade = shadeMesh();
      this.ground.add(shade);
      let rim: THREE.LineLoop | undefined;
      if (rimColor) {
        rim = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: rimColor,
            transparent: true,
            opacity: 0.35,
            toneMapped: false,
          }),
        );
        this.ground.add(rim);
      }
      this.plates.set(key, {
        mesh,
        ...(rim && { rim }),
        shade,
        country,
        built: { x: NaN, z: NaN, w: 0, h: 0 },
        top,
        bottom,
        skirt,
        shadeAt,
      });
    };
    for (const c of layout.countries) {
      if (!this.admitted.has(c.country)) continue;
      const accent = accentOf(c.family, c.variant);
      upsert(
        countryKey(c.country),
        c.country,
        GROUND.country.top,
        GROUND.country.bottom,
        COUNTRY_SKIRT,
        GROUND.shade.land,
        paint.plate(accent),
        paint.cap(accent),
      );
    }
    for (const d of layout.districts) {
      if (!this.admitted.has(d.country)) continue;
      const c = this.byCountry.get(d.country);
      upsert(
        districtKey(d.country, d.district),
        d.country,
        GROUND.district.top,
        GROUND.district.bottom,
        DISTRICT_SKIRT,
        GROUND.shade.country,
        paint.platform(c ? accentOf(c.family, c.variant) : PLUMBING),
      );
    }
    for (const [key, plate] of this.plates) {
      if (seen.has(key)) continue;
      if (plate.flight) plate.gone = true;
      else this.dropPlate(key, plate, now, !this.admitted.has(plate.country));
    }
    if (!snap && moved.length > 0) {
      const insideFlat = (pt: THREE.Vector3): boolean =>
        moved.some(
          ({ rect: r }) =>
            pt.x >= r.x - 1 && pt.x <= r.x + r.w + 1 && pt.z >= r.z - 1 && pt.z <= r.z + r.h + 1,
        );
      const spheres = moved.map(({ country, rect: r }) => ({
        centre: this.surface.world(country, r.x + r.w / 2, r.z + r.h / 2),
        radius: (Math.hypot(r.w, r.h) / 2 + 1) * this.surface.scale,
      }));
      this.ribbons.dissolve((pt) => spheres.some((s) => pt.distanceTo(s.centre) <= s.radius), now);
      this.flights.dissolve(insideFlat, now);
    }
  }

  private showPlate(plate: Plate, on: boolean): void {
    plate.mesh.visible = on;
    plate.shade.visible = on && plate.flight === undefined;
    if (plate.rim) plate.rim.visible = on;
  }

  /** A plate is a shell that follows the sphere: rebuilt whenever its rect has moved. */
  private buildPlate(plate: Plate, r: Rect): void {
    const b = plate.built;
    if (
      Math.abs(r.x - b.x) < 1e-3 &&
      Math.abs(r.z - b.z) < 1e-3 &&
      Math.abs(r.w - b.w) < 1e-3 &&
      Math.abs(r.h - b.h) < 1e-3
    )
      return;
    plate.built = { ...r };
    const x0 = r.x - plate.skirt;
    const z0 = r.z - plate.skirt;
    const w = r.w + 2 * plate.skirt;
    const h = r.h + 2 * plate.skirt;
    plate.mesh.geometry.dispose();
    plate.mesh.geometry = shellGeometry(
      this.surface,
      plate.country,
      x0,
      z0,
      w,
      h,
      plate.bottom,
      plate.top,
    );
    plate.mesh.position.set(0, 0, 0);
    plate.mesh.quaternion.identity();
    if (plate.rim) {
      plate.rim.geometry.dispose();
      plate.rim.geometry = rimGeometry(this.surface, plate.country, x0, z0, w, h, plate.top + 0.01);
      plate.rim.position.set(0, 0, 0);
      plate.rim.quaternion.identity();
    }
    plate.shade.geometry.dispose();
    plate.shade.geometry = shadeGeometry(
      this.surface,
      plate.country,
      x0,
      z0,
      w,
      h,
      plate.shadeAt,
      SHADE.spread,
      SHADE.alpha,
    );
  }

  private dropPlate(key: string, plate: Plate, now: number, quiet = false): void {
    const r = this.settling.rectOf(key) ?? plate.built;
    this.ground.remove(plate.mesh);
    plate.mesh.geometry.dispose();
    this.ground.remove(plate.shade);
    plate.shade.geometry.dispose();
    if (plate.rim) {
      this.ground.remove(plate.rim);
      plate.rim.geometry.dispose();
    }
    this.plates.delete(key);
    if (quiet || Number.isNaN(r.x)) return;
    const at = this.surface.place(
      plate.country,
      r.x + r.w / 2,
      r.z + r.h / 2,
      PLATFORM_LIFT + 0.02,
    );
    this.scar(at, now, r.w + 2 * plate.skirt, r.h + 2 * plate.skirt, false, RIBBON_RETRACT_MS);
  }
}

/** A slab between two heights over a rect of cells, every vertex on its own radial. */
function shellGeometry(
  surface: Surface,
  country: string,
  x0: number,
  z0: number,
  w: number,
  h: number,
  bottom: number,
  top: number,
): THREE.BufferGeometry {
  const nx = surface.segmentsFor(w);
  const nz = surface.segmentsFor(h);
  const positions: number[] = [];
  const grid = (y: number): number => {
    const base = positions.length / 3;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const p = surface.local(country, x0 + (w * i) / nx, z0 + (h * j) / nz, y);
        positions.push(p.x, p.y, p.z);
      }
    }
    return base;
  };
  grid(top);
  grid(bottom);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(slabIndices(nx, nz));
  geometry.computeVertexNormals();
  return geometry;
}

function rimGeometry(
  surface: Surface,
  country: string,
  x0: number,
  z0: number,
  w: number,
  h: number,
  y: number,
): THREE.BufferGeometry {
  const nx = surface.segmentsFor(w);
  const nz = surface.segmentsFor(h);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < nx; i++) pts.push(surface.local(country, x0 + (w * i) / nx, z0, y));
  for (let j = 0; j < nz; j++) pts.push(surface.local(country, x0 + w, z0 + (h * j) / nz, y));
  for (let i = nx; i > 0; i--) pts.push(surface.local(country, x0 + (w * i) / nx, z0 + h, y));
  for (let j = nz; j > 0; j--) pts.push(surface.local(country, x0, z0 + (h * j) / nz, y));
  return new THREE.BufferGeometry().setFromPoints(pts);
}

function dirOf(id: string): string {
  return id.slice(0, id.lastIndexOf('/'));
}
