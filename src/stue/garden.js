// The back garden seen through the glazing: a larch deck, a lawn, clipped beech
// hedges, white-stemmed birches and a distant tree line. Everything outside is
// lit by the sun and by its own sky environment (exteriorEnv), so it reads as
// bright daylight beyond the room's exposure.
import * as THREE from 'three';
import { lawn, oakFloor, fbm, makeCanvas, toTexture, birchBark, rand, normalFromHeight } from './textures.js';
import { taperedTube, mesh } from './furniture.js';

// A canvas of many small leaves on a transparent ground: one card = one twig's worth
function clusterSprite({ colours, size = 256, leaves = 70, seed = 1, leafScale = 1 }) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const r = rand(seed);
  for (let i = 0; i < leaves; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * size * 0.4;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const L = size * (0.07 + r() * 0.05) * leafScale;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.fillStyle = colours[Math.floor(r() * colours.length)];
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(L * 0.5, -L * 0.35, L, 0);
    g.quadraticCurveTo(L * 0.5, L * 0.35, 0, 0);
    g.fill();
    g.restore();
  }
  const t = toTexture(c, { repeat: false });
  t.generateMipmaps = false; // see leafSprite: keep alpha-tested edges solid
  t.minFilter = THREE.LinearFilter;
  return t;
}

// A crown of leaf-cluster cards around a set of points. Card normals are bent
// outwards from the crown's centre, so the crown shades like a soft volume.
function crown(material, centres, { cards, radius, cardSize, seed, centre }) {
  const r = rand(seed);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < cards; i++) {
    const c = centres[i % centres.length];
    // a point in an ellipsoid around this cluster
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const rr = Math.cbrt(r()) * radius;
    const s = Math.sqrt(1 - u * u);
    p.set(c.x + Math.cos(phi) * s * rr, c.y + u * rr * 0.75, c.z + Math.sin(phi) * s * rr);
    n.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    ax.set(0, 1, 0).cross(n);
    if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
    ax.normalize();
    ay.crossVectors(n, ax).normalize();
    out.subVectors(p, centre).normalize();
    const shade = out.clone().multiplyScalar(0.8).addScaledVector(n, 0.2).normalize();
    const k = cardSize * (0.75 + r() * 0.5);
    const base = pos.length / 3;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      pos.push(p.x + (ax.x * sx + ay.x * sy) * k * 0.5, p.y + (ax.y * sx + ay.y * sy) * k * 0.5, p.z + (ax.z * sx + ay.z * sy) * k * 0.5);
      nor.push(shade.x, shade.y, shade.z);
      uv.push((sx + 1) / 2, (sy + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return mesh(geo, material);
}

function birch(mats, x, z, height, seed, quality) {
  const g = new THREE.Group();
  const r = rand(seed);
  const pts = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    pts.push(new THREE.Vector3((r() - 0.5) * 0.25 * t, t * height, (r() - 0.5) * 0.25 * t));
  }
  const trunk = new THREE.CatmullRomCurve3(pts);
  g.add(mesh(taperedTube(trunk, 0.13, 0.03, 30, 10), mats.birchBark));
  const centres = [];
  const crownCentre = new THREE.Vector3(0, height * 0.68, 0);
  for (let k = 0; k < 10; k++) {
    const t = 0.4 + (k / 10) * 0.55;
    const base = trunk.getPointAt(t);
    const a = k * 2.39 + r();
    const len = (1 - t) * height * 0.45 + 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0.35 + r() * 0.4, Math.sin(a)).normalize();
    const tip = base.clone().addScaledVector(dir, len);
    tip.y -= len * 0.2; // birches droop
    const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, len * 0.15, 0));
    const c = new THREE.CatmullRomCurve3([base, mid, tip]);
    g.add(mesh(taperedTube(c, 0.035 * (1 - t) + 0.01, 0.006, 8, 5), mats.bark));
    centres.push(c.getPointAt(0.6), tip);
  }
  g.add(crown(mats.birchLeaves, centres, { cards: Math.round(420 * quality), radius: 0.9, cardSize: 0.75, seed: seed + 3, centre: crownCentre }));
  g.position.set(x, -0.12, z);
  return g;
}

