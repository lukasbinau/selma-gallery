import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintings } from './paintings.js';
import { settings } from './store.js';
import { createPlaques, isOverlayOpen } from './ui.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const ROOM = { w: 13, d: 11, h: 4.2 }; // metres: width (x), depth (z), height (y)
const CORNER = 3.2; // wall length kept free beside each corner
const EYE = 1.72; // height of painting centres (m)
const ART_AREA = 0.95; // every artwork is normalised to this area (m²)
const FOV = 40;
// The camera frames a "block": the painting, plus its plaque when plaques are on.
// fitH/fitW: max share of screen height/width; centre: where the block's middle sits (0 = top)
const LAYOUT = {
  on: { fitH: 0.76, fitW: 0.82, centre: 0.51 },
  off: { fitH: 0.56, fitW: 0.72, centre: 0.5 },
};

// Plaques: a real slab on the wall, with the HTML text laid on its face in 3D
const PLAQUE_W = 1.05; // metres
const PLAQUE_PX = 315; // CSS width of the plaque's face
const PLAQUE_SCALE = PLAQUE_W / PLAQUE_PX;
const PLAQUE_GAP = 0.13; // between frame bottom and plaque top
const PLAQUE_DEPTH = 0.034; // a solid wooden block that stands off the wall

// The camera rides a rail through one viewpoint per painting. Springs act on
// the rail parameter u (1 = one painting along). The look spring is stiffer
// than the body spring: you turn your head first, then your feet follow.
const BODY = { k: 120, c: 2 * Math.sqrt(120) };
const LOOK = { k: 240, c: 2 * Math.sqrt(240) };
const LEAN = { k: 70, c: 2 * Math.sqrt(70) };
const INTRO_SOFTNESS = 0.2; // springs this much softer during the walk-in

// Colour scheme picked by Selma: ultramarine blue and lavender
const THEMES = {
  evening: {
    // a dusty, painterly ultramarine room lit by the picture spots
    bg: '#0a0f2e',
    wall: '#2d4299',
    ceiling: '#d9d3ea',
    floor: '#efe6d8',
    floorOpacity: 0.9,
    skirting: '#0d1034',
    plaqueGlow: 0.12,
    hemi: 0.22,
    spot: 40,
    exposure: 1.0,
    env: 0.04,
    beam: 0.055,
    dust: 0.28,
    fog: [9, 26],
  },
  daylight: {
    // a bright room with lavender-white walls, so the lavender plaques stand out
    bg: '#e3def0',
    wall: '#eeeaf6',
    ceiling: '#ffffff',
    floor: '#ffffff',
    floorOpacity: 0.86,
    skirting: '#cfc6e8',
    plaqueGlow: 0,
    hemi: 1.3,
    spot: 16,
    exposure: 0.95,
    env: 0.35,
    beam: 0.02,
    dust: 0.07,
    fog: [16, 44],
  },
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const reduced = () => settings.motion === 'reduced';

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // scene is static, render shadows once

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0x000000, 9, 26);

// Soft studio reflections on lacquer, glass and metal
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 60);

const hemi = new THREE.HemisphereLight('#f1edff', '#141845', 0.3);
scene.add(hemi);
const spots = [];

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t) => t * t * (3 - 2 * t);
const noise1 = (x) => {
  const i = Math.floor(x);
  return hash(i) + (hash(i + 1) - hash(i)) * smooth(x - i);
};
const noise2 = (x, y) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smooth(x - i);
  const v = smooth(y - j);
  const h = (a, b) => hash(a * 57 + b * 131);
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * u;
  const bot = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u;
  return top + (bot - top) * v;
};

function canvasTexture(c, { repeat = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Wood: long, slowly drifting growth lines, soft colour bands and fine pores.
// `grain` sets how strongly it shows (lower = painted over).
function woodTexture(light, dark, grain = 1) {
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const warp = noise2(x * 0.0032, y * 0.008) * 4.5 + noise1(x * 0.0014) * 3;
      const t = (y + warp) * 0.11;
      const ring = t - Math.floor(t);
      const line = Math.pow(1 - Math.min(ring, 1 - ring) * 2, 7);
      const band = noise1((y + warp) * 0.04) * 0.55 + noise2(x * 0.0018, y * 0.04) * 0.45;
      const pore = hash(Math.floor(x / 3) * 7.3 + y * 311.7) < 0.035 ? 0.35 : 0;
      let k = 0.5 + ((band - 0.5) * 0.55 - line * 0.35 - pore * 0.4) * grain + 0.1 * (1 - grain);
      k = clamp(k, 0, 1);
      const i = (y * W + x) * 4;
      d[i] = dark[0] + (light[0] - dark[0]) * k;
      d[i + 1] = dark[1] + (light[1] - dark[1]) * k;
      d[i + 2] = dark[2] + (light[2] - dark[2]) * k;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

// Value noise whose lattice wraps every px × py cells, so a tile repeats seamlessly
const periodic = (x, y, px, py) => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smooth(x - i);
  const v = smooth(y - j);
  const h = (a, b) => hash((((a % px) + px) % px) * 57 + (((b % py) + py) % py) * 131);
  const top = h(i, j) + (h(i + 1, j) - h(i, j)) * u;
  const bot = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u;
  return top + (bot - top) * v;
};

// Hand-painted wall: soft mottling and faint brush drag, like the blue grounds
// in the paintings Selma likes. Greyscale, so it tints with each theme's wall colour.
function wallTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const mottle = periodic(u * 4, v * 4, 4, 4) * 0.6 + periodic(u * 9, v * 9, 9, 9) * 0.4;
      const brush = periodic(u * 3, v * 70, 3, 70);
      const k = 0.89 + mottle * 0.09 + brush * 0.018;
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, k * 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: true });
}

