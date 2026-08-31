import * as THREE from 'three';
import type { Surface } from './surface.js';

const material = new THREE.MeshBasicMaterial({
  color: 0x000000,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

export function shadeMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The dark a plate lays on what it stands on: a frame of cells around its footprint, opaque at
 * the plate's edge and clear `spread` cells out, on the bent ground.
 */
export function shadeGeometry(
  surface: Surface,
  country: string,
  x0: number,
  z0: number,
  w: number,
  h: number,
  y: number,
  spread: number,
  alpha: number,
): THREE.BufferGeometry {
  const xs = [x0 - spread, x0, x0 + w, x0 + w + spread];
  const zs = [z0 - spread, z0, z0 + h, z0 + h + spread];
  const positions: number[] = [];
  const colors: number[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const p = surface.local(country, xs[i] ?? 0, zs[j] ?? 0, y);
      positions.push(p.x, p.y, p.z);
      const rim = i === 0 || i === 3 || j === 0 || j === 3;
      colors.push(1, 1, 1, rim ? 0 : alpha);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const a = j * 4 + i;
      indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  return geometry;
}