// A big rounded broadleaf (beech) behind the hedge
function bigTree(mats, x, z, height, seed, quality) {
  const g = new THREE.Group();
  const r = rand(seed);
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, height * 0.3, 0), new THREE.Vector3(-0.1, height * 0.55, 0.1)]);
  g.add(mesh(taperedTube(trunk, 0.35, 0.15, 12, 10), mats.bark));
  const centre = new THREE.Vector3(0, height * 0.62, 0);
  const centres = [];
  for (let k = 0; k < 14; k++) {
    const a = r() * Math.PI * 2;
    const u = r() * 0.9 - 0.2;
    const rr = height * 0.28 * (0.6 + r() * 0.5);
    centres.push(new THREE.Vector3(Math.cos(a) * rr, centre.y + u * height * 0.25, Math.sin(a) * rr));
  }
  g.add(crown(mats.beechLeaves, centres, { cards: Math.round(700 * quality), radius: height * 0.16, cardSize: 1.4, seed: seed + 5, centre }));
  g.position.set(x, -0.12, z);
  return g;
}

// A clipped hedge: a box whose surface is pushed in and out by noise
function hedge(mats, { x0, x1, z0, z1, height, seed }) {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const geo = new THREE.BoxGeometry(w, height, d, Math.max(2, Math.round(w * 4)), Math.round(height * 4), Math.max(2, Math.round(d * 4)));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm((v.x + v.z) * 0.05 + 0.5, v.y * 0.08 + 0.5, 4, 3, seed) - 0.5;
    const k = 1 + n * 0.12;
    v.x *= k;
    v.z *= k;
    if (v.y > 0) v.y += n * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // planar UVs in metres along the long side
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    uv.setXY(i, (v.x + v.z) / 2.5, v.y / 2.5);
  }
  const m = mesh(geo, mats.hedge);
  m.position.set((x0 + x1) / 2, height / 2 - 0.12, (z0 + z1) / 2);
  return m;
}

function hedgeTextures() {
  const S = 256;
  const height = new Float32Array(S * S);
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const leaves = fbm(u, v, 24, 3, 41);
      const big = fbm(u, v, 4, 3, 42);
      const h = leaves * 0.7 + big * 0.3;
      height[y * S + x] = h;
      const k = Math.min(1, Math.max(0, h * 1.3 - 0.25));
      const i = (y * S + x) * 4;
      img.data[i] = 34 + k * 46;
      img.data[i + 1] = 52 + k * 60;
      img.data[i + 2] = 24 + k * 22;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { map: toTexture(c), normal: toTexture(normalFromHeight(height, S, 6), { srgb: false }) };
}