// Pale oak floorboards: 0.2 m planks running along x, staggered end joints.
// One tile covers 3 m × 3 m.
function plankTexture() {
  const S = 768;
  const rows = 15;
  const ph = S / rows;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  const light = [228, 208, 172];
  const dark = [184, 156, 116];
  const seam = [96, 74, 52];
  const joints = [];
  for (let r = 0; r < rows; r++) {
    const js = [];
    let x = hash(r * 9.7) * S * 0.6;
    while (x < S) {
      js.push(x);
      x += S * (0.4 + hash(r * 3.3 + x) * 0.5);
    }
    joints.push(js);
  }
  for (let y = 0; y < S; y++) {
    const r = Math.floor(y / ph);
    const js = joints[r];
    const yy = y - r * ph;
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      let seg = 0;
      let nearJoint = false;
      for (const j of js) {
        if (x >= j) seg++;
        if (Math.abs(x - j) < 1.5) nearJoint = true;
      }
      if (yy < 2 || nearJoint) {
        d[i] = seam[0];
        d[i + 1] = seam[1];
        d[i + 2] = seam[2];
        d[i + 3] = 255;
        continue;
      }
      // The last board continues into the next tile's first board
      const board = seg === js.length ? 0 : seg;
      const tone = 0.35 + hash(r * 17.3 + board * 5.1) * 0.5;
      const grain = noise2(x * 0.02, y * 0.35) * 0.5 + noise2(x * 0.006 + board, y * 0.12) * 0.5;
      const k = clamp(tone * 0.6 + grain * 0.45 - 0.1, 0, 1);
      d[i] = dark[0] + (light[0] - dark[0]) * k;
      d[i + 1] = dark[1] + (light[1] - dark[1]) * k;
      d[i + 2] = dark[2] + (light[2] - dark[2]) * k;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, { repeat: true });
}

// Alpha ramp for the visible light beams: bright near the lamp, fading out
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.06, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const wood = woodTexture([222, 212, 246], [176, 160, 222], 0.55); // lavender-lacquered
const mats = {
  wall: new THREE.MeshStandardMaterial({ roughness: 0.95, map: wallTexture() }),
  ceiling: new THREE.MeshStandardMaterial({ roughness: 1 }),
  floor: new THREE.MeshStandardMaterial({ roughness: 0.38, transparent: true, map: plankTexture() }),
  black: new THREE.MeshStandardMaterial({ color: '#0f0e0d', roughness: 0.45 }),
  oak: new THREE.MeshStandardMaterial({ color: '#b48f62', roughness: 0.6 }),
  mat: new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.95 }),
  canvasEdge: new THREE.MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.9 }),
  shadowGap: new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 1 }),
  skirting: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  track: new THREE.MeshStandardMaterial({ color: '#15151c', roughness: 0.5, metalness: 0.3 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#fff3e0', emissive: '#ffd9a8', emissiveIntensity: 1.6 }),
  leather: new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 0.62 }),
  steel: new THREE.MeshStandardMaterial({ color: '#9a9aa6', roughness: 0.35, metalness: 0.85 }),
  doorway: new THREE.MeshStandardMaterial({ color: '#07091c', roughness: 1 }),
  plaque: new THREE.MeshPhysicalMaterial({
    map: wood,
    roughness: 0.5,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    emissive: '#ffffff',
    emissiveMap: wood, // a faint self-glow keeps the grain readable in the evening room
    emissiveIntensity: 0.1,
  }),
  beam: new THREE.MeshBasicMaterial({
    map: beamTexture(),
    color: '#ffe2bf',
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }),
};

const fx = { cones: [], dust: null, dustBase: null, dustSeed: null };

function applyTheme() {
  const t = THEMES[settings.theme] ?? THEMES.evening;
  document.documentElement.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]').content = t.bg;
  scene.background.set(t.bg);
  scene.fog.color.set(t.bg);
  scene.fog.near = t.fog[0];
  scene.fog.far = t.fog[1];
  scene.environmentIntensity = t.env;
  mats.wall.color.set(t.wall);
  mats.ceiling.color.set(t.ceiling);
  mats.floor.color.set(t.floor);
  mats.floor.opacity = t.floorOpacity;
  mats.skirting.color.set(t.skirting);
  mats.plaque.emissiveIntensity = t.plaqueGlow;
  mats.beam.opacity = t.beam;
  if (fx.dust) fx.dust.material.opacity = t.dust;
  hemi.intensity = t.hemi;
  spots.forEach((s) => (s.intensity = t.spot));
  renderer.toneMappingExposure = t.exposure;
  renderer.shadowMap.needsUpdate = true;
}

