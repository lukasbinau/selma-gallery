// The 3D gallery: a real room you walk through on a camera rail, with a plaque
// under every painting. Nothing else in the site imports three.
//
//   const gallery = await createGallery({ root, works, artMeta });
//   await gallery.show({ index: 3 });      // stand in front of works[3]
//   gallery.on('exit', () => gallery.hide());
//
// Events: 'index' { index }, 'exit', 'ready' (the textures around you are in), and from the plaques
// 'contact' { id } (KØB OG KONTAKT) and 'stue' { id } (I DIN STUE).
//
// `root` is an empty <div id="galleri" hidden>; the module builds all of its
// own DOM inside it (plus a measuring box for the plaques on <body>).
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './gallery.css';
import { settings } from '../store.js';
import { buildChrome, createPlaques, measurePlaques, pad, STRINGS } from './chrome.js';
import { artFormat, artUrl } from '../art-format.js';
import { SECRETS } from './secrets.js';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const CORNER = 3.2; // wall length kept free beside each corner (m)
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
const ZOOM = { k: 160, c: 2 * Math.sqrt(160) }; // pinch zoom and pan follow the fingers closely
// Leaning in stops where the whole painting fills this share of the screen in
// its tighter direction, on any screen; pinching goes closer, up to ZOOM_MAX
const LEAN_FILL = 0.92;
const ZOOM_MAX = 4;
const INTRO_SOFTNESS = 0.2; // springs this much softer during the walk-in

// Room colours from Selma's Canva design: a deep violet room with pink plaques
const THEMES = {
  evening: {
    bg: '#230a66',
    wall: '#5e17eb',
    ceiling: '#d6c8f4',
    floor: '#efe6d8',
    floorOpacity: 0.9,
    skirting: '#2a0f78',
    plaqueGlow: 0.12,
    hemi: 0.22,
    spot: 40,
    exposure: 1.0,
    env: 0.04,
    beam: 0.055,
    dust: 0.28,
    fog: [10, 30],
  },
  daylight: {
    // pale violet-white walls, so the pink plaques stand out
    bg: '#e3dbf5',
    wall: '#efe9fb',
    ceiling: '#ffffff',
    floor: '#ffffff',
    floorOpacity: 0.86,
    skirting: '#cbbcf0',
    plaqueGlow: 0,
    hemi: 1.3,
    spot: 16,
    exposure: 0.95,
    env: 0.35,
    beam: 0.02,
    dust: 0.07,
    fog: [18, 48],
  },
};

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const reduced = () => settings.motion === 'reduced';
const ZERO_RECT = () => ({ x: 0, y: 0, width: 0, height: 0 });

// Let the browser paint a frame (and handle a click) between two slices of
// work; the timer carries on where rAF stalls (a background tab)
const breathe = () =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0),
    );
  });

// Paintings are decoded with createImageBitmap, flipped for WebGL on the way.
// Whether the options work is checked once: a 1 × 2 image, red above blue,
// must come out blue on top. Older Safari ignores the options (or has no
// createImageBitmap at all) and gets TextureLoader instead.
const BITMAP_OPTIONS = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
const isBitmap = (x) => typeof ImageBitmap !== 'undefined' && x instanceof ImageBitmap;
let bitmapCheck = null;
function bitmapsWork() {
  return (bitmapCheck ??= (async () => {
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return false;
    try {
      const pixels = new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 1, 2);
      const bitmap = await createImageBitmap(pixels, BITMAP_OPTIONS);
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 2;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const [r, , b] = ctx.getImageData(0, 0, 1, 1).data;
      return b > 128 && r < 128;
    } catch {
      return false;
    }
  })());
}

// ---------------------------------------------------------------------------
// Procedural texture helpers (pure maths, shared by every instance)
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

// The gallery without WebGL: show() rejects so the caller can fall back
function noWebglGallery({ on, off }) {
  const gallery = {
    webgl: false,
    get index() {
      return 0;
    },
    show: () => Promise.reject(new Error('no-webgl')),
    hide() {},
    goTo() {},
    on,
    off,
    rectAtRest: ZERO_RECT,
    currentRect: ZERO_RECT,
    setExposure() {},
    resize() {},
    tick() {},
    toast() {},
  };
  window.__gallery = gallery;
  return gallery;
}

