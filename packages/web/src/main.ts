import * as THREE from 'three';
import type { StrataEvent } from '@strata/core';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d12);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(60, 70, 60);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1410, 1.2));

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x11141c }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let blocks: THREE.InstancedMesh | undefined;

/** A placeholder arrangement: one row per country, files along it. The real layout lives in core. */
function draw(event: StrataEvent): void {
  if (event.kind !== 'snapshot') return;
  blocks?.removeFromParent();
  const count = event.blocks.length;
  blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8fb3ff, flatShading: true }),
    count,
  );
  const countries = [...new Set(event.blocks.map((b) => b.country))];
  const cursor = new Map<string, number>();
  const m = new THREE.Matrix4();
  event.blocks.forEach((block, i) => {
    const row = countries.indexOf(block.country);
    const col = cursor.get(block.country) ?? 0;
    cursor.set(block.country, col + 1);
    const h = 0.5 + Math.log2(1 + block.size / 256);
    m.makeScale(0.8, h, 0.8);
    m.setPosition(col * 1.2 - 40, h / 2, row * 3 - countries.length * 1.5);
    blocks?.setMatrixAt(i, m);
  });
  blocks.instanceMatrix.needsUpdate = true;
  scene.add(blocks);
}

const socket = new WebSocket(`ws://${window.location.hostname}:4747`);
socket.addEventListener('message', (message: MessageEvent<string>) => {
  draw(JSON.parse(message.data) as StrataEvent);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