function applyFx() {
  const on = settings.fx !== 'off';
  document.documentElement.dataset.fx = on ? 'on' : 'off';
  fx.cones.forEach((c) => (c.visible = on));
  if (fx.dust) fx.dust.visible = on;
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Four moulding pieces around an inner opening of w × h.
function moulding(group, w, h, width, depth, material, z) {
  const ow = w + width * 2;
  group.add(box(ow, width, depth, material, 0, h / 2 + width / 2, z));
  group.add(box(ow, width, depth, material, 0, -h / 2 - width / 2, z));
  group.add(box(width, h, depth, material, -w / 2 - width / 2, 0, z));
  group.add(box(width, h, depth, material, w / 2 + width / 2, 0, z));
}

function artPlane(texture, w, h, z) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.z = z;
  mesh.receiveShadow = true;
  return mesh;
}

// Returns { group, width, height } — width/height are the outer frame size.
function buildFrame(texture, style) {
  const { width: iw, height: ih } = texture.image;
  const aspect = iw / ih;
  const h = Math.sqrt(ART_AREA / aspect);
  const w = h * aspect;
  const g = new THREE.Group();

  if (style === 'mat') {
    const m = 0.11 + 0.04 * Math.max(w, h); // passe-partout border
    const fw = 0.028; // frame width
    const mw = w + m * 2;
    const mh = h + m * 2;
    g.add(box(mw, mh, 0.02, mats.mat, 0, 0, 0.012));
    g.add(artPlane(texture, w, h, 0.0225));
    moulding(g, mw, mh, fw, 0.05, mats.black, 0.025);
    return { group: g, width: mw + fw * 2, height: mh + fw * 2 };
  }

  if (style === 'float') {
    const gap = 0.018;
    const fw = 0.016;
    g.add(box(w + gap * 2, h + gap * 2, 0.008, mats.shadowGap, 0, 0, 0.004));
    g.add(box(w, h, 0.035, mats.canvasEdge, 0, 0, 0.03));
    g.add(artPlane(texture, w, h, 0.0476));
    moulding(g, w + gap * 2, h + gap * 2, fw, 0.058, mats.oak, 0.029);
    return { group: g, width: w + (gap + fw) * 2, height: h + (gap + fw) * 2 };
  }

  // 'bare': the photo already shows the frame
  g.add(box(w, h, 0.04, mats.black, 0, 0, 0.02));
  g.add(artPlane(texture, w, h, 0.0405));
  return { group: g, width: w, height: h };
}

// ---------------------------------------------------------------------------
// The room: three hanging walls in a U, entrance on the fourth side
// ---------------------------------------------------------------------------
// `right` is the direction a viewer facing the wall calls "right": the order
// in which the paintings hang, and the way a swipe moves you.
const WALLS = {
  left: {
    normal: new THREE.Vector3(1, 0, 0),
    right: new THREE.Vector3(0, 0, -1),
    rotY: Math.PI / 2,
    length: ROOM.d,
    at: (s) => new THREE.Vector3(-ROOM.w / 2, EYE, -s),
  },
  back: {
    normal: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    rotY: 0,
    length: ROOM.w,
    at: (s) => new THREE.Vector3(s, EYE, -ROOM.d / 2),
  },
  right: {
    normal: new THREE.Vector3(-1, 0, 0),
    right: new THREE.Vector3(0, 0, 1),
    rotY: -Math.PI / 2,
    length: ROOM.d,
    at: (s) => new THREE.Vector3(ROOM.w / 2, EYE, s),
  },
};

// Spread n paintings over left / back / right, evenly along each wall
function planSlots(n) {
  const q = Math.floor(n / 3);
  const plan = [
    ['left', q],
    ['back', n - 2 * q],
    ['right', q],
  ];
  const slots = [];
  for (const [name, count] of plan) {
    const wall = WALLS[name];
    const usable = wall.length - CORNER * 2;
    const cell = usable / count;
    for (let i = 0; i < count; i++) slots.push({ wall, s: -usable / 2 + cell * (i + 0.5) });
  }
  return slots;
}

const ENTRANCE = {
  stand: new THREE.Vector3(0, 1.62, ROOM.d / 2 - 1.4),
  look: new THREE.Vector3(0, 1.5, -ROOM.d / 2),
};

const frames = []; // { group, width, height, slot, centre, plaqueH }
const hitTargets = [];

function wallMesh(w, h, material, uvScale = 2.5) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / uvScale, (uv.getY(i) * h) / uvScale);
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

