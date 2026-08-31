import * as THREE from 'three';
import {
  ARRIVAL_MS,
  DEPARTURE_MS,
  route,
  sameContinent,
  type Agent,
  type BlockId,
  type Layout,
  type Motion,
  type RepoId,
} from '@strata/core';
import { additive, beamGeometry, beamMaterial, type Effects, type Frame } from './effects.js';
import type { Ground } from './ground.js';
import { GROUND_Y, type Ribbons } from './ribbons.js';
import type { Stage } from './stage.js';
import { occupiedBy, smooth } from './streets.js';
import { PLATFORM_LIFT, paint } from './theme.js';

const REST = 0.25;
const RISE = 0.95;
const CORE = 0.08;
const HALO = 0.018;
const SKY = 18;
const UP = new THREE.Vector3(0, 1, 0);

interface Trip {
  path: THREE.Vector3[];
  seg: number;
  t: number;
  speed: number;
  from?: BlockId;
  to: BlockId;
  verb: 'reading' | 'editing' | undefined;
}

interface Beacon {
  id: string;
  repo: RepoId;
  hue: number;
  color: THREE.Color;
  halo: THREE.Sprite;
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  stem: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  spot: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  arc: THREE.Sprite;
  ring: THREE.Sprite;
  work: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  workOpacity: THREE.IUniform<number>;
  band: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  ghost: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  light: THREE.PointLight;
  pos: THREE.Vector3;
  frame: Frame;
  block?: BlockId;
  trip?: Trip;
  phase: 'arriving' | 'live' | 'leaving';
  phaseAt: number;
  landedAt: number;
  lift: number;
  flicker: number;
  nextShock?: number;
  nextSpark?: number;
}

function radial(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

function arcTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(64, 64, 48, 0, (Math.PI * 2) / 3);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(c);
}

const haloTexture = radial();
const arcTex = arcTexture();
const ringTex = ringTexture();
const backOut = (k: number): number => {
  const c1 = 1.7;
  return (
    1 +
    c1 * Math.pow(k - 1, 3) +
    (c1 - 1) * Math.pow(k - 1, 2) * (k - 1) +
    (c1 + 1) * Math.pow(k - 1, 2)
  );
};

/** One light per session: a comet at rest on a tower, a pulse in the fibre while it travels. */
export class Beacons {
  private beacons = new Map<string, Beacon>();
  private visible = true;

