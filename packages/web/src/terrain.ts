import * as THREE from 'three';
import {
  BREATH_MS,
  FLOCK_STAGGER_MS,
  RIBBON_RETRACT_MS,
  RISE_MS,
  SCAR_MS,
  SINK_MS,
  flightFor,
  type BlockId,
  type Cell,
  type Layout,
  type Memory,
  type Motion,
  type Rect,
} from '@strata/core';
import type { Effects } from './effects.js';
import { Flights, flightPose, type FlightPath } from './flights.js';
import { Instances } from './instances.js';
import type { Ribbons } from './ribbons.js';
import type { Stage } from './stage.js';
import {
  CAP_HEIGHT,
  PLATE_HEIGHT,
  PLATE_Y,
  PLATFORM_HEIGHT,
  PLATFORM_LIFT,
  PLATFORM_Y,
  TOWER,
  U,
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
  rim?: THREE.LineSegments;
  at: Rect;
  to: Rect;
  lift: number;
  y: number;
  pad: number;
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
const rimGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.02, 1));
const scarGeometry = new THREE.PlaneGeometry(1, 1);
const SCAR_COLOR = 0x1e2028;
const PLUMBING: Accent = { hue: 220, s: 0.04, l: 0.42 };
const SETTLE_DECAY = 0.02;

/** Towers, caps, platforms and plates, animated from motions and painted from memory. */
export class Terrain {
  readonly flights: Flights;
  private views = new Map<BlockId, View>();
  private plates = new Map<string, Plate>();
  private scars: Scar[] = [];
  private readonly towers: Instances;
  private readonly caps: Instances;
  private readonly halfCaps: THREE.InstancedMesh;
  private readonly ground = new THREE.Group();
  private readonly scarGroup = new THREE.Group();
  private layout: Layout | undefined;
  private readonly m = new THREE.Matrix4();
  private readonly base = new THREE.Color();
  private readonly cap = new THREE.Color();
  private readonly other = new THREE.Color();
  private readonly ray = new THREE.Raycaster();
  private readonly window = windowUniforms();
  private subject: Subject | undefined;
  private lastAt = 0;
  private ease = 0.1;

