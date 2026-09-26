import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { paintings } from './paintings.js';
import { settings } from './store.js';
import { createPlaques, isOverlayOpen } from './ui.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const EYE = 1.75; // height of painting centres (m)
const ART_AREA = 0.95; // every artwork is normalised to this area (m²)
const GAP = 1.25; // wall space between neighbouring frames (m)
const FOV = 38;
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

// Springs: the "look" spring is stiffer than the "body" spring, so the camera
// turns toward the next painting first and its body catches up — a walk.
const BODY = { k: 150, c: 2 * Math.sqrt(150) };
const LOOK = { k: 260, c: 2 * Math.sqrt(260) };
const DOLLY = { k: 90, c: 2 * Math.sqrt(90) };
const FRAMING = { k: 120, c: 2 * Math.sqrt(120) };

// Colour scheme picked by Selma: ultramarine blue and lavender
const THEMES = {
  evening: {
    // an ultramarine room: deep blue walls, the spots pull out their colour
    bg: '#0a0d2c',
    wall: '#26308a',
    floor: '#0b0e2e',
    floorOpacity: 0.86,
    skirting: '#0d1034',
    plaqueGlow: 0.22,
    hemi: 0.3,
    spot: 40,
    exposure: 1.05,
  },
  daylight: {
    // a lavender room
    bg: '#dcd3f0',
    wall: '#d6cbef',
    floor: '#a99cc9',
    floorOpacity: 0.8,
    skirting: '#c3b6e4',
    plaqueGlow: 0,
    hemi: 1.3,
    spot: 16,
    exposure: 0.95,
  },
};

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
scene.fog = new THREE.Fog(0x000000, 7, 17);

const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 60);

const hemi = new THREE.HemisphereLight('#f1edff', '#141845', 0.35);
scene.add(hemi);
const spots = [];

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const mats = {
  wall: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
  floor: new THREE.MeshStandardMaterial({ roughness: 0.85, transparent: true }),
  black: new THREE.MeshStandardMaterial({ color: '#0f0e0d', roughness: 0.45 }),
  oak: new THREE.MeshStandardMaterial({ color: '#b48f62', roughness: 0.6 }),
  mat: new THREE.MeshStandardMaterial({ color: '#f2eee6', roughness: 0.95 }),
  canvasEdge: new THREE.MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.9 }),
  shadowGap: new THREE.MeshStandardMaterial({ color: '#0b0a09', roughness: 1 }),
  skirting: new THREE.MeshStandardMaterial({ roughness: 0.6 }),
  plaque: null, // walnut, created below once we can draw its grain
};

// Procedural dark walnut, computed per pixel once at load. Grain follows
// long, slowly drifting growth lines, with soft colour bands and fine pores.
function woodTexture() {
  // 1024 px is plenty: the plaque is only a few hundred pixels wide on screen
  const W = 1024;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;

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

  const light = [66, 42, 27]; // warm walnut highlight
  const dark = [24, 14, 9]; // deep brown-black
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Growth lines drift gently across the board
      const warp = noise2(x * 0.0032, y * 0.008) * 4.5 + noise1(x * 0.0014) * 3;
      const t = (y + warp) * 0.11;
      const ring = t - Math.floor(t);
      const line = Math.pow(1 - Math.min(ring, 1 - ring) * 2, 7); // thin dark lines
      const band = noise1((y + warp) * 0.04) * 0.55 + noise2(x * 0.0018, y * 0.04) * 0.45;
      const pore = hash(Math.floor(x / 3) * 7.3 + y * 311.7) < 0.035 ? 0.35 : 0;
      let k = 0.25 + band * 0.55 - line * 0.35 - pore * 0.4;
      k = Math.max(0, Math.min(1, k));
      const i = (y * W + x) * 4;
      d[i] = dark[0] + (light[0] - dark[0]) * k;
      d[i + 1] = dark[1] + (light[1] - dark[1]) * k;
      d[i + 2] = dark[2] + (light[2] - dark[2]) * k;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const wood = woodTexture();
// Oiled walnut under a thin satin lacquer
mats.plaque = new THREE.MeshPhysicalMaterial({
  map: wood,
  roughness: 0.5,
  clearcoat: 0.55,
  clearcoatRoughness: 0.28,
  emissive: '#ffffff',
  emissiveMap: wood, // a faint self-glow keeps the grain readable in the evening room
  emissiveIntensity: 0.1,
});

function applyTheme() {
  const t = THEMES[settings.theme] ?? THEMES.evening;
  document.documentElement.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]').content = t.bg;
  scene.background.set(t.bg);
  scene.fog.color.set(t.bg);
  mats.wall.color.set(t.wall);
  mats.floor.color.set(t.floor);
  mats.floor.opacity = t.floorOpacity;
  mats.skirting.color.set(t.skirting);
  mats.plaque.emissiveIntensity = t.plaqueGlow;
  hemi.intensity = t.hemi;
  spots.forEach((s) => (s.intensity = t.spot));
  renderer.toneMappingExposure = t.exposure;
}
applyTheme();

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
// Gallery build
// ---------------------------------------------------------------------------
const frames = []; // { x, width, height, group }
const hitTargets = [];

