import * as THREE from 'three';

const HEADROOM = 256;

/**
 * An InstancedMesh with an index allocator; instances keep their index for their lifetime.
 * Carries a per-instance `cut` attribute and, when given a shell material, a second mesh
 * sharing matrices and colours that draws the windowed parts.
 */
export class Instances {
  mesh: THREE.InstancedMesh;
  shell: THREE.InstancedMesh | undefined;
  cut: THREE.InstancedBufferAttribute;
  private free: number[] = [];
  private next = 0;
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly scene: THREE.Scene,
    capacity: number,
    private readonly shellMaterial?: THREE.Material,
  ) {
    this.cut = new THREE.InstancedBufferAttribute(new Float32Array(capacity + HEADROOM), 1);
    this.cut.setUsage(THREE.DynamicDrawUsage);
    this.mesh = this.build(capacity + HEADROOM);
  }

  allocate(): number {
    const index = this.free.pop() ?? this.next++;
    if (index >= this.mesh.count) this.grow();
    return index;
  }

  release(index: number): void {
    this.mesh.setMatrixAt(index, this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.free.push(index);
  }

  private build(capacity: number): THREE.InstancedMesh {
    const geometry = this.geometry.clone();
    geometry.setAttribute('cut', this.cut);
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, this.hidden);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(mesh);
    if (this.shellMaterial) {
      const shell = new THREE.InstancedMesh(geometry, this.shellMaterial, capacity);
      shell.instanceMatrix = mesh.instanceMatrix;
      shell.instanceColor = mesh.instanceColor;
      shell.frustumCulled = false;
      shell.renderOrder = 8;
      this.scene.add(shell);
      this.shell = shell;
    }
    return mesh;
  }

  private grow(): void {
    const old = this.mesh;
    const oldShell = this.shell;
    const oldCut = this.cut;
    const capacity = old.count * 2;
    this.cut = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.cut.setUsage(THREE.DynamicDrawUsage);
    (this.cut.array as Float32Array).set(oldCut.array);
    const mesh = this.build(capacity);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < old.count; i++) {
      old.getMatrixAt(i, m);
      mesh.setMatrixAt(i, m);
      if (old.instanceColor) {
        old.getColorAt(i, c);
        mesh.setColorAt(i, c);
      }
    }
    if (this.shell && mesh.instanceColor) this.shell.instanceColor = mesh.instanceColor;
    old.removeFromParent();
    old.dispose();
    oldShell?.removeFromParent();
    this.mesh = mesh;
  }
}
