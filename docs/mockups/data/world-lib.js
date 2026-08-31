/**
 * Shared by the world boards: one ground for every mounted repo, laid on a lattice and bent
 * over a single sphere of a very large radius. Units are cells throughout. A continent is a
 * repo, a city a project, a district a folder, a block a tower, and the only projection in
 * play maps a flat cell to a point on one global sphere whose tangent point is the world
 * centre. Nothing here knows about planets, bearings or depth.
 */
import * as THREE from 'three';

export const hsl = (h, s, l) => new THREE.Color().setHSL(h / 360, s, l);
export const UP = new THREE.Vector3(0, 1, 0);
export const FAMILY = {
  apps: { h: 28, s: 0.5 },
  libs: { h: 212, s: 0.4 },
  docs: { h: 95, s: 0.34 },
  plumbing: { h: 220, s: 0.07 },
};
export const FAMS = ['apps', 'libs', 'docs', 'plumbing'];

/** The three steps of distance as hierarchy: streets, avenues, then water. */
export const DISTRICT_GAP = 1;
export const COUNTRY_GAP = 3;
export const CONTINENT_GAP = 12;
/** No mounted repo is smaller ground than this, so a seven-file repo is still a place. */
export const MIN_PLATE = 32;
/** One global sphere. A constant in cells, never a function of what happens to be mounted. */
export const WORLD_RADIUS = 3500;

function shelfAt(items, width, gap) {
  let x = 0,
    z = 0,
    rowH = 0,
    w = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > width) {
      x = 0;
      z += rowH + gap;
      rowH = 0;
    }
    it.x = x;
    it.z = z;
    rowH = Math.max(rowH, it.h);
    x += it.w + gap;
    w = Math.max(w, it.x + it.w);
  }
  return { w, h: z + rowH };
}

/** A port of core's shelf: rows at the width whose result is closest to square. */
export function shelf(items, gap) {
  if (items.length === 0) return { w: 0, h: 0 };
  const area = items.reduce((s, it) => s + (it.w + gap) * (it.h + gap), 0);
  const minW = Math.max(...items.map((it) => it.w));
  let best;
  for (let f = 0.8; f <= 1.8 + 1e-9; f += 0.05) {
    const width = Math.max(minW, Math.ceil(Math.sqrt(area) * f));
    if (best?.width === width) continue;
    const e = shelfAt(items, width, gap);
    const aspect = Math.max(e.w / e.h, e.h / e.w);
    if (!best || aspect < best.aspect - 1e-9) best = { aspect, width };
  }
  return shelfAt(items, best.width, gap);
}

export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The world as a shelf of continents, largest first, each at least MIN_PLATE across. Cities
 * keep the positions core's layout already gave them inside their own repo, so a continent is
 * a translation of a layout and nothing more.
 */
export function buildWorld(regions, opts = {}) {
  const gap = opts.gap ?? CONTINENT_GAP;
  const min = opts.min ?? MIN_PLATE;
  const order =
    opts.order === 'hash'
      ? [...regions].sort((a, b) => hash32(a.n) - hash32(b.n))
      : [...regions].sort((a, b) => b.w * b.h - a.w * a.h);
  const items = order.map((r) => ({ x: 0, z: 0, w: Math.max(min, r.w), h: Math.max(min, r.h) }));
  const extent = shelf(items, gap);
  const continents = order.map((r, i) => ({
    name: r.n,
    files: r.files,
    x: items[i].x,
    z: items[i].z,
    w: items[i].w,
    h: items[i].h,
    /** Cities are centred in their plate when the plate was widened to the minimum. */
    ox: items[i].x + (items[i].w - r.w) / 2,
    oz: items[i].z + (items[i].h - r.h) / 2,
    cities: r.cities,
  }));
  return { continents, extent, centre: { x: extent.w / 2, z: extent.h / 2 } };
}

/**
 * The world on a fixed lattice of slots addressed by name hash: what "a place derived from the
 * name alone" costs. Each continent claims a square of `pitch` cells snapped up to its own
 * span, at the slot its hash names, probing on the fixed spiral when the slot is taken.
 */