function buildRoom() {
  const { w, d, h } = ROOM;

  const back = wallMesh(w, h, mats.wall);
  back.position.set(0, h / 2, -d / 2);
  const front = wallMesh(w, h, mats.wall);
  front.position.set(0, h / 2, d / 2);
  front.rotation.y = Math.PI;
  const left = wallMesh(d, h, mats.wall);
  left.position.set(-w / 2, h / 2, 0);
  left.rotation.y = Math.PI / 2;
  const right = wallMesh(d, h, mats.wall);
  right.position.set(w / 2, h / 2, 0);
  right.rotation.y = -Math.PI / 2;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.ceiling);
  ceiling.position.set(0, h, 0);
  ceiling.rotation.x = Math.PI / 2;
  scene.add(back, front, left, right, ceiling);

  // Mirror underneath + a mostly-opaque oak floor on top = a soft polished floor
  const mirrorSize = () => [innerWidth * renderer.getPixelRatio() * 0.5, innerHeight * renderer.getPixelRatio() * 0.5];
  const [tw, th] = mirrorSize();
  const mirror = new Reflector(new THREE.PlaneGeometry(w, d), {
    textureWidth: tw,
    textureHeight: th,
    color: 0x9a9590,
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  addEventListener('resize', () => mirror.getRenderTarget().setSize(...mirrorSize()));

  const floor = wallMesh(w, d, mats.floor, 3);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  scene.add(floor);

  // Skirting boards
  const sk = (bw, bd, x, z) => {
    const m = box(bw, 0.08, bd, mats.skirting, x, 0.04, z);
    m.castShadow = false;
    scene.add(m);
  };
  sk(w, 0.015, 0, -d / 2 + 0.0075);
  sk(w, 0.015, 0, d / 2 - 0.0075);
  sk(0.015, d, -w / 2 + 0.0075, 0);
  sk(0.015, d, w / 2 - 0.0075, 0);

  // Lighting track along each hanging wall
  const ty = h - 0.025;
  scene.add(box(0.05, 0.04, d - CORNER, mats.track, -w / 2 + 2, ty, 0));
  scene.add(box(0.05, 0.04, d - CORNER, mats.track, w / 2 - 2, ty, 0));
  scene.add(box(w - CORNER, 0.04, 0.05, mats.track, 0, ty, -d / 2 + 2));

  // The doorway you came in through
  scene.add(box(1.7, 2.3, 0.06, mats.doorway, 0, 1.15, d / 2 - 0.02));

  // A bench in the middle of the room
  const bench = new THREE.Group();
  bench.add(box(1.7, 0.08, 0.45, mats.leather, 0, 0.44, 0));
  bench.add(box(0.04, 0.4, 0.42, mats.steel, -0.7, 0.2, 0));
  bench.add(box(0.04, 0.4, 0.42, mats.steel, 0.7, 0.2, 0));
  bench.position.set(0, 0, 0.6);
  scene.add(bench);

  buildDust();
}

// A visible lamp on the track, plus a soft beam of light in the dusty air
const canGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.18, 20).rotateX(Math.PI / 2);
const lampGeo = new THREE.CircleGeometry(0.04, 20);
function addFixture(at, aim) {
  const can = new THREE.Mesh(canGeo, mats.track);
  can.position.copy(at);
  can.lookAt(aim);
  can.castShadow = true;
  const lamp = new THREE.Mesh(lampGeo, mats.lamp);
  lamp.position.z = 0.091;
  can.add(lamp);
  scene.add(can);

  const length = at.distanceTo(aim) + 0.3;
  const geo = new THREE.ConeGeometry(length * Math.tan(0.24), length, 28, 1, true);
  geo.translate(0, -length / 2, 0); // apex at the lamp…
  geo.rotateX(-Math.PI / 2); // …opening along +z, so lookAt() aims it
  const beam = new THREE.Mesh(geo, mats.beam);
  beam.position.copy(at);
  beam.lookAt(aim);
  beam.renderOrder = 2;
  scene.add(beam);
  fx.cones.push(beam);
}