  constructor(
    private readonly stage: Stage,
    private readonly ground: Ground,
    private readonly effects: Effects,
    private readonly ribbons: Ribbons,
  ) {}

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    for (const b of this.beacons.values()) this.parts(b).forEach((o) => (o.visible = visible));
  }

  apply(motions: readonly Motion[], layout: Layout, rows: readonly Agent[], now: number): void {
    const rowOf = (id: string): Agent | undefined => rows.find((r) => r.id === id);
    for (const motion of motions) {
      switch (motion.kind) {
        case 'arrive': {
          const row = rowOf(motion.agentId);
          if (row) this.arrive(row, now);
          break;
        }
        case 'depart': {
          const b = this.beacons.get(motion.agentId);
          if (b) {
            b.phase = 'leaving';
            b.phaseAt = now;
          }
          break;
        }
        case 'flight':
        case 'blink':
          for (const b of this.beacons.values()) if (b.block === motion.from) b.block = motion.id;
          break;
        case 'platform':
          for (const move of motion.moves) {
            for (const b of this.beacons.values()) if (b.block === move.from) b.block = move.id;
          }
          break;
        case 'trip': {
          const row = rowOf(motion.agentId);
          if (!row) break;
          const b = this.beacons.get(motion.agentId) ?? this.arrive(row, now);
          const verb = row.verb;
          this.travel(
            b,
            layout,
            motion.to,
            verb === 'reading' || verb === 'editing' ? verb : undefined,
          );
          break;
        }
        default:
          break;
      }
    }
  }

  presenceOf(
    rows: readonly Agent[],
  ): Map<BlockId, { hue: number; verb: 'reading' | 'editing'; flicker: number }> {
    const out = new Map<BlockId, { hue: number; verb: 'reading' | 'editing'; flicker: number }>();
    for (const row of rows) {
      const b = this.beacons.get(row.id);
      if (!b || b.trip || b.phase !== 'live' || row.block === undefined) continue;
      if (row.verb !== 'reading' && row.verb !== 'editing') continue;
      out.set(row.block, { hue: row.hue, verb: row.verb, flicker: b.flicker });
    }
    return out;
  }

  positionOf(agentId: string): THREE.Vector3 | undefined {
    return this.beacons.get(agentId)?.pos.clone();
  }

  /** The block a travelling beacon set off from, while it is still on its way. */
  tripOrigin(agentId: string): BlockId | undefined {
    return this.beacons.get(agentId)?.trip?.from;
  }

  hit(
    x: number,
    y: number,
    width: number,
    height: number,
    camera: THREE.Camera,
    radius = 14,
  ): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const b of this.beacons.values()) {
      if (!b.core.visible) continue;
      const p = b.core.position.clone().project(camera);
      const d = Math.hypot(((p.x + 1) / 2) * width - x, ((1 - p.y) / 2) * height - y);
      if (d < radius && (!best || d < best.d)) best = { id: b.id, d };
    }
    return best?.id;
  }

  update(now: number, rows: readonly Agent[], dim: (agentId: string | undefined) => number): void {
    if (!this.visible) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const b of this.beacons.values()) {
      const row = byId.get(b.id);
      const dimA = dim(b.id) < 1 ? 0.45 : 1;
      if (row) b.repo = row.repo;
      if (b.phase === 'live' && !row) {
        b.phase = 'leaving';
        b.phaseAt = now;
      }
      if (b.phase !== 'live') {
        this.beamInOut(b, now, dimA);
        continue;
      }
      if (b.trip) this.advance(b, now);
      else if (b.block !== undefined) {
        const top = this.ground.top(b.block);
        const frame = this.ground.frameOf(b.block);
        if (top) b.pos.copy(top);
        if (frame) b.frame = frame;
      } else {
        const above = this.ground.frameAbove(b.repo);
        if (above) {
          b.pos.copy(above.at);
          b.frame = above.frame;
        }
      }
      for (const o of [b.halo, b.core, b.stem, b.light]) o.visible = true;
      this.look(b, row, now, dimA);
    }
  }

  private parts(b: Beacon): THREE.Object3D[] {
    return [b.halo, b.core, b.stem, b.spot, b.arc, b.ring, b.work, b.band, b.ghost, b.light];
  }

  private arrive(row: Agent, now: number): Beacon {
    const existing = this.beacons.get(row.id);
    if (existing) {
      if (existing.phase === 'leaving') {
        existing.phase = 'live';
        existing.landedAt = now;
      }
      return existing;
    }
    const color = paint.agent(row.hue);
    const sprite = (map: THREE.Texture, mult: number): THREE.Sprite =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map,
          color: color.clone().multiplyScalar(mult),
          sizeAttenuation: false,
          depthTest: false,
          transparent: true,
          toneMapped: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
    const halo = sprite(haloTexture, 3);
    halo.renderOrder = 10;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 12),
      new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(18),
        toneMapped: false,
        fog: false,
      }),
    );
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1, 6),
      new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(2),
        transparent: true,
        opacity: 0.6,
        toneMapped: false,
        fog: false,
      }),
    );
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2),
      additive(color, 1.2, 0.35),
    );
    const arc = sprite(arcTex, 4);
    arc.scale.setScalar(0.028);
    arc.renderOrder = 11;
    const ring = sprite(ringTex, 3.5);
    ring.scale.setScalar(0.034);
    ring.renderOrder = 11;
    const { material: workMaterial, uniforms } = beamMaterial(color, 0.45);
    const work = new THREE.Mesh(beamGeometry, workMaterial);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, 0.94), additive(color, 2.2, 0));
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1, 0.9).translate(0, 0.5, 0),
      additive(color, 0.35, 0),
    );
    const light = new THREE.PointLight(color, 8, 6, 1.7);
    const above = this.ground.frameAbove(row.repo);
    const beacon: Beacon = {
      id: row.id,
      repo: row.repo,
      hue: row.hue,
      color,
      halo,
      core,
      stem,
      spot,
      arc,
      ring,
      work,
      workOpacity: uniforms.uOpacity,
      band,
      ghost,
      light,
      pos: above?.at.clone() ?? new THREE.Vector3(0, 3, 0),
      frame: above?.frame ?? { up: UP.clone(), scale: 1 },
      phase: 'arriving',
      phaseAt: now,
      landedAt: -1e9,
      lift: 0,
      flicker: 0,
    };
    this.stage.scene.add(...this.parts(beacon));
    for (const o of [spot, arc, ring, work, band, ghost]) o.visible = false;
    this.beacons.set(row.id, beacon);
    return beacon;
  }

  private dispose(b: Beacon): void {
    for (const o of this.parts(b)) this.stage.scene.remove(o);
    this.beacons.delete(b.id);
  }

  private travel(b: Beacon, layout: Layout, to: BlockId, verb: Trip['verb']): void {
    const target = this.ground.top(to);
    if (!target) {
      b.block = to;
      return;
    }
    const start = b.block !== undefined ? this.ground.top(b.block) : undefined;
    const placed = layout.blocks.get(to);
    let ground: THREE.Vector3[] = [];
    if (b.block !== undefined && start && placed && sameContinent(layout, b.block, to)) {
      const corners = route(layout, b.block, to);
      const flat = smooth(
        corners.map((c) => new THREE.Vector3(c.x, 0, c.z)),
        occupiedBy(layout, placed.country),
        (p) => ({ x: Math.floor(p.x), z: Math.floor(p.z) }),
        (x, z) => new THREE.Vector3(x, 0, z),
      );
      ground = flat
        .map((p) => this.ground.worldOf(placed.country, p.x, p.z, GROUND_Y + 0.01))
        .filter((p): p is THREE.Vector3 => p !== undefined);
    } else if (start && b.block !== undefined) {
      ground = this.ground.arcBetween(b.block, to, 6).slice(1, -1);
    }
    const path = [start ?? b.pos.clone(), ...ground, target];
    b.trip = {
      path,
      seg: 0,
      t: 0,
      speed: 0,
      ...(b.block !== undefined && { from: b.block }),
      to,
      verb,
    };
  }

  private advance(b: Beacon, now: number): void {
    const trip = b.trip;
    if (!trip) return;
    const s = b.frame.scale;
    if (trip.speed === 0) {
      let len = 0;
      for (let i = 0; i < trip.path.length - 1; i++)
        len += (trip.path[i] ?? b.pos).distanceTo(trip.path[i + 1] ?? b.pos);
      const cells = len / s;
      trip.speed = Math.max(0.01 * s, len / Math.min(800, 220 + cells * 12));
    }
    let left = trip.speed * 16;
    while (left > 0 && trip.seg < trip.path.length - 1) {
      const p = trip.path[trip.seg];
      const q = trip.path[trip.seg + 1];
      if (!p || !q) break;
      const len = p.distanceTo(q);
      const remain = (1 - trip.t) * len;
      const from = b.pos.clone();
      if (left >= remain) {
        b.pos.copy(q);
        trip.seg++;
        trip.t = 0;
        left -= remain;
      } else {
        b.pos.lerpVectors(p, q, trip.t + left / len);
        trip.t += left / len;
        left = 0;
      }
      if (trip.seg > 0 && trip.seg < trip.path.length - 1)
        this.ribbons.lay({ a: from, b: b.pos.clone(), at: now, color: b.color, agentId: b.id });
    }
    if (trip.seg >= trip.path.length - 1) {
      b.block = trip.to;
      b.landedAt = now;
      delete b.trip;
      const top = this.ground.top(b.block);
      const frame = this.ground.frameOf(b.block);
      if (frame) b.frame = frame;
      if (top && trip.verb) this.strike(b, top, trip.verb, now);
    }
  }

  private strike(b: Beacon, top: THREE.Vector3, verb: 'reading' | 'editing', now: number): void {
    const s = b.frame.scale;
    const at = top.clone().addScaledVector(b.frame.up, 0.03 * s);
    this.effects.add({
      kind: 'wave',
      at,
      frame: b.frame,
      color: b.color,
      born: now,
      life: verb === 'editing' ? 600 : 500,
      second: verb === 'editing',
      radius: 1,
      mult: verb === 'editing' ? 5 : 3,
    });
    if (verb === 'editing') {
      this.effects.add({
        kind: 'beam',
        at,
        frame: b.frame,
        color: b.color,
        born: now + 60,
        life: 600,
      });
      this.effects.add({
        kind: 'sparks',
        at: top.clone(),
        frame: b.frame,
        color: b.color,
        born: now,
        life: 550,
        count: 9,
      });
    }
  }

  private turn(o: THREE.Object3D, b: Beacon): void {
    if (b.frame.quaternion) o.quaternion.copy(b.frame.quaternion);
    else o.quaternion.setFromUnitVectors(UP, b.frame.up);
  }

  private stand(o: THREE.Object3D, b: Beacon, along: number): void {
    o.position.copy(b.pos).addScaledVector(b.frame.up, along);
    this.turn(o, b);
  }

  private beamInOut(b: Beacon, now: number, dimA: number): void {
    const s = b.frame.scale;
    const arriving = b.phase === 'arriving';
    const k = Math.min(1, (now - b.phaseAt) / (arriving ? ARRIVAL_MS : DEPARTURE_MS));
    const e = arriving ? 1 - Math.pow(1 - k, 3) : k * k * k;
    const rest = (REST + RISE) * s;
    const sky = SKY * s;
    const head = arriving ? sky - (sky - rest) * e : rest + (sky - rest) * e;
    const tail = arriving
      ? sky - (sky - rest) * Math.min(1, e * 1.15)
      : rest + (sky - rest) * Math.max(0, e * 1.3 - 0.3);
    this.stand(b.core, b, head);
    b.core.scale.setScalar((arriving ? 0.001 + 0.09 * e : 0.09 * (1 - e * 0.6)) * s);
    b.halo.position.copy(b.core.position);
    b.halo.scale.setScalar(
      arriving ? HALO * Math.max(0, e * 3 - 2) : HALO * (1 - Math.min(1, e * 3)),
    );
    b.halo.material.opacity = dimA;
    b.stem.visible = true;
    this.stand(b.stem, b, (head + tail) / 2);
    b.stem.scale.set(s, Math.max(0.01, Math.abs(head - tail)), s);
    b.light.position.copy(b.core.position);
    b.light.intensity = 8 * s * s * dimA * (arriving ? e : 1 - e);
    b.light.distance = 8 * s;
    for (const o of [b.spot, b.band, b.ghost, b.arc, b.ring, b.work]) o.visible = false;
    b.core.visible = b.core.scale.x > 0.002 * s;
    if (k >= 1) {
      if (arriving) {
        b.phase = 'live';
        b.landedAt = now - 500;
      } else {
        this.dispose(b);
      }
    }
  }

  private look(b: Beacon, row: Agent | undefined, now: number, dimA: number): void {
    const s = b.frame.scale;
    const since = now - b.landedAt;
    const flash = Math.exp(-since / 150);
    const k = Math.min(1, since / 500);
    const ease = backOut(k);
    const verb = row?.verb ?? 'idle';
    const waiting = verb === 'waiting' || verb === 'idle' || verb === 'blocked';
    const breathe = 1 + 0.08 * Math.sin(now / (waiting ? 700 : 400) + b.hue);
    if (b.trip) {
      this.stand(b.core, b, 0.02 * s);
      b.core.scale.setScalar(CORE * s);
      b.halo.material.opacity = 0;
      for (const o of [b.stem, b.spot, b.band, b.ghost, b.arc, b.ring, b.work]) o.visible = false;
      b.light.position.copy(b.pos).addScaledVector(b.frame.up, 0.6 * s);
      b.light.intensity = 7 * s * s * dimA;
      b.light.distance = 5 * s;
      b.core.visible = true;
      return;
    }
    const onBlock = b.block !== undefined && this.ground.has(b.block);
    b.lift += ((verb === 'running' || !onBlock ? 0.4 : 0) - b.lift) * 0.1;
    const y = (REST + RISE * ease * (1 + b.lift)) * s;
    this.stand(b.core, b, y);
    b.core.scale.setScalar((CORE + 0.03 * k) * (1 + 1.6 * flash) * s);
    b.core.visible = true;
    b.halo.position.copy(b.core.position);
    b.halo.scale.setScalar(HALO * k * breathe * (1 + 0.4 * flash) * dimA);
    b.halo.material.opacity = dimA * (waiting ? 0.5 : 1);
    b.stem.visible = true;
    this.stand(b.stem, b, y / 2);
    b.stem.scale.set(s, Math.max(0.01, y), s);
    b.spot.visible = onBlock;
    this.stand(b.spot, b, -0.02 * s);
    b.spot.scale.setScalar((0.9 + 0.1 * breathe + 0.6 * flash) * s);
    b.spot.material.opacity = (0.3 + 0.5 * flash) * dimA;

    const scanning = verb === 'reading' && onBlock && since > 400;
    b.band.visible = b.ghost.visible = scanning;
    if (scanning) {
      const foot = b.block !== undefined ? this.ground.foot(b.block) : undefined;
      const h = foot ? Math.max(0.3 * s, b.pos.distanceTo(foot) - 0.07 * s) : 0.3 * s;
      const kk = (now / 800) % 1;
      const e = kk < 0.5 ? 4 * kk * kk * kk : 1 - Math.pow(-2 * kk + 2, 3) / 2;
      const env = Math.pow(Math.sin(e * Math.PI), 0.7);
      const floor = foot ?? b.pos.clone().addScaledVector(b.frame.up, -h);
      b.band.position.copy(floor).addScaledVector(b.frame.up, h * e);
      this.turn(b.band, b);
      b.band.scale.setScalar(s);
      b.band.material.opacity = 0.9 * env * dimA;
      b.ghost.position.copy(floor);
      this.turn(b.ghost, b);
      b.ghost.scale.set(s, Math.max(0.01, h * e), s);
      b.ghost.material.opacity = 0.16 * (1 - e) * env * dimA;
    }

    const working = verb === 'editing' && onBlock && since > 600;
    b.work.visible = working;
    if (working) {
      const top = b.pos;
      b.nextShock ??= now + 300;
      if (now >= b.nextShock) {
        this.effects.add({
          kind: 'wave',
          at: top.clone().addScaledVector(b.frame.up, 0.075 * s),
          frame: b.frame,
          color: b.color,
          born: now,
          life: 700,
          second: false,
          radius: 0.62,
          mult: 1.6,
        });
        b.nextShock = now + 1200 + Math.random() * 600;
      }
      b.nextSpark ??= now + 800;
      if (now >= b.nextSpark) {
        this.effects.add({
          kind: 'sparks',
          at: top.clone(),
          frame: b.frame,
          color: b.color,
          born: now,
          life: 550,
          count: 2 + Math.floor(Math.random() * 2),
        });
        b.nextSpark = now + 1400 + Math.random() * 1200;
      }
      const t = now / 1000;
      b.flicker = 0.15 * Math.sin(t * 37) + 0.1 * Math.sin(t * 23.7) + 0.08 * Math.sin(t * 61.3);
      this.stand(b.work, b, 0.03 * s);
      b.work.scale.set(s, 4 * s, s);
      b.workOpacity.value = (1 + b.flicker * 2) * dimA;
    } else {
      b.flicker = 0;
      delete b.nextShock;
      delete b.nextSpark;
    }

    b.arc.visible = verb === 'running';
    b.arc.position.copy(b.core.position);
    b.arc.material.rotation = -(now / 1500) * Math.PI * 2;
    b.arc.material.opacity = dimA;
    b.ring.visible = verb === 'blocked';
    b.ring.position.copy(b.core.position);
    b.ring.material.opacity = dimA;
    b.light.position.copy(b.core.position);
    b.light.intensity = 8 * s * s * dimA * (1 + 2.5 * flash);
    b.light.distance = 8 * s;
  }
}

export { PLATFORM_LIFT };