export function buildHashWorld(regions, opts = {}) {
  const pitch = opts.pitch ?? 64;
  const cols = opts.cols ?? 24;
  const taken = new Map();
  const order = [...regions].sort((a, b) => b.w * b.h - a.w * a.h);
  const placed = [];
  for (const r of order) {
    const span = Math.max(MIN_PLATE, r.w, r.h);
    const n = Math.ceil(span / pitch);
    const h = hash32(r.n);
    const start = { c: h % cols, k: Math.floor(h / cols) % cols };
    let at;
    for (let step = 0; step < cols * cols && !at; step++) {
      const c = (start.c + (step % cols)) % cols;
      const k = (start.k + Math.floor(step / cols)) % cols;
      let free = true;
      for (let i = 0; i < n && free; i++)
        for (let j = 0; j < n && free; j++) if (taken.has(`${c + i},${k + j}`)) free = false;
      if (free) at = { c, k, n };
    }
    if (!at) continue;
    for (let i = 0; i < at.n; i++)
      for (let j = 0; j < at.n; j++) taken.set(`${at.c + i},${at.k + j}`, r.n);
    const w = at.n * pitch;
    placed.push({
      name: r.n,
      files: r.files,
      x: at.c * pitch,
      z: at.k * pitch,
      w,
      h: w,
      ox: at.c * pitch + (w - r.w) / 2,
      oz: at.k * pitch + (w - r.h) / 2,
      cities: r.cities,
    });
  }
  let maxX = 0,
    maxZ = 0;
  for (const p of placed) {
    maxX = Math.max(maxX, p.x + p.w);
    maxZ = Math.max(maxZ, p.z + p.h);
  }
  const extent = { w: maxX, h: maxZ };
  return { continents: placed, extent, centre: { x: extent.w / 2, z: extent.h / 2 } };
}

/**
 * The one projection. A flat cell becomes a point on the global sphere, tangent at the world
 * centre: arc length from the centre is exact, and the tangential squeeze is sin(rho)/rho,
 * which at a world of 760 cells on a radius of 3500 is two parts in a thousand.
 */
export function bender(world, R) {
  const cx = world.centre.x;
  const cz = world.centre.z;
  if (!Number.isFinite(R)) {
    return {
      R: Infinity,
      at: (x, z, y = 0) => new THREE.Vector3(x - cx, y, z - cz),
      normal: () => UP.clone(),
      drop: () => 0,
    };
  }
  const at = (x, z, y = 0) => {
    const u = x - cx;
    const v = z - cz;
    const d = Math.hypot(u, v);
    if (d < 1e-9) return new THREE.Vector3(0, y, 0);
    const rho = d / R;
    const k = ((R + y) * Math.sin(rho)) / d;
    return new THREE.Vector3(u * k, (R + y) * Math.cos(rho) - R, v * k);
  };
  const normal = (x, z) => {
    const p = at(x, z, 0);
    return p
      .clone()
      .setY(p.y + R)
      .normalize();
  };
  return { R, at, normal, drop: (d) => R * (1 - Math.cos(d / R)) };
}

/** Stands y-up geometry on the ground with its x still along the lattice's x. */
export function orientation(bend, x, z) {
  const n = bend.normal(x, z);
  const ahead = bend.at(x + 0.5, z).sub(bend.at(x, z));
  const ex = ahead.sub(n.clone().multiplyScalar(ahead.dot(n)));
  if (ex.lengthSq() < 1e-12) return new THREE.Quaternion().setFromUnitVectors(UP, n);
  ex.normalize();
  const ez = new THREE.Vector3().crossVectors(ex, n).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, n, ez));
}

