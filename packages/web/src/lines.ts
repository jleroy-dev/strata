import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';

export interface Segment {
  a: THREE.Vector3;
  b: THREE.Vector3;
  color: THREE.Color;
}

/** Something that has light to lay on the streets this frame. */
export interface SegmentSource {
  readonly width: number;
  segments(now: number): Iterable<Segment>;
}

interface Batch {
  mesh: LineSegments2;
  geometry: LineSegmentsGeometry;
  material: LineMaterial;
  capacity: number;
}

const INITIAL = 256;

/** Screen-space lines for every ribbon and trail; one batch per pixel width. */
export class Lines {
  private readonly sources: SegmentSource[] = [];
  private readonly batches = new Map<number, Batch>();
  private readonly scratch: Segment[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  register(source: SegmentSource): void {
    this.sources.push(source);
  }

  get count(): number {
    return this.scratch.length;
  }

  stats(): {
    width: number;
    instances: number;
    capacity: number;
    visible: boolean;
    resolution: [number, number];
    sample: number[];
  }[] {
    return [...this.batches].map(([width, b]) => {
      const start = b.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
      const arr = start.data.array as Float32Array;
      return {
        width,
        instances: b.geometry.instanceCount,
        capacity: b.capacity,
        visible: b.mesh.visible,
        resolution: [b.material.resolution.x, b.material.resolution.y],
        sample: Array.from(arr.slice(0, 6)).map((v) => Math.round(v * 100) / 100),
      };
    });
  }

  update(now: number, width: number, height: number): void {
    const byWidth = new Map<number, Segment[]>();
    this.scratch.length = 0;
    for (const source of this.sources) {
      let list = byWidth.get(source.width);
      if (!list) byWidth.set(source.width, (list = []));
      for (const s of source.segments(now)) {
        list.push(s);
        this.scratch.push(s);
      }
    }
    for (const [px, list] of byWidth) this.draw(px, list, width, height);
    for (const [px, batch] of this.batches) {
      if (!byWidth.has(px)) batch.geometry.instanceCount = 0;
    }
  }

  private draw(px: number, list: Segment[], width: number, height: number): void {
    let batch = this.batches.get(px);
    if (!batch || batch.capacity < list.length) {
      const capacity = Math.max(INITIAL, (batch?.capacity ?? 0) * 2, list.length);
      if (batch) {
        this.scene.remove(batch.mesh);
        batch.geometry.dispose();
      }
      batch = this.build(px, capacity, batch?.material);
      this.batches.set(px, batch);
    }
    batch.material.resolution.set(width, height);
    const start = batch.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
    const colorStart = batch.geometry.getAttribute(
      'instanceColorStart',
    ) as THREE.InterleavedBufferAttribute;
    const positions = start.data.array as Float32Array;
    const colors = colorStart.data.array as Float32Array;
    list.forEach((s, i) => {
      const o = i * 6;
      positions[o] = s.a.x;
      positions[o + 1] = s.a.y;
      positions[o + 2] = s.a.z;
      positions[o + 3] = s.b.x;
      positions[o + 4] = s.b.y;
      positions[o + 5] = s.b.z;
      colors[o] = s.color.r;
      colors[o + 1] = s.color.g;
      colors[o + 2] = s.color.b;
      colors[o + 3] = s.color.r;
      colors[o + 4] = s.color.g;
      colors[o + 5] = s.color.b;
    });
    start.data.needsUpdate = true;
    colorStart.data.needsUpdate = true;
    batch.geometry.instanceCount = list.length;
    batch.mesh.visible = list.length > 0;
  }

  private build(px: number, capacity: number, material?: LineMaterial): Batch {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(new Float32Array(capacity * 6));
    geometry.setColors(new Float32Array(capacity * 6));
    geometry.instanceCount = 0;
    const mat =
      material ??
      new LineMaterial({
        linewidth: px,
        worldUnits: false,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      });
    const mesh = new LineSegments2(geometry, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    return { mesh, geometry, material: mat, capacity };
  }
}