// The far tree line: a painted band of crowns on a wide arc
function treeLineTexture(seed = 61) {
  const W = 2048;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rand(seed);
  const greens = ['#3d5530', '#4a6338', '#556d3e', '#2f4626', '#61773f'];
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 90; i++) {
      const x = r() * W;
      const top = H * (0.15 + r() * 0.35 + layer * 0.08);
      const rad = 18 + r() * 40;
      g.fillStyle = greens[Math.floor(r() * greens.length)];
      for (let k = 0; k < 9; k++) {
        g.beginPath();
        g.arc(x + (r() - 0.5) * rad * 1.6, top + rad * 0.5 + r() * rad, rad * (0.5 + r() * 0.6), 0, Math.PI * 2);
        g.fill();
      }
      g.fillRect(x - rad * 0.9, top + rad, rad * 1.8, H);
    }
  }
  // wrap the edges so the band tiles
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function createGarden({ quality = 1, aniso = 8 } = {}) {
  const group = new THREE.Group();
  group.name = 'garden';

  const grassTex = toTexture(lawn(512), { aniso });
  grassTex.repeat.set(18, 18);
  const deck = oakFloor(512, { tone: [128, 110, 92], seed: 9 });
  const deckMap = toTexture(deck.map, { aniso });
  const deckNormal = toTexture(deck.normal, { srgb: false, aniso });
  deckMap.repeat.set(1 / 2.4, 1 / 2.4);
  deckNormal.repeat.copy(deckMap.repeat);
  const ht = hedgeTextures();
  const barkTex = toTexture(birchBark(256));
  barkTex.repeat.set(1, 3);

  const mats = {
    lawn: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 }),
    deck: new THREE.MeshStandardMaterial({ map: deckMap, normalMap: deckNormal, roughness: 0.8, color: '#bfb3a6' }),
    hedge: new THREE.MeshStandardMaterial({ map: ht.map, normalMap: ht.normal, roughness: 0.9 }),
    birchBark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.8 }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.9 }),
    birchLeaves: new THREE.MeshStandardMaterial({
      map: clusterSprite({ colours: ['#5d8a33', '#6f9a3c', '#4f7a2b', '#86a94a'], seed: 3 }),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.8,
    }),
    beechLeaves: new THREE.MeshStandardMaterial({
      map: clusterSprite({ colours: ['#3f5f2a', '#4d6e31', '#5c7d38', '#36532a'], seed: 7, leaves: 110, leafScale: 0.8 }),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.85,
    }),
    treeLine: new THREE.MeshStandardMaterial({ map: treeLineTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({
      map: clusterSprite({ colours: ['#8a9a5a', '#a2a868', '#6f8448', '#b8b178'], seed: 13, leaves: 90, leafScale: 1.6 }),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  };

  // lawn (a little below the deck) and the deck right outside the glazing
  const lawnMesh = mesh(new THREE.PlaneGeometry(140, 140), mats.lawn, { cast: false });
  lawnMesh.rotation.x = -Math.PI / 2;
  lawnMesh.position.set(-70, -0.14, 0);
  group.add(lawnMesh);
  const deckGeo = new THREE.BoxGeometry(3.6, 0.12, 22);
  {
    const p = deckGeo.attributes.position;
    const uv = deckGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i), p.getX(i) + p.getY(i));
  }
  const deckMesh = mesh(deckGeo, mats.deck);
  deckMesh.position.set(-3.25 - 1.8, -0.08, 0);
  group.add(deckMesh);

  // hedges: across the bottom of the garden and down one side
  group.add(hedge(mats, { x0: -19.5, x1: -18.5, z0: -24, z1: 24, height: 1.9, seed: 3 }));
  group.add(hedge(mats, { x0: -18.5, x1: -6.8, z0: -14.4, z1: -13.6, height: 1.7, seed: 5 }));
  group.add(hedge(mats, { x0: -18.5, x1: -9, z0: 13.6, z1: 14.4, height: 1.7, seed: 7 }));

  // trees
  group.add(birch(mats, -9.5, -6.5, 8.5, 11, quality));
  group.add(birch(mats, -11.5, -3.6, 7.2, 12, quality));
  group.add(birch(mats, -8.6, 5.8, 9, 13, quality));
  group.add(bigTree(mats, -27, -9, 15, 21, quality));
  group.add(bigTree(mats, -30, 8, 17, 22, quality));
  group.add(bigTree(mats, -24, 22, 13, 23, quality));

  // ornamental grasses along the deck's edge
  const tufts = [];
  for (let i = 0; i < 9; i++) tufts.push(new THREE.Vector3(-7.15, 0.25, -6 + i * 1.5 + Math.sin(i) * 0.3));
  group.add(crown(mats.grass, tufts, { cards: Math.round(160 * quality), radius: 0.35, cardSize: 0.5, seed: 17, centre: new THREE.Vector3(-7.15, -0.5, 0) }));

  // far tree line on an arc beyond the hedge
  const line = mesh(new THREE.CylinderGeometry(70, 70, 16, 64, 1, true, Math.PI * 0.95, Math.PI * 1.1), mats.treeLine, { cast: false });
  line.position.set(0, 6.5, 0);
  mats.treeLine.map.repeat.set(4, 1);
  group.add(line);

  // Exterior materials get their own sky light (set by the room per time of day)
  const all = Object.values(mats);
  return {
    group,
    setEnvironment(env, intensity) {
      all.forEach((m) => {
        m.envMap = env;
        m.envMapIntensity = intensity;
        m.needsUpdate = m.needsUpdate || false;
      });
    },
  };
}