// Motes drifting in the light
const DUST = 320;
function buildDust() {
  const { w, d, h } = ROOM;
  const pos = new Float32Array(DUST * 3);
  fx.dustBase = new Float32Array(DUST * 3);
  fx.dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    fx.dustBase[i * 3] = (Math.random() - 0.5) * (w - 1);
    fx.dustBase[i * 3 + 1] = 0.3 + Math.random() * (h - 0.6);
    fx.dustBase[i * 3 + 2] = (Math.random() - 0.5) * (d - 1);
    fx.dustSeed[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.03,
    color: '#ffe9d2',
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  fx.dust = new THREE.Points(geo, mat);
  fx.dust.renderOrder = 3;
  scene.add(fx.dust);
}

function updateDust(t) {
  if (!fx.dust?.visible) return;
  const attr = fx.dust.geometry.attributes.position;
  const p = attr.array;
  const span = ROOM.h - 0.4;
  for (let i = 0; i < DUST; i++) {
    const s = fx.dustSeed[i];
    const j = i * 3;
    p[j] = fx.dustBase[j] + Math.sin(t * 0.21 + s) * 0.3 + Math.sin(t * 0.07 + s * 2.1) * 0.5;
    const fall = (fx.dustBase[j + 1] - t * 0.035 - s * 0.5) % span;
    p[j + 1] = 0.2 + (fall < 0 ? fall + span : fall) + Math.sin(t * 0.4 + s) * 0.05;
    p[j + 2] = fx.dustBase[j + 2] + Math.sin(t * 0.19 + s * 0.7) * 0.3;
  }
  attr.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Gallery build
// ---------------------------------------------------------------------------
const ui = {
  prev: document.querySelector('.nav--prev'),
  next: document.querySelector('.nav--next'),
  current: document.querySelector('.counter__current'),
  total: document.querySelector('.counter__total'),
  fill: document.querySelector('.counter__fill'),
  caption: document.querySelector('.caption'),
  hint: document.querySelector('.hint'),
  loader: document.querySelector('.loader'),
  loaderFill: document.querySelector('.loader__fill'),
};

const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  ui.loaderFill.style.transform = `scaleX(${loaded / total})`;
};

async function buildGallery() {
  const loader = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = await Promise.all(
    paintings.map(async (p) => {
      const t = await loader.loadAsync(p.src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }),
  );

  const slots = planSlots(paintings.length);
  textures.forEach((tex, i) => {
    const f = buildFrame(tex, paintings[i].frame);
    const slot = slots[i];
    f.slot = slot;
    f.centre = slot.wall.at(slot.s);
    f.group.position.copy(f.centre);
    f.group.rotation.y = slot.wall.rotY;
    f.group.traverse((o) => {
      if (o.isMesh) {
        o.userData.index = i;
        hitTargets.push(o);
      }
    });
    scene.add(f.group);
    frames.push(f);

    // A picture spot on the track for every painting
    const n = slot.wall.normal;
    const lampPos = f.centre.clone().addScaledVector(n, 2);
    lampPos.y = ROOM.h - 0.1;
    const aim = f.centre.clone();
    aim.y -= 0.25;
    const spot = new THREE.SpotLight('#fff4ec', THEMES.evening.spot, 10, 0.44, 0.7, 1.6);
    spot.position.copy(lampPos);
    spot.target.position.copy(aim);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 4;
    scene.add(spot, spot.target);
    spots.push(spot);
    addFixture(lampPos, aim);
  });

  buildRoom();
  await buildPlaques();
  applyTheme();
  applyPlaqueVisibility();
  applyFx();
}

// ---------------------------------------------------------------------------
// Plaques: a lacquered slab on the wall (lit, casts a shadow) with the HTML
// text placed on its face by the CSS3D renderer, so it stays crisp and clickable.
// ---------------------------------------------------------------------------
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
cssRenderer.domElement.className = 'plaque-layer';
document.body.append(cssRenderer.domElement);
const cssScene = new THREE.Scene();
const plaqueParts = []; // { slab, face }

async function buildPlaques() {
  await document.fonts.ready; // measure with the real fonts
  const els = createPlaques(document.querySelector('.plaques'));
  frames.forEach((f, i) => {
    const el = els[i];
    f.plaqueH = el.offsetHeight * PLAQUE_SCALE;
    const y = EYE - f.height / 2 - PLAQUE_GAP - f.plaqueH / 2;
    const n = f.slot.wall.normal;

    const slab = new THREE.Mesh(new RoundedBoxGeometry(PLAQUE_W, f.plaqueH, PLAQUE_DEPTH, 5, 0.009), mats.plaque);
    slab.position.copy(f.centre).addScaledVector(n, PLAQUE_DEPTH / 2 + 0.002);
    slab.position.y = y;
    slab.rotation.y = f.slot.wall.rotY;
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);

    const face = new CSS3DObject(el);
    face.position.copy(f.centre).addScaledVector(n, PLAQUE_DEPTH + 0.0025);
    face.position.y = y;
    face.rotation.y = f.slot.wall.rotY;
    face.scale.setScalar(PLAQUE_SCALE);
    el.style.pointerEvents = 'none'; // only its button takes clicks; drags reach the canvas
    cssScene.add(face);
    plaqueParts.push({ slab, face });
  });
}

function applyPlaqueVisibility() {
  const show = settings.plaques === 'on';
  plaqueParts.forEach(({ slab, face }) => (slab.visible = face.visible = show));
  renderer.shadowMap.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// The rail: one viewpoint per painting, joined by a smooth curve
// ---------------------------------------------------------------------------
const rail = { curveS: null, curveL: null, seg: [], segments: 1 };
const layout = () => (settings.plaques === 'on' ? LAYOUT.on : LAYOUT.off);
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

// Distance and aim height that frame one painting's block on screen
function compose(f) {
  const L = layout();
  const withPlaque = settings.plaques === 'on' && f.plaqueH;
  const h = withPlaque ? f.height + PLAQUE_GAP + f.plaqueH : f.height;
  const w = withPlaque ? Math.max(f.width, PLAQUE_W) : f.width;
  const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9; // hidden tabs report 0 × 0
  const dist = Math.max(h / L.fitH / (2 * tanHalf()), w / L.fitW / (2 * tanHalf() * aspect));
  const blockMid = EYE + f.height / 2 - h / 2;
  const lookY = blockMid + (L.centre - 0.5) * 2 * tanHalf() * dist;
  return { dist, lookY };
}

// Control points: [entrance, one per painting, a step past the last]. Rail
// parameter u = -1 at the entrance, i in front of painting i.
function buildRail() {
  const S = [ENTRANCE.stand.clone()];
  const L = [ENTRANCE.look.clone()];
  frames.forEach((f) => {
    const { dist, lookY } = compose(f);
    const n = f.slot.wall.normal;
    L.push(new THREE.Vector3(f.centre.x, lookY, f.centre.z));
    S.push(new THREE.Vector3(f.centre.x + n.x * dist, lookY + 0.22, f.centre.z + n.z * dist));
  });
  const along = frames[frames.length - 1].slot.wall.right;
  S.push(S[S.length - 1].clone().addScaledVector(along, 1.6));
  L.push(L[L.length - 1].clone().addScaledVector(along, 1.6));
  rail.curveS = new THREE.CatmullRomCurve3(S, false, 'centripetal');
  rail.curveL = new THREE.CatmullRomCurve3(L, false, 'centripetal');
  rail.seg = S.slice(1).map((p, i) => p.distanceTo(S[i])); // seg[k]: between u = k-1 and u = k
  rail.segments = S.length - 1;
  updateMinimapPath();
}

function railPoint(u, curve, out) {
  return curve.getPoint(clamp((u + 1) / rail.segments, 0, 1), out);
}

// Metres of rail per unit of u around u (so a swipe feels 1:1 on the wall)
function segLength(u) {
  const k = clamp(Math.floor(u) + 1, 0, rail.seg.length - 1);
  return Math.max(rail.seg[k], 2.5);
}

// ---------------------------------------------------------------------------
// Camera rig
// ---------------------------------------------------------------------------
const state = {
  index: 0,
  target: 0, // u the body is heading for (follows the finger while dragging)
  body: { x: -1, v: 0 },
  look: { x: -1, v: 0 },
  lean: { x: 0, v: 0 }, // 0 = standing back, 1 = leaning in to the painting
  leanGoal: 0,
  intro: true,
  speed: 0, // m/s along the rail, smoothed
  stride: 0, // footstep phase
  viewDist: 3.5,
  prevPos: new THREE.Vector3(),
  parallax: new THREE.Vector2(),
  parallaxGoal: new THREE.Vector2(),
};
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);
const _right = new THREE.Vector3(1, 0, 0);

function spring(s, goal, { k, c }, dt, soft = 1) {
  const a = -k * soft * (s.x - goal) - c * Math.sqrt(soft) * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

function snapRig() {
  state.target = state.body.x = state.look.x = state.index;
  state.body.v = state.look.v = state.lean.v = 0;
  state.lean.x = state.leanGoal;
  state.intro = false;
  state.speed = 0;
  railPoint(state.body.x, rail.curveS, state.prevPos);
}

function updateRig(dt) {
  const soft = state.intro ? INTRO_SOFTNESS : 1;
  if (reduced() && !drag.active) {
    snapRig();
  } else {
    // Fixed small substeps keep the springs stable on slow frames
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      spring(state.body, state.target, BODY, h, soft);
      spring(state.look, state.target, LOOK, h, soft);
      spring(state.lean, state.leanGoal, LEAN, h);
    }
    if (state.intro && Math.abs(state.body.x - state.target) < 0.004 && Math.abs(state.body.v) < 0.01) {
      state.intro = false;
    }
  }

  railPoint(state.body.x, rail.curveS, _pos);
  railPoint(state.look.x, rail.curveL, _look);

  // How fast are we walking?
  const inst = dt > 0 ? _pos.distanceTo(state.prevPos) / dt : 0;
  state.prevPos.copy(_pos);
  state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 8));
  const speed = reduced() ? 0 : state.speed;

  _fwd.subVectors(_look, _pos);
  state.viewDist = _fwd.length();
  _fwd.normalize();
  _right.crossVectors(_fwd, UP).normalize();

  // Lean in to see the brushwork, eyes on the painting itself (the plaque drops out of view)
  _pos.addScaledVector(_fwd, state.lean.x * state.viewDist * 0.52);
  _look.y += state.lean.x * (EYE - _look.y);
  // Step back a touch while walking: reads as moving past the wall
  _pos.addScaledVector(_fwd, -Math.min(speed * 0.1, 0.6));
  // Footsteps: a small bounce per step and a sway side to side
  state.stride += ((speed * dt) / 0.72) * Math.PI * 2;
  const bob = Math.min(speed, 2.5) * 0.006;
  _pos.y += Math.sin(state.stride) * bob;
  _pos.addScaledVector(_right, Math.sin(state.stride / 2) * bob * 0.6);

  // Mouse parallax
  const k = reduced() ? 1 : 1 - Math.exp(-dt * 4);
  state.parallax.lerp(reduced() ? new THREE.Vector2() : state.parallaxGoal, k);
  const px = state.parallax.x * 0.12;
  const py = state.parallax.y * 0.06;
  _pos.addScaledVector(_right, px);
  _pos.y += py;
  _look.addScaledVector(_right, px * 0.3);

  camera.position.copy(_pos);
  camera.lookAt(_look);

  // The view widens slightly on the move
  const fov = FOV + Math.min(speed * 0.8, 3.5);
  if (Math.abs(fov - camera.fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------
const mini = { el: document.querySelector('.minimap'), you: null, path: null, marks: [] };
const mx = (x) => x.toFixed(2);
const mz = (z) => (z + ROOM.d / 2).toFixed(2);

function buildMinimap() {
  const { w, d } = ROOM;
  const pad = 0.8;
  const marks = frames
    .map((f, i) => {
      const { normal: n, right: r } = f.slot.wall;
      const a = f.centre.clone().addScaledVector(r, -f.width / 2).addScaledVector(n, 0.16);
      const b = f.centre.clone().addScaledVector(r, f.width / 2).addScaledVector(n, 0.16);
      const coords = `x1="${mx(a.x)}" y1="${mz(a.z)}" x2="${mx(b.x)}" y2="${mz(b.z)}"`;
      return `<line class="minimap__hit" data-index="${i}" ${coords} /><line class="minimap__mark" ${coords} />`;
    })
    .join('');
  const W = mx(w / 2);
  const Wn = mx(-w / 2);
  const D = mz(d / 2);
  mini.el.innerHTML = `<svg viewBox="${-w / 2 - pad} ${-pad} ${w + pad * 2} ${d + pad * 2}" aria-hidden="true">
    <path class="minimap__walls" d="M ${Wn} ${D} L ${Wn} 0 L ${W} 0 L ${W} ${D} L 0.9 ${D} M -0.9 ${D} L ${Wn} ${D}" />
    <rect class="minimap__bench" x="-0.85" y="${mz(0.6 - 0.225)}" width="1.7" height="0.45" rx="0.1" />
    <polyline class="minimap__path" points="" />
    ${marks}
    <g class="minimap__you"><path class="minimap__view" d="M 0 0 L -1.3 -2.4 A 2.7 2.7 0 0 1 1.3 -2.4 Z" /><circle r="0.3" /></g>
  </svg>`;
  mini.you = mini.el.querySelector('.minimap__you');
  mini.path = mini.el.querySelector('.minimap__path');
  mini.marks = [...mini.el.querySelectorAll('.minimap__mark')];
  mini.el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-index]');
    if (!m) return;
    goTo(+m.dataset.index);
    hideHint();
  });
  updateMinimapPath();
  renderMinimapActive();
}

