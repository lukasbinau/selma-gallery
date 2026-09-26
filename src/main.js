import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { paintings } from './paintings.js';
import { settings } from './store.js';
import { createPlaques, isOverlayOpen } from './ui.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const EYE = 1.4; // height of painting centres (m)
const ART_AREA = 0.95; // every artwork is normalised to this area (m²)
const GAP = 1.25; // wall space between neighbouring frames (m)
const FOV = 38;
// With plaques on, the painting sits higher and a little smaller to make room
const LAYOUT = {
  // fitH/fitW: max share of screen height/width; centre: vertical position (0 = top)
  on: { fitH: 0.44, fitW: 0.64, centre: 0.38 },
  off: { fitH: 0.56, fitW: 0.72, centre: 0.48 },
};

// Springs: the "look" spring is stiffer than the "body" spring, so the camera
// turns toward the next painting first and its body catches up — a walk.
const BODY = { k: 150, c: 2 * Math.sqrt(150) };
const LOOK = { k: 260, c: 2 * Math.sqrt(260) };
const DOLLY = { k: 90, c: 2 * Math.sqrt(90) };
const FRAMING = { k: 120, c: 2 * Math.sqrt(120) };

const THEMES = {
  evening: {
    bg: '#14120f',
    wall: '#3a3631',
    floor: '#16130f',
    floorOpacity: 0.86,
    skirting: '#0f0e0d',
    hemi: 0.35,
    spot: 38,
    exposure: 1.05,
  },
  daylight: {
    bg: '#dcd6cc',
    wall: '#e4dfd6',
    floor: '#b9b1a4',
    floorOpacity: 0.8,
    skirting: '#d3ccc0',
    hemi: 1.35,
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

const hemi = new THREE.HemisphereLight('#fff4e6', '#1a1510', 0.35);
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
};

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

    // A museum spot for every painting
    const spot = new THREE.SpotLight('#ffe9cf', THEMES.evening.spot, 9, 0.38, 0.75, 1.6);
    spot.position.set(cursor, 3.9, 2.1);
    spot.target.position.set(cursor, EYE - 0.05, 0);
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

  applyTheme();
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
  centre: { x: LAYOUT.on.centre, v: 0 }, // where on screen the painting sits
  parallax: new THREE.Vector2(),
  parallaxGoal: new THREE.Vector2(),
};

const layout = () => (settings.plaques === 'on' ? LAYOUT.on : LAYOUT.off);
const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

function fitDistance(f) {
  const byH = f.height / layout().fitH / (2 * tanHalf());
  const byW = f.width / layout().fitW / (2 * tanHalf() * camera.aspect);
  return Math.max(byH, byW);
}

// Base viewing distance, interpolated between neighbours while moving.
function distanceAt(x) {
  if (x <= frames[0].x) return fitDistance(frames[0]);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return THREE.MathUtils.lerp(fitDistance(a), fitDistance(b), t);
    }
  }
  return fitDistance(frames[frames.length - 1]);
}

function spring(s, goal, { k, c }, dt) {
  const a = -k * (s.x - goal) - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}

function snapRig() {
  const x = frames[state.index].x;
  state.target = state.body.x = state.look.x = x;
  state.body.v = state.look.v = state.dist.v = state.centre.v = 0;
  state.dist.x = distanceAt(x);
  state.centre.x = layout().centre;
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
      spring(state.dist, distanceAt(state.body.x) + pullBack, DOLLY, h);
      spring(state.centre, layout().centre, FRAMING, h);
    }
  }

  const k = reduced() ? 1 : 1 - Math.exp(-dt * 4);
  state.parallax.lerp(reduced() ? new THREE.Vector2() : state.parallaxGoal, k);
  const px = state.parallax.x * 0.12;
  const py = state.parallax.y * 0.06;

  // Shift the look point down so the painting sits at `centre` on screen
  const visibleH = 2 * tanHalf() * state.dist.x;
  const lookY = EYE - (0.5 - state.centre.x) * visibleH;
  camera.position.set(state.body.x + px, lookY + 0.25 + py, state.dist.x);
  camera.lookAt(state.look.x + px * 0.3, lookY, 0);
}

// ---------------------------------------------------------------------------
// Plaques: HTML cards pinned under each painting
// ---------------------------------------------------------------------------
const plaqueEls = createPlaques(document.querySelector('.plaques'));
const anchor = new THREE.Vector3();

function updatePlaques() {
  const show = settings.plaques === 'on';
  camera.updateMatrixWorld();
  frames.forEach((f, i) => {
    const el = plaqueEls[i];
    // Fully visible when standing in front of the painting, fading as we walk away
    const away = Math.abs(state.body.x - f.x) / 0.7;
    const o = show ? Math.max(0, 1 - away * away) : 0;
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    el.inert = o < 0.5;
    if (o <= 0.01) return;
    anchor.set(f.x, EYE - f.height / 2 - 0.11, 0.03).project(camera);
    const sx = (anchor.x * 0.5 + 0.5) * innerWidth;
    const sy = (-anchor.y * 0.5 + 0.5) * innerHeight;
    // Shrink slightly when the camera steps back, so it feels attached to the wall
    const s = THREE.MathUtils.clamp(distanceAt(f.x) / state.dist.x, 0.82, 1);
    el.style.transform = `translate3d(${(sx - el.offsetWidth / 2).toFixed(1)}px, ${(sy + (1 - o) * 10).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
  });
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
});

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (frames.length) {
    updateRig(dt);
    updatePlaques();
  }
  renderer.render(scene, camera);
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