  constructor(
    private readonly stage: Stage,
    private readonly effects: Effects,
    private readonly ribbons: Ribbons,
  ) {
    const towerMaterial = (): THREE.MeshStandardMaterial =>
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, flatShading: true });
    this.towers = new Instances(
      box,
      windowed(towerMaterial(), this.window, false),
      stage.scene,
      64,
      windowed(
        Object.assign(towerMaterial(), { transparent: true, depthWrite: false }),
        this.window,
        true,
      ),
    );
    this.towers.mesh.castShadow = this.towers.mesh.receiveShadow = true;
    this.caps = new Instances(
      capGeometry,
      windowed(new THREE.MeshBasicMaterial({ toneMapped: false }), this.window, false),
      stage.scene,
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
    stage.scene.add(this.halfCaps, this.ground, this.scarGroup);
    this.flights = new Flights(stage.scene, effects);
  }

  has(id: BlockId): boolean {
    return this.views.has(id);
  }

  get plateCount(): number {
    return this.plates.size;
  }

  /** Towers currently opened by the window, and the band's half-width in screen units. */
  get windowed(): { towers: number; half: number } {
    let towers = 0;
    for (const v of this.views.values()) if (v.cut > 0.5) towers++;
    return { towers, half: this.window.uHalf.value };
  }

  /** Inconsistencies between what is drawn and the layout, for the dev hook. */
  audit(): {
    misplaced: string[];
    flying: number;
    orphanViews: string[];
    missingViews: string[];
    emptyPlates: string[];
    strayPlates: string[];
  } {
    const layout = this.layout;
    const misplaced: string[] = [];
    const orphanViews: string[] = [];
    let flying = 0;
    if (!layout)
      return { misplaced, flying, orphanViews, missingViews: [], emptyPlates: [], strayPlates: [] };
    for (const v of this.views.values()) {
      const p = layout.blocks.get(v.id);
      if (!p) {
        orphanViews.push(v.id);
        continue;
      }
      if (v.flight) {
        flying++;
        continue;
      }
      const at = this.stage.world(p.cell.x + 0.5, p.cell.z + 0.5);
      if (Math.hypot(v.pos.x - at.x, v.pos.z - at.z) > 0.05)
        misplaced.push(
          `${v.id}@${String(v.cell.x)},${String(v.cell.z)} vs ${String(p.cell.x)},${String(p.cell.z)}`,
        );
    }
    const missingViews = [...layout.blocks.keys()].filter((id) => !this.views.has(id));
    const populated = new Set<string>();
    for (const p of layout.blocks.values()) populated.add(`d\0${p.country}\0${p.district}`);
    const emptyPlates = layout.districts
      .map((d) => `d\0${d.country}\0${d.district}`)
      .filter((k) => !populated.has(k));
    const keys = new Set([
      ...layout.countries.map((c) => `c\0${c.country}`),
      ...layout.districts.map((d) => `d\0${d.country}\0${d.district}`),
    ]);
    const strayPlates = [...this.plates.keys()].filter((k) => !keys.has(k));
    return { misplaced, flying, orphanViews, missingViews, emptyPlates, strayPlates };
  }

  /** The block under a pointer, by ray against the towers. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): BlockId | undefined {
    this.ray.setFromCamera(ndc, camera);
    this.towers.mesh.boundingSphere = null;
    const hit = this.ray.intersectObject(this.towers.mesh)[0];
    if (hit?.instanceId === undefined) return undefined;
    for (const v of this.views.values()) if (v.index === hit.instanceId) return v.id;
    return undefined;
  }

  /** The tallest tower standing on a district, in world units. */
  tallest(country: string, district: string): number {
    let top = 1;
    if (!this.layout) return top;
    for (const [id, p] of this.layout.blocks) {
      if (p.country !== country || p.district !== district) continue;
      const v = this.views.get(id);
      top = Math.max(top, (v ? v.height * v.scale : p.height) + PLATFORM_LIFT);
    }
    return top;
  }

  /** Where light lands on a block: the centre of its cap, following flights. */
  top(id: BlockId): THREE.Vector3 | undefined {
    const v = this.views.get(id);
    if (!v) return undefined;
    return new THREE.Vector3(
      v.pos.x,
      v.pos.y + PLATFORM_LIFT + v.height * v.scale * v.stretch + CAP_HEIGHT,
      v.pos.z,
    );
  }

  /** Where a block stands: the centre of its footprint on the platform. */
  foot(id: BlockId): THREE.Vector3 | undefined {
    const v = this.views.get(id);
    return v ? new THREE.Vector3(v.pos.x, PLATFORM_LIFT, v.pos.z) : undefined;
  }

  cellAt(id: BlockId): Cell | undefined {
    return this.views.get(id)?.cell;
  }

  apply(layout: Layout, motions: readonly Motion[], now: number, snap: boolean): void {
    const first = this.layout === undefined;
    this.layout = layout;
    if (first || snap) {
      this.syncGround(layout, now, true);
      for (const [id, p] of layout.blocks) {
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
        ? { key: `d\0${source.country}\0${source.district}`, dir: dirOf(first.from) }
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
          if (!p) break;
          const start = now + next();
          const accent = this.accentFor(layout, p.country);
          this.place(motion.id, p.cell, p.height, accent, p.country, p.district, {
            start,
            duration: RISE_MS,
            ease: linear,
          });
          if (!burst) {
            const top = this.stage.world(p.cell.x + 0.5, p.cell.z + 0.5);
            top.y = PLATFORM_LIFT + p.height + 0.3;
            this.effects.add({
              kind: 'crown',
              at: top,
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
        case 'slide':
          break;
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
        case 'platform':
          break;
        case 'ground':
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
        v.target = this.stage.world(p.cell.x + 0.5, p.cell.z + 0.5);
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
    const dt = this.lastAt === 0 ? 1 / 60 : Math.min(0.1, (now - this.lastAt) / 1000);
    this.lastAt = now;
    this.ease = 1 - Math.pow(SETTLE_DECAY, dt);
    let halves = 0;
    for (const v of this.views.values()) {
      if (v.sink && done(v.sink, now)) {
        this.remove(v, now);
        continue;
      }
      this.advance(v, now);
      const h = Math.max(0.001, v.height * v.scale * v.stretch);
      const sxz = 1 / Math.sqrt(v.stretch);
      this.m.makeScale(TOWER * U * sxz, h, TOWER * U * sxz);
      this.m.setPosition(v.pos.x, v.pos.y + PLATFORM_LIFT + h / 2, v.pos.z);
      this.towers.mesh.setMatrixAt(v.index, this.m);
      this.m.makeScale(sxz, 1, sxz);
      this.m.setPosition(v.pos.x, v.pos.y + PLATFORM_LIFT + h + CAP_HEIGHT / 2, v.pos.z);
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
          this.m.makeScale(1, 1, 1);
          this.m.setPosition(
            v.pos.x - (TOWER + 0.04) / 4,
            v.pos.y + PLATFORM_LIFT + h + CAP_HEIGHT / 2 + 0.005,
            v.pos.z,
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
      if (plate.flight) {
        const pose = flightPose(plate.flight, now);
        plate.mesh.position.set(pose.x, plate.y + Math.max(0, pose.y), pose.z);
        plate.rim?.position.set(pose.x, Math.max(0, pose.y) + 0.01, pose.z);
        if (pose.k < 1) continue;
        this.flights.landed(
          `platform\0${key}`,
          plate.flight,
          undefined,
          Math.max(plate.to.w, plate.to.h) * U,
          now,
        );
        delete plate.flight;
        plate.at = { ...plate.to };
      }
      if (plate.gone) {
        this.dropPlate(key, plate, now);
        continue;
      }
      const r = plate.at;
      r.x += (plate.to.x - r.x) * this.ease;
      r.z += (plate.to.z - r.z) * this.ease;
      r.w += (plate.to.w - r.w) * this.ease;
      r.h += (plate.to.h - r.h) * this.ease;
      const at = this.stage.world(r.x + r.w / 2, r.z + r.h / 2);
      plate.mesh.scale.set((r.w + plate.pad) * U, plate.lift, (r.h + plate.pad) * U);
      plate.mesh.position.set(at.x, plate.y, at.z);
      if (plate.rim) {
        plate.rim.scale.set((r.w + plate.pad) * U, 1, (r.h + plate.pad) * U);
        plate.rim.position.set(at.x, 0.01, at.z);
      }
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
    this.flights.update(now, hover, hover === undefined ? undefined : this.top(hover));
  }

  private updateWindow(): void {
    const subject = this.subject;
    const camera = this.stage.camera;
    const { width, height } = this.stage.size();
    this.window.uAspect.value = width / height;
    if (!subject) {
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
    const fwd = new THREE.Vector2(forward.x, forward.z).normalize();
    const eye = new THREE.Vector2(camera.position.x, camera.position.z);
    const subjectAlong = new THREE.Vector2(subject.foot.x, subject.foot.z).sub(eye).dot(fwd);
    const right = new THREE.Vector3()
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .setY(0)
      .normalize();
    const mid = subject.foot.clone().lerp(subject.beacon, 0.5);
    const side = mid.clone().add(right).project(camera);
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
    const near = new THREE.Vector2();
    for (const v of this.views.values()) {
      let target = 0;
      if (
        v.id !== subject.id &&
        Math.abs(v.pos.x - subject.foot.x) < WINDOW.reach &&
        Math.abs(v.pos.z - subject.foot.z) < WINDOW.reach
      ) {
        const along = near.set(v.pos.x, v.pos.z).sub(eye).dot(fwd);
        const inFront = v.cut > 0.5 ? along < subjectAlong + 0.2 : along < subjectAlong - 0.4;
        if (inFront) {
          const c = new THREE.Vector3(
            v.pos.x,
            PLATFORM_LIFT + (v.height * v.scale) / 2,
            v.pos.z,
          ).project(camera);
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
      v.pos.set(pose.x, pose.y, pose.z);
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
    this.views.delete(from);
    v.id = id;
    this.views.set(id, v);
    this.flights.forget(from);
    const to = this.stage.world(toCell.x + 0.5, toCell.z + 0.5);
    const origin = v.pos.clone().setY(0);
    const timing = flightFor(Math.hypot(to.x - origin.x, to.z - origin.z));
    const path: FlightPath = body
      ? { from: origin, to, apex: body.apex, start: body.start, duration: body.duration }
      : { from: origin, to, apex: timing.apex, start, duration: timing.duration };
    const fromAccent = v.accent;
    v.accent = this.accentFor(layout, p.country);
    v.height = p.height;
    v.cell = toCell;
    v.target = to.clone();
    v.country = p.country;
    v.district = p.district;
    v.flight = { path, fromAccent, silent: body !== undefined };
    if (!body)
      this.flights.ribbon(
        path,
        undefined,
        v.height + 0.2,
        this.scar(origin, now, 0.9, 0.9, true),
        () => v.pos,
      );
  }

  private flyPlatform(
    key: string,
    rect: Rect & { country: string; district: string },
    now: number,
    silent: boolean,
  ): FlightPath | undefined {
    const plate = this.plates.get(key);
    if (!plate) return undefined;
    const from = plate.mesh.position.clone().setY(0);
    const to = this.stage.world(rect.x + rect.w / 2, rect.z + rect.h / 2);
    const timing = flightFor(Math.hypot(to.x - from.x, to.z - from.z));
    const path: FlightPath = { from, to, apex: timing.apex, start: now, duration: timing.duration };
    if (!silent) {
      const scar = this.scar(
        from,
        now,
        (plate.to.w + plate.pad) * U,
        (plate.to.h + plate.pad) * U,
        true,
      );
      this.flights.ribbon(path, undefined, 0.4, scar, () => plate.mesh.position);
    }
    this.plates.delete(key);
    plate.flight = path;
    plate.at = { ...rect };
    plate.to = { ...rect };
    plate.mesh.scale.set((rect.w + plate.pad) * U, plate.lift, (rect.h + plate.pad) * U);
    plate.rim?.scale.set((rect.w + plate.pad) * U, 1, (rect.h + plate.pad) * U);
    this.plates.set(`d\0${rect.country}\0${rect.district}`, plate);
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
    const pos = this.stage.world(cell.x + 0.5, cell.z + 0.5);
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

  private remove(v: View, now: number): void {
    if (v.flight) this.flights.abandon(v.flight.path, now);
    this.views.delete(v.id);
    this.flights.forget(v.id);
    this.towers.release(v.index);
    this.caps.release(v.index);
    this.scar(v.pos, now, 0.9, 0.9, false);
  }

  private scar(
    at: THREE.Vector3,
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
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(w, d, 1);
    mesh.position.set(at.x, PLATFORM_LIFT + 0.02, at.z);
    this.scarGroup.add(mesh);
    if (!owned) this.scars.push({ mesh, born: now, life });
    return mesh;
  }

  private accentFor(layout: Layout, country: string): Accent {
    const c = layout.countries.find((k) => k.country === country);
    return c ? accentOf(c.family, c.variant) : PLUMBING;
  }

  /** The ground follows the layout: every plate targets its rect, a flight only overrides its position. */
  private syncGround(layout: Layout, now: number, snap: boolean): void {
    const seen = new Set<string>();
    const moved: Plate[] = [];
    const upsert = (
      key: string,
      rect: Rect,
      lift: number,
      y: number,
      pad: number,
      color: THREE.Color,
      rimColor?: THREE.Color,
    ): void => {
      seen.add(key);
      const existing = this.plates.get(key);
      if (existing) {
        delete existing.gone;
        const changed =
          existing.to.x !== rect.x ||
          existing.to.z !== rect.z ||
          existing.to.w !== rect.w ||
          existing.to.h !== rect.h;
        if (changed) {
          existing.to = { ...rect };
          if (snap) existing.at = { ...rect };
          if (!existing.flight) moved.push(existing);
        }
        return;
      }
      const mesh = new THREE.Mesh(
        box,
        new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
      );
      mesh.castShadow = mesh.receiveShadow = true;
      this.ground.add(mesh);
      let rim: THREE.LineSegments | undefined;
      if (rimColor) {
        rim = new THREE.LineSegments(
          rimGeometry,
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
        at: { ...rect },
        to: { ...rect },
        lift,
        y,
        pad,
      });
    };
    for (const c of layout.countries) {
      const accent = accentOf(c.family, c.variant);
      upsert(
        `c ${c.country}`,
        c,
        PLATE_HEIGHT,
        PLATE_Y,
        1.6,
        paint.plate(accent),
        paint.cap(accent),
      );
    }
    for (const d of layout.districts) {
      const c = layout.countries.find((k) => k.country === d.country);
      upsert(
        `d ${d.country} ${d.district}`,
        d,
        PLATFORM_HEIGHT,
        PLATFORM_Y,
        0.6,
        paint.platform(c ? accentOf(c.family, c.variant) : PLUMBING),
      );
    }
    for (const [key, plate] of this.plates) {
      if (seen.has(key)) continue;
      if (plate.flight) plate.gone = true;
      else this.dropPlate(key, plate, now);
    }
    if (!snap && moved.length > 0) {
      const inside = (pt: THREE.Vector3): boolean =>
        moved.some((p) => {
          const at = this.stage.world(p.to.x, p.to.z);
          return (
            pt.x >= at.x - 1 &&
            pt.x <= at.x + (p.to.w + 1) * U &&
            pt.z >= at.z - 1 &&
            pt.z <= at.z + (p.to.h + 1) * U
          );
        });
      this.ribbons.dissolve(inside, now);
      this.flights.dissolve(inside, now);
    }
  }

  private dropPlate(key: string, plate: Plate, now: number): void {
    this.ground.remove(plate.mesh);
    if (plate.rim) this.ground.remove(plate.rim);
    this.plates.delete(key);
    const at = plate.mesh.position.clone().setY(0);
    this.scar(
      at,
      now,
      (plate.at.w + plate.pad) * U,
      (plate.at.h + plate.pad) * U,
      false,
      RIBBON_RETRACT_MS,
    );
  }
}

function dirOf(id: string): string {
  return id.slice(0, id.lastIndexOf('/'));
}