async function buildGallery() {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = await Promise.all(
    paintings.map(async (p) => {
      const t = await loader.loadAsync(p.src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      return t;
    }),
  );

  let cursor = 0;
  textures.forEach((tex, i) => {
    const f = buildFrame(tex, paintings[i].frame);
    if (i > 0) cursor += frames[i - 1].width / 2 + GAP + f.width / 2;
    f.x = cursor;
    f.group.position.set(cursor, EYE, 0);
    f.group.traverse((o) => {
      if (o.isMesh) {
        o.userData.index = i;
        hitTargets.push(o);
      }
    });
    scene.add(f.group);
    frames.push(f);

    // A museum spot for every painting, wide enough to catch the plaque too
    const spot = new THREE.SpotLight('#fff4ec', THEMES.evening.spot, 10, 0.44, 0.7, 1.6);
    spot.position.set(cursor, 4.3, 2.3);
    spot.target.position.set(cursor, EYE - 0.25, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 4;
    scene.add(spot, spot.target);
    spots.push(spot);
  });

  const first = frames[0].x;
  const last = frames[frames.length - 1].x;
  const span = last - first + 40;
  const mid = (first + last) / 2;

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(span, 9), mats.wall);
  wall.position.set(mid, 4.5, 0);
  wall.receiveShadow = true;
  scene.add(wall);

  // Mirror underneath + a mostly-opaque floor on top = a soft polished floor
  const mirrorSize = () => [
    innerWidth * renderer.getPixelRatio() * 0.5,
    innerHeight * renderer.getPixelRatio() * 0.5,
  ];
  const [tw, th] = mirrorSize();
  const mirror = new Reflector(new THREE.PlaneGeometry(span, 30), {
    textureWidth: tw,
    textureHeight: th,
    color: 0x9a9590,
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.set(mid, 0, 15);
  scene.add(mirror);
  addEventListener('resize', () => mirror.getRenderTarget().setSize(...mirrorSize()));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, 30), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(mid, 0.002, 15);
  floor.receiveShadow = true;
  scene.add(floor);

  // Skirting board where wall meets floor
  const skirting = box(span, 0.08, 0.015, mats.skirting, mid, 0.04, 0.0075);
  skirting.castShadow = false;
  scene.add(skirting);

  await buildPlaques();
  applyTheme();
  applyPlaqueVisibility();
}

// ---------------------------------------------------------------------------
// Plaques: a rounded slab on the wall (lit, casts a shadow) with the HTML text
// placed on its front face by the CSS3D renderer, so it stays crisp and clickable.
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

    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(PLAQUE_W, f.plaqueH, PLAQUE_DEPTH, 5, 0.009),
      mats.plaque,
    );
    slab.position.set(f.x, y, PLAQUE_DEPTH / 2 + 0.002);
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);

    const face = new CSS3DObject(el);
    face.position.set(f.x, y, PLAQUE_DEPTH + 0.0025);
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
// Camera rig
// ---------------------------------------------------------------------------
const state = {
  index: 0,
  target: 0, // x the body is heading for (follows finger while dragging)
  body: { x: 0, v: 0 },
  look: { x: 0, v: 0 },
  dist: { x: 4, v: 0 },
  lookY: { x: EYE, v: 0 }, // height the camera aims at
  parallax: new THREE.Vector2(),
  parallaxGoal: new THREE.Vector2(),
};

const layout = () => (settings.plaques === 'on' ? LAYOUT.on : LAYOUT.off);
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

// Distance and aim height that frame one painting's block on screen
function compose(f) {
  const L = layout();
  const withPlaque = settings.plaques === 'on' && f.plaqueH;
  const h = withPlaque ? f.height + PLAQUE_GAP + f.plaqueH : f.height;
  const w = withPlaque ? Math.max(f.width, PLAQUE_W) : f.width;
  const dist = Math.max(h / L.fitH / (2 * tanHalf()), w / L.fitW / (2 * tanHalf() * camera.aspect));
  const blockMid = EYE + f.height / 2 - h / 2;
  // Aim above/below the block's middle so it lands at L.centre on screen
  const lookY = blockMid + (L.centre - 0.5) * 2 * tanHalf() * dist;
  return { dist, lookY };
}

// Composition at any x along the wall, interpolated between neighbours
function composeAt(x) {
  if (x <= frames[0].x) return compose(frames[0]);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      const ca = compose(a);
      const cb = compose(b);
      return { dist: THREE.MathUtils.lerp(ca.dist, cb.dist, t), lookY: THREE.MathUtils.lerp(ca.lookY, cb.lookY, t) };
    }
  }
  return compose(frames[frames.length - 1]);
}