/** One quad per district: what the ground is at Overview, whatever else is drawn. */
export function bodyTier(world, bend) {
  let count = 0;
  for (const ct of world.continents) for (const c of ct.cities) count += c.d.length;
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.92 }),
    Math.max(1, count),
  );
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  const owners = [];
  let i = 0;
  for (const ct of world.continents) {
    for (const c of ct.cities) {
      for (const [dx, dz, dw, dh] of c.d) {
        const x = ct.ox + c.x + dx + dw / 2;
        const z = ct.oz + c.z + dz + dh / 2;
        s.set(Math.max(0.5, dw - 0.35), 1, Math.max(0.5, dh - 0.35));
        m.compose(bend.at(x, z, 0.12), orientation(bend, x, z), s);
        mesh.setMatrixAt(i, m);
        owners.push({ continent: ct.name, city: c.n, family: c.f });
        i++;
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData.owners = owners;
  return mesh;
}

/**
 * Recolours the body tier. `state(continentName, cityName)` gives `{ lit, hue, dormant }`;
 * a dormant continent keeps its hue and loses its contrast, it never leaves the ground.
 */
export function paintBody(mesh, state) {
  const c = new THREE.Color();
  const rest = new THREE.Color();
  const hot = new THREE.Color();
  const owners = mesh.userData.owners;
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    const f = FAMILY[o.family] ?? FAMILY.plumbing;
    const s = state(o.continent, o.city);
    rest.copy(s.dormant ? hsl(f.h, f.s * 0.4, 0.105) : hsl(f.h, f.s, 0.245 + (s.near ?? 0) * 0.05));
    if (s.lit > 0) {
      hot.copy(hsl(s.hue, 0.9, 0.34 + s.lit * 0.26));
      c.copy(rest).lerp(hot, Math.min(1, s.lit));
    } else c.copy(rest);
    mesh.setColorAt(i, c);
  }
  mesh.instanceColor.needsUpdate = true;
}

/** One box per block, for the continents that earned towers this frame. */
export function towerTier(world, bend, which, capacity) {
  const list = world.continents.filter((ct) => which(ct.name));
  const total =
    capacity ?? list.reduce((a, ct) => a + ct.cities.reduce((b, c) => b + c.t.length, 0), 0);
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.78, 1, 0.78),
    new THREE.MeshStandardMaterial({ flatShading: true }),
    Math.max(1, total),
  );
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  let i = 0;
  for (const ct of list) {
    for (const c of ct.cities) {
      const f = FAMILY[c.f] ?? FAMILY.plumbing;
      for (const [tx, tz, th] of c.t) {
        if (i >= total) break;
        const x = ct.ox + c.x + tx + 0.5;
        const z = ct.oz + c.z + tz + 0.5;
        m.compose(
          bend.at(x, z, 0.2 + th / 2),
          orientation(bend, x, z),
          new THREE.Vector3(1, th, 1),
        );
        mesh.setMatrixAt(i, m);
        col.copy(hsl(f.h, f.s, 0.24 + Math.min(1, th / 7) * 0.24));
        mesh.setColorAt(i, col);
        i++;
      }
    }
  }
  for (let k = i; k < total; k++) mesh.setMatrixAt(k, hide);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.drawn = i;
  return mesh;
}

/** The water, out to the horizon, bent over the same sphere. */
export function ocean(bend, reach, rings = 96, spokes = 96) {
  const pos = [];
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const d = (reach * j) / rings;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const p = bend.at(
        bend.R === Infinity ? Math.cos(a) * d : Math.cos(a) * d,
        Math.sin(a) * d,
        -0.35,
      );
      pos.push(p.x, p.y, p.z);
    }
  }
  const row = spokes + 1;
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < spokes; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: hsl(212, 0.34, 0.032),
      emissive: hsl(202, 0.7, 0.011),
      roughness: 0.85,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

/** A continent's outline on the water, so a repo reads as one land before anything lights. */
export function coastlines(world, bend, colour = 0x415777) {
  const pos = [];
  for (const ct of world.continents) {
    const steps = 10;
    const corners = [
      [ct.x, ct.z],
      [ct.x + ct.w, ct.z],
      [ct.x + ct.w, ct.z + ct.h],
      [ct.x, ct.z + ct.h],
    ];
    for (let k = 0; k < 4; k++) {
      const [x0, z0] = corners[k];
      const [x1, z1] = corners[(k + 1) % 4];
      for (let s = 0; s < steps; s++) {
        const a = bend.at(x0 + ((x1 - x0) * s) / steps, z0 + ((z1 - z0) * s) / steps, 0.05);
        const b = bend.at(
          x0 + ((x1 - x0) * (s + 1)) / steps,
          z0 + ((z1 - z0) * (s + 1)) / steps,
          0.05,
        );
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.8 }),
  );
  line.frustumCulled = false;
  return line;
}