// ---------------------------------------------------------------------------
// createGallery
// ---------------------------------------------------------------------------
export async function createGallery({ root, works, artMeta = {} }) {
  if (!root) throw new Error('createGallery: root mangler');
  const list = Array.isArray(works) ? works : [];
  const n = list.length;

  // ---------------------------------------------------------------- events
  const listeners = new Map();
  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  };
  const off = (event, fn) => {
    listeners.get(event)?.delete(fn);
  };
  const emit = (event, detail) => {
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(detail);
      } catch (err) {
        console.error(err);
      }
    });
  };

  // ---------------------------------------------------------------- chrome + renderer
  const ui = buildChrome(root, { total: n });
  const canvas = ui.canvas;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no-webgl');
  } catch {
    root.replaceChildren();
    return noWebglGallery({ on, off });
  }

  // The room grows with the number of works: with 14, planSlots hangs 6 on the
  // back wall and 4 on each side wall, and every frame needs ~1.9 m of wall.
  const q = Math.floor(n / 3);
  const backCount = n - 2 * q;
  const ROOM = { w: Math.max(13, 6.4 + 1.9 * backCount), d: Math.max(11, 6.4 + 1.9 * q), h: 4.2 };
  const smallScreen = Math.min(innerWidth, innerHeight) * devicePixelRatio < 1600;
  const FULL_SIZE = smallScreen ? 1024 : 2048;
  const SHADOW_SIZE = smallScreen ? 512 : 1024;
  const DUST = Math.min(640, Math.round((320 * ROOM.w * ROOM.d) / 143));

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the scene is static: shadows render only when a light moves
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // The viewport the gallery draws into (the root, or the window while the root is hidden)
  const view = { w: 1, h: 1, left: 0, top: 0 };
  function measureView() {
    const r = root.getBoundingClientRect();
    const ok = r.width > 0 && r.height > 0;
    view.w = ok ? r.width : innerWidth || 1;
    view.h = ok ? r.height : innerHeight || 1;
    view.left = ok ? r.left : 0;
    view.top = ok ? r.top : 0;
  }
  measureView();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 9, 26);

  // The room is built in slices with a breath between them: the visitor may
  // have clicked a card meanwhile, and its painting must lift off at once
  // (src/transition.js), not after the whole build.
  await breathe();

  // Soft studio reflections on lacquer, glass and metal
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  await breathe();

  const camera = new THREE.PerspectiveCamera(FOV, view.w / view.h, 0.1, 60);

  const hemi = new THREE.HemisphereLight('#f1edff', '#1a0a4a', 0.3);
  scene.add(hemi);

  // One picture spot per painting, but only a pool of SHADOW_LIGHTS of them
  // casts shadows: every shadow map costs a texture unit, and 14 of them plus
  // the material maps overflow the 16 most GPUs allow. The shadow-casting
  // lights follow you along the rail (assignLights), swapping places with the
  // plain ones, so the paintings around you always have real shadows.
  const SHADOW_LIGHTS = Math.min(5, Math.max(1, n));
  const spots = []; // spots[0..SHADOW_LIGHTS-1] cast shadows
  const lamps = []; // { pos, aim } per painting, in hanging order

  // ---------------------------------------------------------------- procedural textures
  function canvasTexture(c, { repeat = false } = {}) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
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

  // Hand-painted wall: soft mottling and faint brush drag. Greyscale, so it
  // tints with each theme's wall colour.
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

  // A 1 × 1 stand-in for the artwork until its photo arrives. Giving every art
  // plane a map from the start means swapping in the real texture never
  // recompiles the shader.
  const placeholder = new THREE.DataTexture(new Uint8Array([92, 80, 110, 255]), 1, 1);
  placeholder.colorSpace = THREE.SRGBColorSpace;
  placeholder.needsUpdate = true;

  // ---------------------------------------------------------------- materials
  const wood = woodTexture([255, 214, 243], [224, 120, 196], 0.5); // pink-lacquered
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
    doorway: new THREE.MeshStandardMaterial({ color: '#120530', roughness: 1 }),
    plaque: new THREE.MeshPhysicalMaterial({
      map: wood,
      roughness: 0.5,
      clearcoat: 0.85, // a deep lacquer: the lamps leave a soft highlight on it
      clearcoatRoughness: 0.16,
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

  await breathe(); // the procedural textures above take a moment

  const fx = { cones: [], dust: null, dustBase: null, dustSeed: null };
  let exposureK = 1; // setExposure(): the transition "turns the spots on"

  function currentTheme() {
    return THEMES[settings.theme] ?? THEMES.evening;
  }

  function applyTheme() {
    const t = currentTheme();
    root.dataset.theme = THEMES[settings.theme] ? settings.theme : 'evening';
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
    renderer.toneMappingExposure = t.exposure * exposureK;
    renderer.shadowMap.needsUpdate = true;
  }

  // Sunset and night over the room (sunset.js): 0, 0 is the theme exactly
  const MOOD = {
    spot: new THREE.Color('#fff4ec'), // the picture spots' own colour
    beam: new THREE.Color('#ffe2bf'),
    dusk: new THREE.Color('#ff6a2b'),
    night: new THREE.Color('#3a4bff'),
    nightBg: new THREE.Color('#07031a'),
  };
  const _mood = new THREE.Color();
  function setMood(dusk = 0, night = 0) {
    const t = currentTheme();
    _mood.copy(MOOD.spot).lerp(MOOD.dusk, dusk * 0.85).lerp(MOOD.night, night * 0.7);
    spots.forEach((s) => {
      s.color.copy(_mood);
      s.intensity = t.spot * (1 + 0.15 * dusk) * (1 - 0.65 * night);
    });
    mats.beam.color.copy(MOOD.beam).lerp(MOOD.dusk, dusk * 0.8).lerp(MOOD.night, night * 0.6);
    hemi.intensity = t.hemi * (1 - 0.75 * night);
    scene.background.set(t.bg).lerp(MOOD.nightBg, night * 0.8);
    scene.fog.color.copy(scene.background);
  }

  // A secret that has taken the gallery over (journey.js): it gets every tap
  // and Esc, may move the camera on and may draw the frame itself
  let takeover = null;
  function takeOver(secret) {
    takeover = secret;
    drag.active = false;
    canvas.classList.remove('is-dragging', 'is-pointing', 'is-lean-target');
  }

  // What a painting's secret may reach of the room (secrets.js)
  const room = {
    root,
    works: list,
    renderer,
    mats,
    setMood,
    setLean: (on) => setLean(on),
    takeOver,
    setAway: (on) => root.classList.toggle('is-away', on), // hides the buttons, plaques and minimap
    reduced,
    loadArt: (id, size) => setupTextures().then(() => loadArt(id, size)),
    artUrl: (id, size) => setupTextures().then(() => artUrl(id, size, format)),
    freeTexture: (tex) => freeTexture(tex),
  };

  function applyFx() {
    const on = settings.fx !== 'off';
    root.dataset.fx = on ? 'on' : 'off';
    fx.cones.forEach((c) => (c.visible = on));
    if (fx.dust) fx.dust.visible = on;
  }

  // ---------------------------------------------------------------- frames
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

  function artPlane(w, h, z) {
    const material = new THREE.MeshStandardMaterial({ map: placeholder, roughness: 0.8 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.z = z;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Returns { group, width, height, artW, artH, artZ, material }: width/height are
  // the outer frame size, artW/artH/artZ the inner art plane (for rectAtRest).
  function buildFrame(aspect, style) {
    const h = Math.sqrt(ART_AREA / aspect);
    const w = h * aspect;
    const g = new THREE.Group();

    if (style === 'mat') {
      const m = 0.11 + 0.04 * Math.max(w, h); // passe-partout border
      const fw = 0.028; // frame width
      const mw = w + m * 2;
      const mh = h + m * 2;
      g.add(box(mw, mh, 0.02, mats.mat, 0, 0, 0.012));
      const art = artPlane(w, h, 0.0225);
      g.add(art);
      moulding(g, mw, mh, fw, 0.05, mats.black, 0.025);
      return { group: g, width: mw + fw * 2, height: mh + fw * 2, artW: w, artH: h, artZ: 0.0225, material: art.material };
    }

    if (style === 'float') {
      const gap = 0.018;
      const fw = 0.016;
      g.add(box(w + gap * 2, h + gap * 2, 0.008, mats.shadowGap, 0, 0, 0.004));
      g.add(box(w, h, 0.035, mats.canvasEdge, 0, 0, 0.03));
      const art = artPlane(w, h, 0.0476);
      g.add(art);
      moulding(g, w + gap * 2, h + gap * 2, fw, 0.058, mats.oak, 0.029);
      return {
        group: g,
        width: w + (gap + fw) * 2,
        height: h + (gap + fw) * 2,
        artW: w,
        artH: h,
        artZ: 0.0476,
        material: art.material,
      };
    }

    // 'bare': the photo already shows the frame
    g.add(box(w, h, 0.04, mats.black, 0, 0, 0.02));
    const art = artPlane(w, h, 0.0405);
    g.add(art);
    return { group: g, width: w, height: h, artW: w, artH: h, artZ: 0.0405, material: art.material };
  }

  // ---------------------------------------------------------------- the room
  // Three hanging walls in a U, entrance on the fourth side. `right` is the
  // direction a viewer facing the wall calls "right": the order in which the
  // paintings hang, and the way a swipe moves you.
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

  // Spread the paintings over left / back / right, evenly along each wall
  function planSlots(count) {
    const side = Math.floor(count / 3);
    const plan = [
      ['left', side],
      ['back', count - 2 * side],
      ['right', side],
    ];
    const slots = [];
    for (const [name, k] of plan) {
      if (!k) continue;
      const wall = WALLS[name];
      const usable = wall.length - CORNER * 2;
      const cell = usable / k;
      for (let i = 0; i < k; i++) slots.push({ wall, s: -usable / 2 + cell * (i + 0.5) });
    }
    return slots;
  }

  const ENTRANCE = {
    stand: new THREE.Vector3(0, 1.62, ROOM.d / 2 - 1.4),
    look: new THREE.Vector3(0, 1.5, -ROOM.d / 2),
  };

  const frames = []; // { group, width, height, artW, artH, artZ, material, slot, centre, plaqueH }
  const hitTargets = [];
  let mirror = null;

  function wallMesh(w, h, material, uvScale = 2.5) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / uvScale, (uv.getY(i) * h) / uvScale);
    const m = new THREE.Mesh(geo, material);
    m.receiveShadow = true;
    return m;
  }

  const mirrorSize = () => {
    const pr = renderer.getPixelRatio();
    return [Math.max(1, Math.round(view.w * pr * 0.5)), Math.max(1, Math.round(view.h * pr * 0.5))];
  };

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
    const [tw, th] = mirrorSize();
    mirror = new Reflector(new THREE.PlaneGeometry(w, d), {
      textureWidth: tw,
      textureHeight: th,
      color: 0x9a9590,
      clipBias: 0.003,
    });
    mirror.rotation.x = -Math.PI / 2;
    scene.add(mirror);

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

  // ---------------------------------------------------------------- scene build
  // Frames are sized from art-meta.json, so the whole room exists (and rectAtRest
  // works) before a single photo has loaded.
  function buildScene() {
    const slots = planSlots(n);
    list.forEach((work, i) => {
      const meta = artMeta[work.id];
      const aspect = meta && meta.w > 0 && meta.h > 0 ? meta.w / meta.h : 0.78;
      const f = buildFrame(aspect, work.ramme);
      const slot = slots[i];
      f.slot = slot;
      f.centre = slot.wall.at(slot.s);
      f.plaqueH = 0;
      f.size = 0; // texture size on the wall: 0 (placeholder), 640, 1024 or 2048
      f.want = 0; // the size it is heading for
      f.thumb = null;
      f.ctrl = null; // AbortController of its download
      f.secret = SECRETS[work.id]?.({ id: work.id, material: f.material, aspect, frame: f, room }) ?? null;
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
      const normal = slot.wall.normal;
      const lampPos = f.centre.clone().addScaledVector(normal, 2);
      lampPos.y = ROOM.h - 0.1;
      const aim = f.centre.clone();
      aim.y -= 0.25;
      lamps.push({ pos: lampPos, aim });
      addFixture(lampPos, aim);

      const spot = new THREE.SpotLight('#fff4ec', THEMES.evening.spot, 10, 0.44, 0.7, 1.6);
      if (i < SHADOW_LIGHTS) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
        spot.shadow.bias = -0.0004;
        spot.shadow.normalBias = 0.02;
        spot.shadow.radius = 4;
      }
      scene.add(spot, spot.target);
      spots.push(spot);
    });

    buildRoom();
    assignLights(0);
  }

  // Put the shadow-casting lights on the lamps nearest painting `centre` and the
  // plain lights on the rest. Every lamp is always lit by exactly one light.
  let lightCentre = -1;
  function assignLights(centre) {
    if (centre === lightCentre || !lamps.length) return;
    lightCentre = centre;
    const byDistance = lamps.map((_, i) => i).sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre) || a - b);
    const near = byDistance.slice(0, SHADOW_LIGHTS).sort((a, b) => a - b);
    const far = byDistance.slice(SHADOW_LIGHTS).sort((a, b) => a - b);
    [...near, ...far].forEach((lampIndex, k) => {
      const spot = spots[k];
      const lamp = lamps[lampIndex];
      spot.position.copy(lamp.pos);
      spot.target.position.copy(lamp.aim);
    });
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------------------------------------------------------------- plaques
  // A lacquered slab on the wall (lit, casts a shadow) with the HTML text placed
  // on its face by the CSS3D renderer, so it stays crisp and clickable.
  const cssRenderer = new CSS3DRenderer();
  cssRenderer.domElement.className = 'galleri__plaques3d';
  canvas.after(cssRenderer.domElement);
  const cssScene = new THREE.Scene();
  const plaqueParts = []; // { slab, face }

  function buildPlaques(els, heights) {
    frames.forEach((f, i) => {
      const el = els[i];
      f.plaqueH = Math.max(heights[i] || 0, 40) * PLAQUE_SCALE;
      const y = EYE - f.height / 2 - PLAQUE_GAP - f.plaqueH / 2;
      const normal = f.slot.wall.normal;

      const slab = new THREE.Mesh(new RoundedBoxGeometry(PLAQUE_W, f.plaqueH, PLAQUE_DEPTH, 6, 0.012), mats.plaque);
      slab.position.copy(f.centre).addScaledVector(normal, PLAQUE_DEPTH / 2 + 0.002);
      slab.position.y = y;
      slab.rotation.y = f.slot.wall.rotY;
      slab.castShadow = true;
      slab.receiveShadow = true;
      scene.add(slab);

      const face = new CSS3DObject(el);
      face.position.copy(f.centre).addScaledVector(normal, PLAQUE_DEPTH + 0.0025);
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

  // KØB OG KONTAKT and I DIN STUE on a plaque. A finger presses the key in
  // too (touch screens have no hover, and :active is unreliable on iOS).
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.galleri-plaque__btn');
    if (!b) return;
    b.classList.add('is-pressed');
    const up = () => {
      b.classList.remove('is-pressed');
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-contact], [data-stue]');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.stue) emit('stue', { id: b.dataset.stue });
    else emit('contact', { id: b.dataset.contact });
  });

  // ---------------------------------------------------------------- the rail
  // One viewpoint per painting, joined by a smooth curve
  const rail = { curveS: null, curveL: null, seg: [], segments: 1 };
  const layout = () => (settings.plaques === 'on' ? LAYOUT.on : LAYOUT.off);
  const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

  // Distance and aim height that frame one painting's block on screen
  function compose(f) {
    const L = layout();
    const withPlaque = settings.plaques === 'on' && f.plaqueH;
    const h = withPlaque ? f.height + PLAQUE_GAP + f.plaqueH : f.height;
    const w = withPlaque ? Math.max(f.width, PLAQUE_W) : f.width;
    const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9;
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
      const normal = f.slot.wall.normal;
      L.push(new THREE.Vector3(f.centre.x, lookY, f.centre.z));
      S.push(new THREE.Vector3(f.centre.x + normal.x * dist, lookY + 0.22, f.centre.z + normal.z * dist));
    });
    const along = frames.length ? frames[frames.length - 1].slot.wall.right : new THREE.Vector3(0, 0, -1);
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

  // ---------------------------------------------------------------- camera rig
  const state = {
    index: 0,
    target: 0, // u the body is heading for (follows the finger while dragging)
    body: { x: -1, v: 0 },
    look: { x: -1, v: 0 },
    lean: { x: 0, v: 0 }, // 0 = standing back, 1 = leaning in to the painting
    leanGoal: 0,
    zoom: { x: 1, v: 0 }, // pinch magnification on top of the lean (1 = painting fits)
    zoomGoal: 1,
    pan: { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } }, // metres across the painting while zoomed
    panGoal: new THREE.Vector2(),
    intro: false,
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
  const _zero2 = new THREE.Vector2();
  const _leanAt = new THREE.Vector3();
  const _pan = { x: 0, y: 0 };

  // Distance (from the wall) at which the painting itself, without frame or
  // passepartout, fills LEAN_FILL of the screen
  function leanDist(f) {
    const aspect = camera.aspect > 0 && Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9;
    const t = tanHalf();
    return f.artZ + Math.max(f.artH / (LEAN_FILL * 2 * t), f.artW / (LEAN_FILL * 2 * t * aspect));
  }
  // While zoomed, the view may wander over the painting but not off its edges
  function clampPan(f, d, x, y) {
    const t = tanHalf();
    const hw = d * t * camera.aspect;
    const hh = d * t;
    const mx = Math.max(0, f.artW / 2 - hw * LEAN_FILL);
    const my = Math.max(0, f.artH / 2 - hh * LEAN_FILL);
    _pan.x = clamp(x, -mx, mx);
    _pan.y = clamp(y, -my, my);
    return _pan;
  }

  function spring(s, goal, { k, c }, dt, soft = 1) {
    const a = -k * soft * (s.x - goal) - c * Math.sqrt(soft) * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
  }

  function snapRig() {
    state.target = state.body.x = state.look.x = state.index;
    state.body.v = state.look.v = state.lean.v = 0;
    state.lean.x = state.leanGoal;
    state.zoom.x = state.zoomGoal;
    state.pan.x.x = state.panGoal.x;
    state.pan.y.x = state.panGoal.y;
    state.zoom.v = state.pan.x.v = state.pan.y.v = 0;
    state.intro = false;
    state.speed = 0;
    if (rail.curveS) railPoint(state.body.x, rail.curveS, state.prevPos);
  }

  function updateRig(dt) {
    if (!rail.curveS) return;
    const soft = state.intro ? INTRO_SOFTNESS : 1;
    if (reduced() && !drag.active) {
      snapRig();
    } else if (dt > 0) {
      // Fixed small substeps keep the springs stable on slow frames
      const steps = Math.ceil(dt / (1 / 240));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        spring(state.body, state.target, BODY, h, soft);
        spring(state.look, state.target, LOOK, h, soft);
        spring(state.lean, state.leanGoal, LEAN, h);
        spring(state.zoom, state.zoomGoal, ZOOM, h);
        spring(state.pan.x, state.panGoal.x, ZOOM, h);
        spring(state.pan.y, state.panGoal.y, ZOOM, h);
      }
      if (state.intro && Math.abs(state.body.x - state.target) < 0.004 && Math.abs(state.body.v) < 0.01) {
        state.intro = false;
      }
    }

    railPoint(state.body.x, rail.curveS, _pos);
    railPoint(state.look.x, rail.curveL, _look);
    assignLights(clamp(Math.round(state.body.x), 0, Math.max(0, lamps.length - 1)));

    // How fast are we walking?
    const inst = dt > 0 ? _pos.distanceTo(state.prevPos) / dt : 0;
    state.prevPos.copy(_pos);
    state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 8));
    const speed = reduced() ? 0 : state.speed;

    _fwd.subVectors(_look, _pos);
    state.viewDist = _fwd.length();
    _fwd.normalize();
    _right.crossVectors(_fwd, UP).normalize();

    // Lean in to see the brushwork, eyes on the painting itself (the plaque
    // drops out of view): square in front of it, as close as lets the whole
    // painting fit the screen, closer still by the pinch zoom
    if (state.lean.x > 1e-4 && frames[state.index]) {
      const f = frames[state.index];
      const k = state.lean.x;
      const n = f.slot.wall.normal;
      const d = f.artZ + (leanDist(f) - f.artZ) / Math.max(1, state.zoom.x);
      const pan = clampPan(f, d, state.pan.x.x, state.pan.y.x);
      const r = f.slot.wall.right;
      _leanAt.set(f.centre.x + r.x * pan.x, EYE + pan.y, f.centre.z + r.z * pan.x);
      _look.lerp(_leanAt, k);
      _pos.lerp(_leanAt.addScaledVector(n, d), k);
      _fwd.subVectors(_look, _pos).normalize();
      _right.crossVectors(_fwd, UP).normalize();
    }
    // Step back a touch while walking: reads as moving past the wall
    _pos.addScaledVector(_fwd, -Math.min(speed * 0.1, 0.6));
    // Footsteps: a small bounce per step and a sway side to side
    state.stride += ((speed * dt) / 0.72) * Math.PI * 2;
    const bob = Math.min(speed, 2.5) * 0.006;
    _pos.y += Math.sin(state.stride) * bob;
    _pos.addScaledVector(_right, Math.sin(state.stride / 2) * bob * 0.6);

    // Mouse parallax
    const k = reduced() ? 1 : 1 - Math.exp(-dt * 4);
    state.parallax.lerp(reduced() ? _zero2 : state.parallaxGoal, k);
    const px = state.parallax.x * 0.12;
    const py = state.parallax.y * 0.06;
    _pos.addScaledVector(_right, px);
    _pos.y += py;
    _look.addScaledVector(_right, px * 0.3);

    camera.position.copy(_pos);
    camera.lookAt(_look);

    // A secret may sway the head and make the view breathe (trip.js)
    const sway = reduced() ? null : frames[state.index]?.secret?.sway;
    const tripK = sway ? sway.amount : 0;
    if (tripK > 0) camera.rotateZ(Math.sin(sway.time * 0.37) * 0.035 * tripK);

    // The view widens slightly on the move
    const fov = FOV + Math.min(speed * 0.8, 3.5) + (tripK ? Math.sin(sway.time * 0.53) * 2.2 * tripK : 0);
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    takeover?.camera?.(camera);
  }

  // ---------------------------------------------------------------- minimap
  const mini = { el: ui.minimap, you: null, path: null, marks: [] };
  const mx = (x) => x.toFixed(2);
  const mz = (z) => (z + ROOM.d / 2).toFixed(2);

  function buildMinimap() {
    const { w, d } = ROOM;
    const padM = 0.8;
    const marks = frames
      .map((f, i) => {
        const { normal: nm, right: r } = f.slot.wall;
        const a = f.centre.clone().addScaledVector(r, -f.width / 2).addScaledVector(nm, 0.16);
        const b = f.centre.clone().addScaledVector(r, f.width / 2).addScaledVector(nm, 0.16);
        const coords = `x1="${mx(a.x)}" y1="${mz(a.z)}" x2="${mx(b.x)}" y2="${mz(b.z)}"`;
        return `<line class="galleri__minimap-hit" data-index="${i}" ${coords} /><line class="galleri__minimap-mark" ${coords} />`;
      })
      .join('');
    const W = mx(w / 2);
    const Wn = mx(-w / 2);
    const D = mz(d / 2);
    mini.el.innerHTML = `<svg viewBox="${-w / 2 - padM} ${-padM} ${w + padM * 2} ${d + padM * 2}" aria-hidden="true">
      <path class="galleri__minimap-walls" d="M ${Wn} ${D} L ${Wn} 0 L ${W} 0 L ${W} ${D} L 0.9 ${D} M -0.9 ${D} L ${Wn} ${D}" />
      <rect class="galleri__minimap-bench" x="-0.85" y="${mz(0.6 - 0.225)}" width="1.7" height="0.45" rx="0.1" />
      <polyline class="galleri__minimap-path" points="" />
      ${marks}
      <g class="galleri__minimap-you"><path class="galleri__minimap-view" d="M 0 0 L -1.3 -2.4 A 2.7 2.7 0 0 1 1.3 -2.4 Z" /><circle r="0.3" /></g>
    </svg>`;
    mini.you = mini.el.querySelector('.galleri__minimap-you');
    mini.path = mini.el.querySelector('.galleri__minimap-path');
    mini.marks = [...mini.el.querySelectorAll('.galleri__minimap-mark')];
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
    if (!mini.path || !rail.curveS || frames.length < 2) return;
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

  // ---------------------------------------------------------------- navigation
  function goTo(i) {
    if (!frames.length) return;
    const next = clamp(Math.round(i), 0, frames.length - 1);
    const changed = next !== state.index;
    state.index = next;
    state.target = next;
    state.intro = false;
    setLean(false);
    focusTextures(next);
    if (reduced()) snapRig();
    renderUI(changed);
    if (changed) emit('index', { index: next });
  }

  function step(dir) {
    goTo(state.index + dir);
    hideHint();
  }

  function setLean(on) {
    state.leanGoal = on ? 1 : 0;
    if (!on) {
      state.zoomGoal = 1;
      state.panGoal.set(0, 0);
    }
    if (!on) frames.forEach((f) => f.secret?.leave?.());
    canvas.classList.toggle('is-leaning', on);
    if (reduced()) snapRig();
  }

  let captionTimer;
  function renderUI(changed = true) {
    ui.current.textContent = pad(state.index + 1);
    ui.fill.style.transform = `scaleX(${frames.length ? (state.index + 1) / frames.length : 0})`;
    ui.prev.disabled = state.index === 0;
    ui.next.disabled = state.index >= frames.length - 1;
    renderMinimapActive();
    if (!changed && ui.caption.textContent) return;
    ui.caption.classList.add('is-changing');
    clearTimeout(captionTimer);
    captionTimer = setTimeout(() => {
      ui.caption.textContent = list[state.index]?.titel ?? '';
      ui.caption.classList.remove('is-changing');
    }, 220);
    const work = list[state.index];
    if (work) ui.announce(STRINGS.announce(work.titel, state.index + 1, frames.length));
  }

  let hintTimer;
  let hintShown = false;
  function showHint() {
    if (hintShown) return;
    hintShown = true;
    ui.hint.classList.remove('is-hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 7000);
  }
  function hideHint() {
    ui.hint.classList.add('is-hidden');
    clearTimeout(hintTimer);
  }

  ui.prev.addEventListener('click', () => step(-1));
  ui.next.addEventListener('click', () => step(1));
  ui.back.addEventListener('click', () => emit('exit'));

  function onKey(e) {
    if (takeover) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        takeover.tap(null, { leaned: true });
      }
      return;
    }
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    // Keys belong to whatever dialog the page has open over the room (e.g. the contact sheet)
    const t = e.target;
    if (t && t !== document.body && t !== document.documentElement && t !== root && !root.contains(t)) return;
    if (e.key === 'Escape') {
      if (ui.settings.isOpen()) ui.settings.close({ restoreFocus: true });
      else if (state.leanGoal) setLean(false);
      else emit('exit');
      return;
    }
    if (ui.settings.isOpen()) return;
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  }

  addEventListener('settings:change', (e) => {
    ui.settings.render();
    if (e.detail.key === 'theme') applyTheme();
    if (e.detail.key === 'fx') applyFx();
    if (e.detail.key === 'plaques') {
      applyPlaqueVisibility();
      if (frames.length) buildRail();
    }
    if (e.detail.key === 'motion' && reduced()) snapRig();
  });

  // Trackpad / mouse wheel: one gesture = one painting
  let wheelLock = false;
  let wheelAccum = 0;
  let wheelIdle;
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (takeover) return;
      // Trackpad pinch (and ctrl + wheel): zoom into the painting
      if (e.ctrlKey && frames.length) {
        if (!state.leanGoal) {
          if (e.deltaY >= 0) return;
          setLean(true);
          hideHint();
        }
        const z = state.zoomGoal * Math.exp(-e.deltaY * 0.01);
        if (z < 0.9) setLean(false);
        else {
          state.zoomGoal = clamp(z, 1, ZOOM_MAX);
          setPanGoal(state.panGoal.x, state.panGoal.y);
        }
        return;
      }
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
  // Wheel over the chrome must not scroll the page behind the gallery
  root.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

  // ---------------------------------------------------------------- drag / swipe
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const drag = { active: false, id: null, startX: 0, startTarget: 0, lastX: 0, lastT: 0, vel: 0, moved: 0 };

  // Metres of wall per screen pixel at the current viewing distance
  function worldPerPixel() {
    return (2 * tanHalf() * state.viewDist * camera.aspect) / view.w;
  }

  let lastHit = null; // the raycast hit behind pick()'s answer
  function pick(clientX, clientY) {
    ndc.set(((clientX - view.left) / view.w) * 2 - 1, -((clientY - view.top) / view.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hitTargets, false)[0];
    lastHit = hit ?? null;
    return hit ? hit.object.userData.index : null;
  }

  // ---------------------------------------------------------------- pinch zoom
  // Two fingers on a painting lean in to it and zoom up to ZOOM_MAX; while
  // zoomed, one finger pans over the painting instead of walking. Pinching
  // back past the fitted view stands back up. Ctrl + wheel (a trackpad pinch)
  // does the same on a computer.
  const touches = new Map(); // pointerId → { x, y }
  const pinch = { active: false, dist: 0, zoom: 1, cx: 0, cy: 0, pan: new THREE.Vector2() };
  const pinchSpan = () => {
    const [a, b] = [...touches.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  // Metres on the painting per screen pixel at the current zoom
  const paintPerPixel = () => {
    const f = frames[state.index];
    return f ? (2 * tanHalf() * (leanDist(f) / Math.max(1, state.zoomGoal))) / view.h : 0;
  };
  function startPinch() {
    const { d, cx, cy } = pinchSpan();
    Object.assign(pinch, { active: true, dist: Math.max(d, 1), zoom: state.leanGoal ? state.zoomGoal : 1, cx, cy });
    pinch.pan.copy(state.panGoal);
    drag.active = false;
    canvas.classList.remove('is-dragging');
    hideHint();
    if (!state.leanGoal) {
      goTo(Math.round(clamp(state.target, 0, frames.length - 1)));
      setLean(true);
    }
  }
  function movePinch() {
    const { d, cx, cy } = pinchSpan();
    const z = (pinch.zoom * d) / pinch.dist;
    if (z < 0.8 && pinch.zoom <= 1.05) {
      // pinched in from the fitted view: stand back
      pinch.active = false;
      setLean(false);
      return;
    }
    state.zoomGoal = clamp(z, 1, ZOOM_MAX);
    const m = paintPerPixel();
    setPanGoal(pinch.pan.x - (cx - pinch.cx) * m, pinch.pan.y + (cy - pinch.cy) * m);
  }
  function setPanGoal(x, y) {
    const f = frames[state.index];
    if (!f) return;
    const p = clampPan(f, leanDist(f) / Math.max(1, state.zoomGoal), x, y);
    state.panGoal.set(p.x, p.y);
  }
  const zoomed = () => state.leanGoal === 1 && state.zoomGoal > 1.02;

  canvas.addEventListener('pointerdown', (e) => {
    if (!frames.length || takeover) return;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        startPinch();
        return;
      }
      if (touches.size > 2) return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer that is already gone */
    }
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
      startY: e.clientY,
      startPan: state.panGoal.clone(),
      panning: zoomed(),
    });
  });

  canvas.addEventListener('pointermove', (e) => {
    if (takeover) return;
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.active) {
        if (touches.size === 2) movePinch();
        return;
      }
    }
    if (e.pointerType === 'mouse') {
      state.parallaxGoal.set(((e.clientX - view.left) / view.w) * 2 - 1, -(((e.clientY - view.top) / view.h) * 2 - 1));
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
    // Zoomed in: one finger (or the mouse) moves over the painting
    if (drag.panning) {
      const dy = e.clientY - drag.startY;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const m = paintPerPixel();
      setPanGoal(drag.startPan.x - dx * m, drag.startPan.y + dy * m);
      return;
    }
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

  function endTouch(e) {
    if (!touches.delete(e.pointerId)) return;
    if (pinch.active && touches.size < 2) {
      pinch.active = false;
      if (state.zoomGoal < 1.05) state.zoomGoal = 1;
      // the finger left on the glass carries on panning, not walking
      const rest = [...touches.entries()][0];
      if (rest && state.leanGoal) {
        Object.assign(drag, { active: true, id: rest[0], startX: rest[1].x, startY: rest[1].y, startPan: state.panGoal.clone(), panning: true, moved: 99 });
      }
    }
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    canvas.classList.remove('is-dragging');
    // a pan ends where it is; a tap while zoomed is a tap like any other
    if (drag.panning && drag.moved > 4) return;

    // A tap, not a swipe: walk to the painting tapped, or lean in to this one
    if (drag.moved <= 4) {
      const i = pick(e.clientX, e.clientY);
      if (i === null) goTo(state.index);
      else if (i !== state.index) {
        goTo(i);
        hideHint();
      } else {
        // A painting with a secret (secrets.js) may take the tap for itself
        if (!frames[i].secret?.tap(lastHit, { leaned: state.leanGoal === 1 })) setLean(!state.leanGoal);
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
  // While a secret has the gallery, a tap anywhere is for it (the tap that
  // started it lands here too, and is ignored by it)
  canvas.addEventListener('pointerup', (e) => {
    if (takeover && e.isPrimary !== false) takeover.tap(null, { leaned: true });
  });
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => state.parallaxGoal.set(0, 0));

  // ---------------------------------------------------------------- resize + loop
  let shown = false;
  let running = false;
  let rafId = 0;
  // Frame clock: dt is clamped so a slow frame never throws the springs
  const clock = { last: performance.now(), elapsed: 0 };
  function tickClock() {
    const now = performance.now();
    const dt = Math.min(Math.max(0, (now - clock.last) / 1000), 1 / 20);
    clock.last = now;
    clock.elapsed += dt;
    return dt;
  }

  function resize() {
    measureView();
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    renderer.setSize(view.w, view.h, false);
    cssRenderer.setSize(view.w, view.h);
    mirror?.getRenderTarget().setSize(...mirrorSize());
    if (frames.length) buildRail();
  }
  addEventListener('resize', () => {
    if (!innerWidth || !innerHeight) return; // a hidden tab reports 0 × 0
    resize();
  });
  // The root also changes size without a window resize: the page's scrollbar
  // disappears when the front page locks scrolling, and the fixed root grows
  // by its width. Keep the drawing buffer and the rail in step with it.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 0 && r.height > 0 && (Math.abs(r.width - view.w) > 0.5 || Math.abs(r.height - view.h) > 0.5)) resize();
    });
    ro.observe(root);
  }

  function render() {
    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
  }

  function frame() {
    if (!running) return;
    const dt = tickClock();
    for (const f of frames) f.secret?.update(dt, { slow: reduced() });
    updateRig(dt);
    drainSwaps();
    updateDust(clock.elapsed);
    updateMinimap();
    if (!takeover?.render?.()) render();
    rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (running || document.hidden) return;
    running = true;
    clock.last = performance.now(); // drop the time spent paused
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else if (shown) startLoop();
  });

  // ---------------------------------------------------------------- textures
  // Every painting gets its 640 px thumb first, for a fast first frame. Full
  // size (2048, or 1024 on small / low-DPR screens) only near where you stand:
  // the work in front of you and NEAR either side along the rail, the nearest
  // first; the rest upgrade as you walk up to them. On a small screen a work
  // more than FAR away drops back to its thumb, which caps GPU memory.
  //
  // The files come in the best format the browser decodes (art-format.js) and
  // are decoded off the main thread: fetch → createImageBitmap, already
  // flipped for WebGL. A browser whose createImageBitmap ignores its options
  // (older Safari) gets THREE.TextureLoader and <img> decoding instead.
  const NEAR = 2;
  const FAR = NEAR + 2;
  const PARALLEL = 3; // full-size downloads at a time
  const THUMB = 640;
  const texLoader = new THREE.TextureLoader();
  let format = 'jpg';
  let bitmaps = false;
  let texSetup = null;
  const setupTextures = () =>
    (texSetup ??= Promise.all([artFormat(), bitmapsWork()]).then(([f, b]) => {
      format = f;
      bitmaps = b;
    }));

  async function loadTexture(url, signal) {
    let tex;
    if (bitmaps) {
      const res = await fetch(url, { signal, credentials: 'same-origin' });
      if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { unusable: res.status === 404 });
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob, BITMAP_OPTIONS).catch((err) => {
        throw Object.assign(err, { unusable: true }); // fetched fine, but would not decode
      });
      tex = new THREE.Texture(bitmap);
      tex.flipY = false; // flipped while decoding: WebGL ignores UNPACK_FLIP_Y for bitmaps
    } else {
      // an <img> error does not say why: treat it as a file this browser cannot use
      tex = await texLoader.loadAsync(url).catch((err) => {
        throw Object.assign(new Error(`${url} kunne ikke indlæses`), { cause: err, unusable: true });
      });
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    tex.userData.url = url;
    try {
      await softMipmaps(tex);
    } catch (err) {
      freeTexture(tex);
      throw err;
    }
    tex.needsUpdate = true;
    return tex;
  }

  // The format test passed but this file would not decode (or is missing):
  // JPEG from now on, which every browser reads
  async function loadArt(id, size, signal) {
    try {
      return await loadTexture(artUrl(id, size, format), signal);
    } catch (err) {
      if (!err?.unusable || format === 'jpg') throw err; // a network hiccup is not the format's fault
      console.warn(`galleri: ${format} virker ikke her, skifter til jpg`, err);
      format = 'jpg';
      return loadTexture(artUrl(id, size, 'jpg'), signal);
    }
  }

  // GPU memory and the decoded pixels both go: dispose() frees the GPU copy,
  // close() the bitmaps (the base image and every mipmap level)
  function freeTexture(tex) {
    if (!tex || tex === placeholder) return;
    tex.dispose();
    for (const level of new Set([tex.image, ...(tex.mipmaps || [])])) level?.close?.();
    tex.mipmaps = [];
  }

  let loadedCount = 0;
  let loadTotal = 0;
  let readySent = false;
  let failedToast = false;
  function progress(step = 1) {
    loadedCount += step;
    if (!readySent) ui.setProgress(loadedCount / Math.max(1, loadTotal));
  }

  // A frame's thumb texture stays alive all the time: while full size shows,
  // only its GPU copy is freed, and dropping back re-uploads it from the bitmap.
  function setArt(f, tex, size) {
    const old = f.material.map;
    f.material.map = tex;
    f.size = size;
    if (old === f.thumb) old.dispose();
    else if (old !== tex) freeTexture(old);
  }

  // The GPU builds mipmaps by plain 2 × 2 averaging. A painting with a fine,
  // regular texture (Lilla skyer's coarse weave board) then turns into bands
  // of moiré as soon as it is seen from a step back, i.e. at every resting
  // view, while leaning in (level 0) stays sharp. Build the chain here
  // instead, with a slight blur before each halving, which keeps the weave
  // from folding into stripes. Browsers without canvas filters (Safari) get
  // the same plain halving the GPU would do. It runs as a texture arrives,
  // so the frame that swaps it in only uploads.
  const canBlur = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
  async function softMipmaps(tex) {
    const image = tex.image;
    if (!image?.width || tex.mipmaps?.length) return;
    const levels = [image];
    let src = image;
    let w = image.width;
    let h = image.height;
    while (w > 1 || h > 1) {
      let from = src;
      if (canBlur && Math.min(w, h) > 4) {
        const blur = document.createElement('canvas');
        blur.width = w;
        blur.height = h;
        const b = blur.getContext('2d');
        b.filter = 'blur(0.8px)';
        b.drawImage(src, 0, 0, w, h);
        from = blur;
      }
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(from, 0, 0, w, h);
      if (from !== src && from !== image) from.width = from.height = 0;
      levels.push(c);
      src = c;
    }
    // three sets the unpack flags (flipY…) only when the base image is not a
    // bitmap, so a bitmap texture needs bitmap levels too, or they would land
    // upside down. The levels were drawn from the flipped bitmap: no flip.
    if (isBitmap(image)) {
      const canvases = levels.slice(1);
      const made = await Promise.allSettled(canvases.map((c) => createImageBitmap(c)));
      canvases.forEach((c) => (c.width = c.height = 0));
      const failed = made.find((r) => r.status === 'rejected');
      if (failed) {
        made.forEach((r) => r.value?.close());
        throw failed.reason;
      }
      levels.splice(1, Infinity, ...made.map((r) => r.value));
    }
    tex.mipmaps = levels;
    tex.generateMipmaps = false;
  }

  // A full-size upload costs 10–90 ms on the next render. Let them land one
  // per frame while the camera rests, never during the walk-in or a swipe,
  // and the painting you are standing at always first.
  const pendingSwaps = [];
  function queueSwap(f, tex, size) {
    dropSwap(f);
    pendingSwaps.push({ f, tex, size });
  }
  function dropSwap(f) {
    for (let k = pendingSwaps.length - 1; k >= 0; k--) {
      if (pendingSwaps[k].f !== f) continue;
      const [{ tex }] = pendingSwaps.splice(k, 1);
      if (tex !== f.thumb) freeTexture(tex);
    }
  }
  function drainSwaps() {
    if (!pendingSwaps.length || state.intro || state.speed > 0.05) return;
    const k = Math.max(0, pendingSwaps.findIndex((s) => s.f === frames[state.index]));
    const [{ f, tex, size }] = pendingSwaps.splice(k, 1);
    setArt(f, tex, size);
  }
  function onLoadError(err) {
    console.warn('galleri: billede kunne ikke hentes', err?.target?.src ?? err);
    if (!failedToast) {
      failedToast = true;
      ui.toast(STRINGS.imageFailed);
    }
  }

  // On a small screen the room makes do with 1024 px textures, but leaning in
  // to a painting on a phone puts it ~1000 device px wide on screen. The work
  // you stand at (and the last two you visited) get the 2048 px file instead.
  const FOCUS_SIZE = 2048;
  const SHARP_KEEP = 3;
  const sharpened = []; // most recent last

  // The size each frame should show now. f.size is what it shows, f.want what
  // it is heading for (a download in flight or waiting, or a swap in the queue).
  function wanted(i) {
    const f = frames[i];
    const d = Math.abs(i - state.index);
    if (smallScreen && d > FAR) return f.thumb ? THUMB : f.size;
    if (sharpened.includes(i)) return FOCUS_SIZE;
    if (d <= NEAR) return FULL_SIZE;
    return f.size; // farther away: keep what it has, start nothing new
  }

  const waiting = new Set(); // frame indices whose download has not started
  let active = 0;
  let texturesOn = false; // set by the first show(): nothing full-size loads before

  // Forget an upgrade that is no longer wanted: the download (aborted if it
  // runs) and a texture waiting to be swapped in
  function cancel(i) {
    const f = frames[i];
    waiting.delete(i);
    f.ctrl?.abort();
    f.ctrl = null;
    dropSwap(f);
    f.want = f.size;
  }

  function refreshTextures() {
    if (!texturesOn) return;
    frames.forEach((f, i) => {
      const size = wanted(i);
      if (size === f.want) return;
      cancel(i);
      if (size === f.size) return;
      f.want = size;
      if (size === THUMB) queueSwap(f, f.thumb, THUMB);
      else {
        waiting.add(i);
        if (!readySent) loadTotal++;
      }
    });
    pump();
  }

  // Start downloads, the frame nearest to where you stand first. Until the
  // thumbs are in, only the painting in front of you loads alongside them.
  function pump() {
    while (active < PARALLEL && waiting.size) {
      let next = -1;
      for (const i of waiting) if (next < 0 || Math.abs(i - state.index) < Math.abs(next - state.index)) next = i;
      if (!thumbsDone && next !== state.index) break;
      waiting.delete(next);
      start(next);
    }
    if (!readySent && thumbsDone && !active && !waiting.size) {
      readySent = true;
      ui.progressDone();
      emit('ready');
    }
  }

  function start(i) {
    const f = frames[i];
    const size = f.want;
    const ctrl = new AbortController();
    f.ctrl = ctrl;
    active++;
    loadArt(list[i].id, size, ctrl.signal)
      .then(
        (tex) => {
          if (f.ctrl !== ctrl || f.want !== size) return freeTexture(tex); // overtaken meanwhile
          queueSwap(f, tex, size);
        },
        (err) => {
          if (f.ctrl !== ctrl) return; // cancelled
          f.want = f.size; // may be asked for again
          onLoadError(err);
        },
      )
      .finally(() => {
        if (f.ctrl === ctrl) f.ctrl = null;
        active--;
        progress();
        pump();
      });
  }

  // You arrived at painting i: it (and the last two, on a small screen) gets
  // the sharpest file, and the window of full sizes moves with you
  function focusTextures(i) {
    if (!frames[i]) return;
    if (FULL_SIZE < FOCUS_SIZE) {
      const at = sharpened.indexOf(i);
      if (at >= 0) sharpened.splice(at, 1);
      sharpened.push(i);
      while (sharpened.length > SHARP_KEEP) sharpened.shift();
    }
    refreshTextures();
  }

  let thumbsPromise = null;
  let thumbsDone = false;
  function loadThumbs() {
    thumbsPromise ??= setupTextures().then(() => {
      loadTotal += frames.length;
      return Promise.all(
        frames.map(async (f, i) => {
          try {
            const tex = await loadArt(list[i].id, THUMB);
            f.thumb = tex;
            if (f.material.map === placeholder) {
              setArt(f, tex, THUMB);
              if (!f.want) f.want = THUMB;
            }
          } catch (err) {
            onLoadError(err);
          }
          progress();
        }),
      ).then(() => {
        thumbsDone = true;
        pump();
      });
    });
    return thumbsPromise;
  }

  // The URL of the photo the painting in front of you shows now (for a ghost
  // that flies off the wall), or null while it still shows the placeholder
  function currentSrc() {
    return frames[state.index]?.material.map?.userData.url || null;
  }

  // ---------------------------------------------------------------- screen rects
  // Where the artwork (inner art plane, not the frame) of works[index] lands on
  // screen, in CSS pixels, for a camera resting in front of it.
  const _cam = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  const _c = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const CORNERS = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];

  function projectArt(f, cam) {
    const { normal: nm, right: r } = f.slot.wall;
    _c.copy(f.centre).addScaledVector(nm, f.artZ + 0.001);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [sx, sy] of CORNERS) {
      _p.copy(_c)
        .addScaledVector(r, (sx * f.artW) / 2)
        .addScaledVector(UP, (sy * f.artH) / 2)
        .project(cam);
      const x = view.left + ((_p.x + 1) / 2) * view.w;
      const y = view.top + ((1 - _p.y) / 2) * view.h;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  function rectAtRest(index) {
    if (!frames.length || !rail.curveS) return ZERO_RECT();
    const i = clamp(Math.round(index), 0, frames.length - 1);
    _cam.aspect = camera.aspect;
    _cam.fov = FOV;
    _cam.updateProjectionMatrix();
    railPoint(i, rail.curveS, _cam.position);
    railPoint(i, rail.curveL, _look);
    _cam.lookAt(_look);
    _cam.updateMatrixWorld(true);
    return projectArt(frames[i], _cam);
  }

  function currentRect() {
    if (!frames.length) return ZERO_RECT();
    camera.updateMatrixWorld(true);
    return projectArt(frames[state.index], camera);
  }

  // ---------------------------------------------------------------- show / hide
  async function show({ index = 0, intro = false } = {}) {
    root.hidden = false;
    if (!shown) {
      shown = true;
      addEventListener('keydown', onKey);
    }
    resize();

    if (intro && !reduced() && frames.length) {
      // Walk in from the doorway to the first painting
      state.index = 0;
      state.target = 0;
      state.leanGoal = 0;
      state.lean.x = state.lean.v = 0;
      state.body.x = state.look.x = -1;
      state.body.v = state.look.v = 0;
      state.intro = true;
      state.speed = 0;
      railPoint(-1, rail.curveS, state.prevPos);
      canvas.classList.remove('is-leaning');
    } else {
      state.index = frames.length ? clamp(Math.round(index), 0, frames.length - 1) : 0;
      state.leanGoal = 0;
      canvas.classList.remove('is-leaning');
      snapRig();
    }
    state.parallax.set(0, 0);
    state.parallaxGoal.set(0, 0);
    renderUI(true);

    await setupTextures();
    texturesOn = true;
    focusTextures(state.index); // its full size starts now, alongside the thumbs
    await loadThumbs();
    if (!shown) return; // hide() was called while the thumbs were loading

    // First frame right away, then the loop takes over
    updateRig(0);
    updateMinimap();
    render();
    startLoop();
    showHint();
  }

  function hide() {
    root.hidden = true;
    if (shown) {
      shown = false;
      removeEventListener('keydown', onKey);
    }
    stopLoop();
    ui.settings.close();
    hideHint();
    drag.active = false;
    canvas.classList.remove('is-dragging', 'is-pointing', 'is-lean-target');
    frames.forEach((f) => f.secret?.reset());
  }

  function setExposure(k) {
    exposureK = clamp(Number.isFinite(k) ? k : 1, 0, 1);
    renderer.toneMappingExposure = currentTheme().exposure * exposureK;
  }

  // ---------------------------------------------------------------- build
  buildScene();
  await breathe();
  const plaqueEls = createPlaques(list);
  const heights = await measurePlaques(plaqueEls);
  buildPlaques(plaqueEls, heights);
  applyTheme();
  applyPlaqueVisibility();
  applyFx();
  resize(); // builds the rail for the current viewport
  buildMinimap();
  snapRig();
  await breathe();
  // Warm up while still hidden: compile the shaders (in parallel, where the
  // GPU driver can) and render the shadow maps once, so the first visible
  // frame does not stall.
  try {
    updateRig(0);
    await renderer.compileAsync(scene, camera);
    await breathe();
    render();
  } catch (err) {
    console.warn('galleri: warm-up render failed', err);
  }

  const gallery = {
    webgl: true,
    get index() {
      return state.index;
    },
    show,
    hide,
    goTo,
    on,
    off,
    rectAtRest,
    currentRect,
    currentSrc,
    setExposure,
    resize,
    toast: ui.toast,
    // Console hook for testing: __gallery.tick(2) advances the walk (and any
    // secret that is playing) by two seconds, then draws one frame
    tick(seconds = 1) {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        for (const f of frames) f.secret?.update(1 / 60, { slow: reduced() });
        updateRig(1 / 60);
      }
      updateMinimap();
      if (!takeover?.render?.()) render();
    },
    debug: { state, rail, frames, camera, renderer, scene, ROOM, view },
  };
  window.__gallery = gallery;
  return gallery;
}