function spring(s, goal, { k, c }, dt) {
  const a = -k * (s.x - goal) - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

function snapRig() {
  const x = frames[state.index].x;
  state.target = state.body.x = state.look.x = x;
  state.body.v = state.look.v = state.dist.v = state.lookY.v = 0;
  const c = composeAt(x);
  state.dist.x = c.dist;
  state.lookY.x = c.lookY;
}

function updateRig(dt) {
  if (reduced() && !drag.active) {
    snapRig();
  } else {
    // Fixed small substeps keep the springs stable on slow frames
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      spring(state.body, state.target, BODY, h);
      spring(state.look, state.target, LOOK, h);
      // Step back a little while travelling fast: reads as walking past the wall
      const pullBack = Math.min(Math.abs(state.body.v) * 0.12, 0.9);
      const c = composeAt(state.body.x);
      spring(state.dist, c.dist + pullBack, DOLLY, h);
      spring(state.lookY, c.lookY, FRAMING, h);
    }
  }

  const k = reduced() ? 1 : 1 - Math.exp(-dt * 4);
  state.parallax.lerp(reduced() ? new THREE.Vector2() : state.parallaxGoal, k);
  const px = state.parallax.x * 0.12;
  const py = state.parallax.y * 0.06;

  const lookY = state.lookY.x;
  camera.position.set(state.body.x + px, lookY + 0.25 + py, state.dist.x);
  camera.lookAt(state.look.x + px * 0.3, lookY, 0);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const ui = {
  prev: document.querySelector('.nav--prev'),
  next: document.querySelector('.nav--next'),
  current: document.querySelector('.counter__current'),
  total: document.querySelector('.counter__total'),
  fill: document.querySelector('.counter__fill'),
  hint: document.querySelector('.hint'),
  loader: document.querySelector('.loader'),
};
const pad = (n) => String(n).padStart(2, '0');

function goTo(i) {
  const clamped = THREE.MathUtils.clamp(i, 0, frames.length - 1);
  state.index = clamped;
  state.target = frames[clamped].x;
  renderUI();
}

function step(dir) {
  goTo(state.index + dir);
  hideHint();
}

function renderUI() {
  ui.current.textContent = pad(state.index + 1);
  ui.fill.style.transform = `scaleX(${(state.index + 1) / frames.length})`;
  ui.prev.disabled = state.index === 0;
  ui.next.disabled = state.index === frames.length - 1;
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
});

addEventListener('settings:change', (e) => {
  if (e.detail.key === 'theme') applyTheme();
  if (e.detail.key === 'plaques') applyPlaqueVisibility();
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
  return (2 * tanHalf() * state.dist.x * camera.aspect) / innerWidth;
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
  }

  // Follow the finger 1:1, with rubber-banding past the first/last painting
  let t = drag.startTarget - dx * worldPerPixel();
  const min = frames[0].x;
  const max = frames[frames.length - 1].x;
  if (t < min) t = min - Math.sqrt(min - t) * 0.5;
  if (t > max) t = max + Math.sqrt(t - max) * 0.5;
  state.target = t;
  if (reduced()) state.body.x = state.look.x = t;
});

function endDrag(e) {
  if (!drag.active || e.pointerId !== drag.id) return;
  drag.active = false;
  canvas.classList.remove('is-dragging');

  // A tap, not a swipe: walk to whichever painting was tapped
  if (drag.moved <= 4) {
    const i = pick(e.clientX, e.clientY);
    if (i !== null && i !== state.index) {
      goTo(i);
      hideHint();
    } else goTo(state.index);
    return;
  }

  // Throw: project where the flick would land and snap to the nearest painting.
  // A finger that paused before lifting carries no momentum.
  const vel = performance.now() - drag.lastT > 80 ? 0 : THREE.MathUtils.clamp(drag.vel, -3, 3);
  const projected = state.target - vel * 150 * worldPerPixel();
  let nearest = 0;
  frames.forEach((f, i) => {
    if (Math.abs(f.x - projected) < Math.abs(frames[nearest].x - projected)) nearest = i;
  });
  // Any deliberate swipe moves exactly one painting
  if (nearest === state.index && drag.moved > 40) {
    nearest += state.target > frames[state.index].x ? 1 : -1;
  }
  goTo(THREE.MathUtils.clamp(nearest, state.index - 1, state.index + 1));
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', () => state.parallaxGoal.set(0, 0));

// ---------------------------------------------------------------------------
// Resize + loop
// ---------------------------------------------------------------------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (frames.length) {
    updateRig(dt);
  }
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
  requestAnimationFrame(frame);
}

buildGallery().then(() => {
  ui.total.textContent = pad(frames.length);
  snapRig();
  if (!reduced()) state.dist.x += 1.6; // start slightly back and settle in on load
  renderUI();
  requestAnimationFrame(() => ui.loader.classList.add('is-done'));
  hintTimer = setTimeout(hideHint, 5000);
  frame();
});