export function makeStage(width, height, opts = {}) {
  const stage = document.createElement('div');
  stage.className = 'stage';
  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.antialias ?? true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.25;
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x06070b);
  sc.fog = new THREE.FogExp2(0x06070b, opts.fog ?? 0.00026);
  sc.add(new THREE.HemisphereLight(0x8ea0bc, 0x2a2420, opts.ambient ?? 0.5));
  const key = new THREE.DirectionalLight(0xffd6ac, opts.key ?? 2.7);
  key.position.set(-380, 340, 460);
  sc.add(key);
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.5, 12000);
  const tier = document.createElement('div');
  tier.className = 'tier';
  stage.appendChild(tier);
  const ring = document.createElement('div');
  ring.className = 'ring';
  stage.appendChild(ring);
  return { stage, renderer, sc, camera, H: height, W: width, key, tier, ring };
}

export const ELEVATION = (38 * Math.PI) / 180;
export const YAW = (15 * Math.PI) / 180;

/** The Overview eye direction: 38 degrees up, yawed 15 so the streets run off-axis. */
export function eyeDirection() {
  return new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(YAW),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(YAW),
  );
}

/** Frames a rect of cells from the Overview angle: width and foreshortened depth both fit. */
export function frameRect(camera, controls, bend, rect, margin = 1.2) {
  const centre = bend.at(rect.x + rect.w / 2, rect.z + rect.h / 2, 0);
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const byWidth = rect.w / (2 * tanHalf * camera.aspect);
  const byDepth = (rect.h * Math.sin(ELEVATION)) / (2 * tanHalf);
  const distance = Math.max(byWidth, byDepth, 6) * margin;
  camera.position.copy(centre).add(eyeDirection().multiplyScalar(distance));
  controls.target.copy(centre);
  camera.lookAt(centre);
  controls.update();
  return distance;
}

export const BOARD_CSS = `
  html, body { margin: 0; background: #0b0d12; color: #c9cfdb; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 { font-size: 14px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; margin: 18px 20px 6px; color: rgba(255,255,255,0.6); }
  p.lead { margin: 0 20px 14px; max-width: 980px; color: #8a94ab; }
  p.lead b { color: #dfe6f5; }
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 16px; padding: 0 20px 30px; }
  .card { background: #12151c; border: 1px solid #1c2130; border-radius: 4px; overflow: hidden; }
  .card h2 { font-size: 12px; font-weight: 600; margin: 0; padding: 8px 12px; display: flex; justify-content: space-between; border-bottom: 1px solid #1c2130; }
  .card h2 .rec { color: #b8e6a8; } .card h2 .cur { color: #7fb3ff; } .card h2 .no { color: #f2c14e; }
  canvas { display: block; width: 100%; }
  .notes { padding: 10px 12px 12px; color: #9aa5bd; } .notes b { color: #dfe6f5; }
  .stage { position: relative; }
  .tier { position: absolute; left: 10px; bottom: 10px; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6f7b94; }
  .ring { position: absolute; right: 10px; bottom: 10px; font-size: 10px; color: #6f7b94; text-align: right; }
  .ring b { color: #dfe6f5; }
  .hover { position: absolute; left: 10px; top: 10px; font-size: 11px; color: #cfe0ff; pointer-events: none; }
  table.data { margin: 0 20px 12px; border-collapse: collapse; font-size: 12px; }
  table.data th, table.data td { padding: 3px 12px 3px 0; text-align: left; color: #9aa5bd; }
  table.data th { color: #6f7b94; font-weight: 500; }
`;

export function card(board, title, badge, badgeClass, notesHtml) {
  const el = document.createElement('div');
  el.className = 'card';
  const h = document.createElement('h2');
  h.innerHTML = `<span>${title}</span><span class="${badgeClass}">${badge}</span>`;
  el.appendChild(h);
  board.appendChild(el);
  const notes = document.createElement('div');
  notes.className = 'notes';
  notes.innerHTML = notesHtml;
  return { el, notes };
}