function updateMinimapPath() {
  if (!mini.path || !rail.curveS) return;
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    railPoint((i / steps) * (frames.length - 1), rail.curveS, _pos);
    pts.push(`${mx(_pos.x)},${mz(_pos.z)}`);
  }
  mini.path.setAttribute('points', pts.join(' '));
}

function renderMinimapActive() {
  mini.marks.forEach((m, i) => m.classList.toggle('is-active', i === state.index));
}

function updateMinimap() {
  if (!mini.you) return;
  const deg = (Math.atan2(_fwd.x, -_fwd.z) * 180) / Math.PI;
  mini.you.setAttribute(
    'transform',
    `translate(${mx(camera.position.x)} ${mz(camera.position.z)}) rotate(${deg.toFixed(1)})`,
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

function goTo(i) {
  const next = clamp(i, 0, frames.length - 1);
  const changed = next !== state.index;
  state.index = next;
  state.target = next;
  state.intro = false;
  setLean(false);
  if (reduced()) snapRig();
  renderUI(changed);
}

function step(dir) {
  goTo(state.index + dir);
  hideHint();
}

function setLean(on) {
  state.leanGoal = on ? 1 : 0;
  canvas.classList.toggle('is-leaning', on);
  if (reduced()) snapRig();
}

let captionTimer;
function renderUI(changed = true) {
  ui.current.textContent = pad(state.index + 1);
  ui.fill.style.transform = `scaleX(${(state.index + 1) / frames.length})`;
  ui.prev.disabled = state.index === 0;
  ui.next.disabled = state.index === frames.length - 1;
  renderMinimapActive();
  if (!changed && ui.caption.textContent) return;
  ui.caption.classList.add('is-changing');
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => {
    ui.caption.textContent = paintings[state.index].title;
    ui.caption.classList.remove('is-changing');
  }, 220);
}

let hintTimer;
function hideHint() {
  ui.hint.classList.add('is-hidden');
  clearTimeout(hintTimer);
}

ui.prev.addEventListener('click', () => step(-1));
ui.next.addEventListener('click', () => step(1));

addEventListener('keydown', (e) => {
  if (isOverlayOpen() || e.target.closest?.('input, textarea')) return;
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'Escape' && state.leanGoal) setLean(false);
});

