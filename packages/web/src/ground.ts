import * as THREE from 'three';
import {
  MAX_HEIGHT,
  admit,
  type BlockId,
  type Candidate,
  type CountryActivity,
  type Layout,
  type Memory,
  type Motion,
  type RepoId,
} from '@strata/core';
import { Body } from './body.js';
import type { Effects, Frame } from './effects.js';
import type { Lines } from './lines.js';
import type { Ribbons } from './ribbons.js';
import { Settling } from './settle.js';
import type { Stage } from './stage.js';
import { Surface } from './surface.js';
import { Terrain, type Presence, type Subject } from './terrain.js';
import { PLATFORM_LIFT } from './theme.js';

const ADMISSION_MS = 250;
const UP = new THREE.Vector3(0, 1, 0);

/** A patch of the world the camera can be asked to frame. */
export interface Region {
  repo: RepoId;
  centre: THREE.Vector3;
  radius: number;
  height: number;
}

/** The whole map: one surface, one terrain, one body tier, and the ground everything stands on. */
export class Ground {
  readonly surface: Surface;
  private readonly group = new THREE.Group();
  private readonly terrain: Terrain;
  private readonly body: Body;
  private readonly settling = new Settling();
  private layout: Layout | undefined;
  private admitted = new Set<string>();
  private towersByCountry = new Map<string, number>();
  private admittedAt = 0;

  constructor(
    private readonly stage: Stage,
    effects: Effects,
    ribbons: Ribbons,
    lines: Lines,
  ) {
    stage.scene.add(this.group);
    this.surface = new Surface(this.group);
    this.terrain = new Terrain(
      this.surface,
      stage.camera,
      () => stage.size(),
      effects,
      ribbons,
      this.settling,
    );
    this.body = new Body(this.surface, this.group, this.settling);
    lines.register(this.terrain.flights);
  }

  get repos(): RepoId[] {
    return this.layout?.continents.map((c) => c.repo) ?? [];
  }

  has(id: BlockId): boolean {
    return this.terrain.has(id);
  }

  top(id: BlockId): THREE.Vector3 | undefined {
    return this.terrain.top(id);
  }

  foot(id: BlockId): THREE.Vector3 | undefined {
    return this.terrain.foot(id);
  }

  frameOf(id: BlockId): Frame | undefined {
    return this.terrain.frameOf(id);
  }

  tallest(country: string, district: string): number {
    return this.terrain.tallest(country, district);
  }

  worldOf(country: string, x: number, z: number, y = 0): THREE.Vector3 | undefined {
    return this.surface.knows(country) ? this.surface.world(country, x, z, y) : undefined;
  }

  pick(ndc: THREE.Vector2, camera: THREE.Camera): BlockId | undefined {
    return this.terrain.pick(ndc, camera);
  }

  /** The frame over a continent's middle, for a beacon that stands on no block. */
  frameAbove(repo: RepoId): { at: THREE.Vector3; frame: Frame } | undefined {
    const land = this.surface.landOf(repo);
    if (!land) return undefined;
    const local = this.surface.atCell(land.x + land.w / 2, land.z + land.h / 2, 6);
    return { at: this.surface.toWorld(local), frame: { up: UP.clone(), scale: 1 } };
  }

  /** A path over the water between two blocks that share no streets. */
  arcBetween(from: BlockId, to: BlockId, lift: number): THREE.Vector3[] {
    const start = this.top(from);
    const end = this.top(to);
    if (!start || !end) return [];
    return this.surface
      .arc(this.surface.toLocal(start), this.surface.toLocal(end), lift, 32)
      .map((p) => this.surface.toWorld(p));
  }

  /** Every continent as a patch the camera can frame. */
  all(): Region[] {
    return (this.layout?.continents ?? []).map((ct) => ({
      repo: ct.repo,
      centre: this.surface.atCell(ct.land.x + ct.land.w / 2, ct.land.z + ct.land.h / 2, 0),
      radius: Math.hypot(ct.land.w, ct.land.h) / 2,
      height: MAX_HEIGHT + PLATFORM_LIFT,
    }));
  }

  /** The continents still warm from an agent inside the trace hour. */
  live(warmth: ReadonlyMap<RepoId, number>): Region[] {
    return this.all().filter((r) => (warmth.get(r.repo) ?? 0) > 0);
  }

  regionOf(repo: RepoId): Region | undefined {
    return this.all().find((r) => r.repo === repo);
  }

  apply(layout: Layout, motions: readonly Motion[], now: number, snap: boolean): void {
    this.layout = layout;
    this.surface.setLayout(layout);
    this.terrain.apply(layout, motions, now, snap);
    if (snap || motions.some((m) => m.kind === 'ground')) {
      this.body.apply(layout);
      this.towersByCountry = new Map();
      for (const p of layout.blocks.values()) {
        this.towersByCountry.set(p.country, (this.towersByCountry.get(p.country) ?? 0) + 1);
      }
    }
    this.admittedAt = 0;
  }

  /** The countries that draw towers this frame, on their pixels per cell under one budget. */
  admission(now: number): void {
    if (now - this.admittedAt < ADMISSION_MS || !this.layout) return;
    this.admittedAt = now;
    const candidates: Candidate<string>[] = [];
    for (const c of this.layout.countries) {
      const centre = this.surface.world(c.country, c.x + c.w / 2, c.z + c.h / 2);
      candidates.push({
        key: c.country,
        pxPerCell: this.stage.pixelsPerUnit(centre),
        towers: this.towersByCountry.get(c.country) ?? 0,
      });
    }
    this.admitted = admit(candidates, this.admitted);
    this.terrain.setAdmitted(this.admitted, now);
    this.body.setAdmitted(this.admitted);
  }

  paint(activity: ReadonlyMap<string, CountryActivity>, warmth: ReadonlyMap<RepoId, number>): void {
    this.body.paint(activity, warmth);
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
    this.settling.tick(now);
    if (this.settling.moving) this.body.settle();
    this.terrain.update(now, memory, presence, agentColor, dim, hover, subject);
  }

  get stats(): { repos: number; towers: number; plates: number; districts: number } {
    return {
      repos: this.repos.length,
      towers: this.terrain.towerCount,
      plates: this.terrain.plateCount,
      districts: this.body.count,
    };
  }

  get windowed(): { towers: number; half: number } {
    return this.terrain.windowed;
  }

  get flightCount(): number {
    return this.terrain.flights.count;
  }

  oldestFlight(now: number): number {
    return this.terrain.flights.oldest(now);
  }
}