addEventListener('settings:change', (e) => {
  if (e.detail.key === 'theme') applyTheme();
  if (e.detail.key === 'fx') applyFx();
  if (e.detail.key === 'plaques') {
    applyPlaqueVisibility();
    if (frames.length) buildRail();
  }
});

// Trackpad / mouse wheel: one gesture = one painting
let wheelLock = false;
let wheelAccum = 0;
let wheelIdle;
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => {
      wheelLock = false;
      wheelAccum = 0;
    }, 160);
    if (wheelLock) return;
    wheelAccum += d;
    if (Math.abs(wheelAccum) > 40) {
      step(Math.sign(wheelAccum));
      wheelLock = true;
      wheelAccum = 0;
    }
  },
  { passive: false },
);

// ---------------------------------------------------------------------------
// Drag / swipe
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const drag = { active: false, id: null, startX: 0, startTarget: 0, lastX: 0, lastT: 0, vel: 0, moved: 0 };

// Metres of wall per screen pixel at the current viewing distance
function worldPerPixel() {
  return (2 * tanHalf() * state.viewDist * camera.aspect) / innerWidth;
}

function pick(clientX, clientY) {
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(hitTargets, false)[0];
  return hit ? hit.object.userData.index : null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!frames.length) return;
  canvas.setPointerCapture(e.pointerId);
  state.intro = false;
  Object.assign(drag, {
    active: true,
    id: e.pointerId,
    startX: e.clientX,
    startTarget: state.target,
    lastX: e.clientX,
    lastT: performance.now(),
    vel: 0,
    moved: 0,
  });
});

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    state.parallaxGoal.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  }

  if (!drag.active || e.pointerId !== drag.id) {
    if (e.pointerType === 'mouse' && frames.length) {
      const i = pick(e.clientX, e.clientY);
      canvas.classList.toggle('is-pointing', i !== null && i !== state.index);
      canvas.classList.toggle('is-lean-target', i === state.index);
    }
    return;
  }

  const now = performance.now();
  const dx = e.clientX - drag.startX;
  drag.moved = Math.max(drag.moved, Math.abs(dx));
  const instant = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1);
  drag.vel = drag.vel * 0.6 + instant * 0.4; // px / ms, smoothed
  drag.lastX = e.clientX;
  drag.lastT = now;

  if (drag.moved > 4) {
    canvas.classList.add('is-dragging');
    hideHint();
    if (state.leanGoal) setLean(false);
  }

  // Follow the finger 1:1 along the wall, with rubber-banding past the ends
  let u = drag.startTarget - (dx * worldPerPixel()) / segLength(drag.startTarget);
  const max = frames.length - 1;
  if (u < 0) u = -Math.sqrt(-u) * 0.18;
  if (u > max) u = max + Math.sqrt(u - max) * 0.18;
  state.target = u;
  if (reduced()) state.body.x = state.look.x = u;
});

function endDrag(e) {
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  canvas.classList.remove('is-dragging');

  // A tap, not a swipe: walk to the painting tapped, or lean in to this one
  if (drag.moved <= 4) {
    const i = pick(e.clientX, e.clientY);
    if (i === null) goTo(state.index);
    else if (i !== state.index) {
      goTo(i);
      hideHint();
    } else {
      setLean(!state.leanGoal);
      hideHint();
    }
    return;
  }

  // Throw: project where the flick would land and snap to the nearest painting.
  // A finger that paused before lifting carries no momentum.
  const vel = performance.now() - drag.lastT > 80 ? 0 : clamp(drag.vel, -3, 3);
  const projected = state.target - (vel * 150 * worldPerPixel()) / segLength(state.target);
  let nearest = Math.round(clamp(projected, 0, frames.length - 1));
  // Any deliberate swipe moves exactly one painting
  if (nearest === state.index && drag.moved > 40) {
    nearest += state.target > state.index ? 1 : -1;
  }
  goTo(clamp(nearest, state.index - 1, state.index + 1));
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => state.parallaxGoal.set(0, 0));

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
addEventListener('resize', () => {
  if (!innerWidth || !innerHeight) return; // a hidden tab reports 0 × 0
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
  if (frames.length) buildRail();
});

const clock = new THREE.Clock();
let ready = false;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (ready) {
    updateRig(dt);
    updateDust(clock.elapsedTime);
    updateMinimap();
  }
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
  requestAnimationFrame(frame);
}

// Console hook for testing: __gallery.tick(2) advances the walk by two seconds
window.__gallery = {
  state,
  rail,
  frames,
  camera,
  renderer,
  goTo,
  setLean,
  tick(seconds = 1) {
    for (let i = 0; i < Math.round(seconds * 60); i++) updateRig(1 / 60);
    updateMinimap();
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
  },
};

buildGallery().then(() => {
  ui.total.textContent = pad(frames.length);
  buildRail();
  buildMinimap();
  if (reduced()) {
    snapRig();
  } else {
    // Walk in from the doorway to the first painting
    state.body.x = state.look.x = -1;
    state.target = 0;
    state.intro = true;
    railPoint(-1, rail.curveS, state.prevPos);
  }
  renderUI(true);
  ready = true;
  requestAnimationFrame(() => ui.loader.classList.add('is-done'));
  hintTimer = setTimeout(hideHint, 7000);
  frame();
});
