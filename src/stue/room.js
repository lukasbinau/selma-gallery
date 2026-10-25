// The room: a Scandinavian architect's house with a long wall of floor-to-
// ceiling glazing onto the back garden. Two places to hang a work: above the
// sofa in the living room, and above the sideboard by the dining table. The
// camera is a level "shift lens" (verticals stay vertical, as in architectural
// photography) whose framing adapts to the screen and to the controls over it.
// Rendering is on demand and progressive (see pipeline.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createPipeline, halton } from './pipeline.js';
import { createSky } from './sky.js';
import { createGarden } from './garden.js';
import * as F from './furniture.js';
import { buildWork } from './framing.js';
import { oakFloor, oakGrain, fabric, wool, plaster, toTexture, leafSprite, boxShadowSprite, makeCanvas, pnoise } from './textures.js';
import { wallpaperTextures } from './wallpapers.js';

export const ROOM = { x0: -2.9, x1: 2.9, z0: -4.6, z1: 4.6, h: 2.8 };
const WALL_T = 0.25;

// ------------------------------------------------------------------ views
// Both walls meet the glazing (x = x0) at a corner, and the work hangs close
// to that corner. The camera is placed like an interior photographer's: off to
// the side, `bearing` degrees off the wall's normal (away from the glass), so
// the painted wall runs into depth on one side of the picture and the glazing
// with the garden fills the other. How far back it stands depends on the work
// (see cameraFor): small works get a closer camera and a slightly longer lens.
export const VIEWS = [
  {
    id: 'stue',
    name: 'Stue',
    wallZ: ROOM.z0,
    facing: 1, // the wall faces +z
    artX: -1.72,
    furnitureTop: 0.84, // top of the sofa's back cushions
    maxW: 1.9,
    maxH: 1.4,
    bearing: 40,
    windowSide: -1, // the glazing is to the left in the picture
  },
  {
    id: 'spise',
    name: 'Spisestue',
    wallZ: ROOM.z1,
    facing: -1,
    artX: -2.1,
    furnitureTop: 0.72, // the sideboard's top
    maxW: 1.2,
    maxH: 1.15,
    bearing: 40,
    windowSide: 1, // glazing to the right
  },
];
export const viewById = (id) => VIEWS.find((v) => v.id === id) || VIEWS[0];

/** Views the work (outer size in metres) fits, and the one it suits best. */
export function viewsFor(outer) {
  const fits = VIEWS.filter((v) => outer.w <= v.maxW && outer.h <= v.maxH);
  const list = fits.length ? fits : [VIEWS[0]];
  const big = Math.max(outer.w, outer.h) >= 0.56;
  const best = list.find((v) => v.id === (big ? 'stue' : 'spise')) || list[0];
  return { list, best };
}

// Hanging height above furniture: the frame's bottom edge 20 cm above the sofa
// back or the sideboard (as interior stylists hang it), but the centre never
// above eye level (1.45 m) unless the work is too tall for that.
function hangCentre(view, outer) {
  const above = view.furnitureTop + 0.2 + outer.h / 2;
  return Math.min(Math.max(above, 1.12), ROOM.h - 0.28 - outer.h / 2);
}

// ------------------------------------------------------------------ times of day
// sun: direction towards the sun (the glazing faces -x), colour, strength.
// sky: gradient for the sky dome. skyLight: daylight entering through the
// glazing. lamps: 0..1 interior lamps. env: strength of the room's bounce light
// (kept below 1: the room is captured from itself, so more would feed back).
export const TIMES = [
  {
    id: 'morgen',
    name: 'Morgen',
    sun: { dir: [-0.62, 0.3, 0.72], colour: '#ffd2a1', intensity: 10.5 },
    sky: { zenith: '#86a9d4', horizon: '#f1dcc6', ground: '#5d5a48', cloud: '#fff0e2', cover: 0.38, intensity: 1.5 },
    skyLight: { colour: '#c3d3ec', intensity: 4.4 },
    lamps: 0,
    env: 0.85,
    exposure: 3.6,
    glass: 0.55, // see mats.glassTint
    fog: '#e6dccf',
  },
  {
    id: 'dag',
    name: 'Dag',
    sun: { dir: [-0.5, 0.75, 0.42], colour: '#fff3e2', intensity: 13.0 },
    sky: { zenith: '#5f90cf', horizon: '#dde7f0', ground: '#5f5d4a', cloud: '#ffffff', cover: 0.32, intensity: 2.1 },
    skyLight: { colour: '#d0def2', intensity: 5.6 },
    lamps: 0,
    env: 0.85,
    exposure: 4.0,
    glass: 0.5, // see mats.glassTint
    fog: '#dfe6ec',
  },
  {
    id: 'aften',
    name: 'Aften',
    sun: { dir: [-0.78, 0.1, -0.62], colour: '#ffa868', intensity: 5.5 },
    sky: { zenith: '#4b5b8c', horizon: '#f5a26a', ground: '#3d3730', cloud: '#f6b089', cover: 0.45, intensity: 1.1 },
    skyLight: { colour: '#9fb0dc', intensity: 2.6 },
    lamps: 0.4,
    env: 0.75,
    exposure: 1.9,
    glass: 0.8, // see mats.glassTint
    fog: '#c99a7e',
  },
  {
    id: 'nat',
    name: 'Nat',
    sun: { dir: [-0.4, 0.55, 0.3], colour: '#8fa6d8', intensity: 0.3 },
    sky: { zenith: '#04060d', horizon: '#121a2c', ground: '#05060a', cloud: '#1a2236', cover: 0.25, intensity: 1, stars: 1.4 },
    skyLight: { colour: '#5c6d99', intensity: 0.12 },
    lamps: 1,
    env: 0.55,
    exposure: 1.4,
    glass: 1, // see mats.glassTint
    fog: '#0b1020',
  },
];
export const timeById = (id) => TIMES.find((t) => t.id === id) || TIMES[1];

// ------------------------------------------------------------------ helpers
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Box-projected UVs in metres from local positions and normals, so textures keep
// their real-world scale on any surface.
function boxUV(geo) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  if (!p || !n) return geo;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) {
      uv[i * 2] = p.getZ(i);
      uv[i * 2 + 1] = p.getY(i);
    } else if (az >= ay) {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getY(i);
    } else {
      uv[i * 2] = p.getX(i);
      uv[i * 2 + 1] = p.getZ(i);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function worldBox(x0, x1, y0, y1, z0, z1, material, { cast = true, receive = true } = {}) {
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  boxUV(geo);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const white1 = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

// ------------------------------------------------------------------ createRoom
export function createRoom({ canvas, overlay, mobile = false }) {
  const Q = {
    tex: mobile ? 512 : 1024,
    shadow: mobile ? 1024 : 2048,
    samples: mobile ? 20 : 48,
    msaa: mobile ? 0 : 4,
    leaves: mobile ? 0.55 : 1,
    env: mobile ? 128 : 256,
    dpr: Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2),
  };
  const sp = new URLSearchParams(location.search);
  if (sp.get('samples')) Q.samples = Math.max(1, +sp.get('samples'));
  // tuning knobs for the dev page: ?exp=&env=&sky=&sun=
  const K = { exp: +sp.get('exp') || 1, env: +sp.get('env') || 1, sky: +sp.get('sky') || 1, sun: +sp.get('sun') || 1 };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  if (!renderer.getContext()) throw new Error('no-webgl');
  renderer.setPixelRatio(1);
  // Neutral keeps the painting's own colours true; ?tm=agx|aces for comparison
  renderer.toneMapping = sp.get('tm') === 'agx' ? THREE.AgXToneMapping : sp.get('tm') === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pipeline = createPipeline(renderer, { samples: Q.samples, msaa: Q.msaa });

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#dfe6ec', 30, 170);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);

  // ---------------------------------------------------------------- textures
  const floorT = oakFloor(Q.tex);
  const tex = (c, srgb = true, repeat = 1) => {
    const t = toTexture(c, { srgb, aniso });
    t.repeat.set(repeat, repeat);
    return t;
  };
  const floorMap = tex(floorT.map, true, 1 / 2.4);
  const floorRough = tex(floorT.rough, false, 1 / 2.4);
  const floorNormal = tex(floorT.normal, false, 1 / 2.4);
  const oak = tex(oakGrain(512), true, 1);
  oak.repeat.set(1.2, 2.4);
  const oakDark = tex(oakGrain(512, { light: [150, 112, 80], dark: [92, 64, 44], seed: 4 }), true, 1);
  oakDark.repeat.set(1.2, 2.4);
  const boucle = fabric(256, { boucle: true });
  const linen = fabric(256, { boucle: false, seed: 9 });
  const boucleMap = tex(boucle.map, true, 1 / 0.22);
  const boucleNormal = tex(boucle.normal, false, 1 / 0.22);
  const linenMap = tex(linen.map, true, 1 / 0.18);
  const linenNormal = tex(linen.normal, false, 1 / 0.18);
  const woolT = wool(256);
  const woolMap = tex(woolT.map, true, 1 / 0.35);
  const woolNormal = tex(woolT.normal, false, 1 / 0.35);
  const plasterT = plaster(256);
  const plasterMap = tex(plasterT.map, true, 1 / 1.6);
  const plasterNormal = tex(plasterT.normal, false, 1 / 1.6);
  const canvasWeave = tex(fabric(128, { seed: 3 }).normal, false, 1 / 0.04);
  const contactShadow = boxShadowSprite(128, 0.35);

  // Fluted door fronts: vertical half-round grooves every 2 cm
  const flutes = (() => {
    const S = 128;
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[y * S + x] = Math.sqrt(Math.max(0, Math.sin(((x + 0.5) / S) * Math.PI * 8)));
    const c = makeCanvas(S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)]) * 3;
        const len = Math.hypot(dx, 1);
        const i = (y * S + x) * 4;
        img.data[i] = (-dx / len) * 127.5 + 127.5;
        img.data[i + 1] = 127.5;
        img.data[i + 2] = (1 / len) * 127.5 + 127.5;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c, { srgb: false, aniso });
    t.repeat.set(1 / 0.08, 1);
    return t;
  })();

  // Paper lantern: horizontal bamboo ribs in a warm paper
  const lanternMap = (() => {
    const c = makeCanvas(64, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#f6efe2';
    g.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 9) {
      g.fillStyle = 'rgba(150,120,80,0.55)';
      g.fillRect(0, y, 64, 1.5);
    }
    return toTexture(c, { aniso });
  })();

  // ---------------------------------------------------------------- materials
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const mats = {
    wall: std({ color: '#eeebe4', map: plasterMap, normalMap: plasterNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: white1, roughness: 0.92 }),
    woodwork: std({ color: '#f3f1ec', roughness: 0.42 }),
    ceiling: std({ color: '#f4f2ee', roughness: 0.95, map: plasterMap }),
    floor: std({ map: floorMap, roughnessMap: floorRough, normalMap: floorNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, color: '#ffffff' }),
    windowFrame: std({ color: '#2b2b2a', roughness: 0.45, metalness: 0.5 }),
    // Solar-control glazing: multiplies the view out by a cool grey (set per
    // time of day), so the garden keeps its colour beside a well-lit painting
    // instead of burning out, as a photographer's window exposure would
    glassTint: new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor }),
    glassReflect: std({ color: '#151515', roughness: 0.03, metalness: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    sofa: new THREE.MeshPhysicalMaterial({ color: '#d6cfc2', map: boucleMap, normalMap: boucleNormal, roughness: 0.96, sheen: 0.6, sheenRoughness: 0.75, sheenColor: '#fff8ee' }),
    accentFabric: [0, 1, 2].map(() => new THREE.MeshPhysicalMaterial({ color: '#c98f6b', map: linenMap, normalMap: linenNormal, roughness: 0.92, sheen: 0.4, sheenRoughness: 0.8, sheenColor: '#ffffff' })),
    throw: new THREE.MeshPhysicalMaterial({ color: '#8b9a7e', map: woolMap, normalMap: woolNormal, roughness: 0.95, sheen: 0.5, sheenRoughness: 0.8, sheenColor: '#ffffff' }),
    rug: std({ color: '#ddd5c6', map: woolMap, normalMap: woolNormal, roughness: 1 }),
    oak: std({ map: oak, color: '#f2e3cc', roughness: 0.55 }),
    oakFluted: std({ map: oak, color: '#f2e3cc', normalMap: flutes, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.55 }),
    ceramic: [0, 1, 2].map(() => std({ color: '#d8d2c6', roughness: 0.32 })),
    books: [0, 1, 2].map(() => std({ color: '#7f8f74', roughness: 0.75 })),
    pages: std({ color: '#efe8d8', roughness: 0.9 }),
    blackMetal: std({ color: '#1e1d1c', roughness: 0.38, metalness: 0.6 }),
    paperShade: std({ color: '#ffffff', map: lanternMap, roughness: 0.9, side: THREE.DoubleSide, emissive: '#ffcf96', emissiveMap: lanternMap, emissiveIntensity: 0 }),
    lampWhite: std({ color: '#efede8', roughness: 0.35 }),
    opal: std({ color: '#f4f1ea', roughness: 0.25, emissive: '#ffd6a0', emissiveIntensity: 0 }),
    pendantShade: std({ color: '#f1efea', roughness: 0.3, emissive: '#ffd09a', emissiveIntensity: 0 }),
    bulb: std({ color: '#fff8ea', emissive: '#ffdcae', emissiveIntensity: 0 }),
    planter: std({ color: '#b8b2a7', roughness: 0.88 }),
    basket: std({ color: '#b99d70', map: linenMap, normalMap: linenNormal, roughness: 0.9 }),
    bark: std({ color: '#6c6156', roughness: 0.9 }),
    twig: std({ color: '#4b4038', roughness: 0.85 }),
    soil: std({ color: '#3a2f27', roughness: 1 }),
    oliveLeaf: std({ map: leafSprite('olive'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 }),
    figLeaf: std({ map: leafSprite('fig'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45 }),
    chairSeat: std({ color: '#c9b28a', map: linenMap, normalMap: linenNormal, roughness: 0.9 }),
    downlight: std({ color: '#d9d9d9', emissive: '#fff1dc', emissiveIntensity: 0, roughness: 0.4 }),
    curtain: std({ color: '#f1ece2', map: linenMap, normalMap: linenNormal, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.9, emissive: '#ffffff', emissiveIntensity: 0 }),
    // the work
    art: std({ color: '#ffffff', roughness: 0.6, normalMap: canvasWeave, normalScale: new THREE.Vector2(0.15, 0.15) }),
    canvasEdge: std({ color: '#d8d0c2', roughness: 0.85 }),
    paperEdge: std({ color: '#f2eee5', roughness: 0.9 }),
    bareEdge: std({ color: '#1f1c19', roughness: 0.6 }),
    mat: std({ color: '#f6f4ee', roughness: 0.95 }),
    backing: std({ color: '#d9d4ca', roughness: 0.9 }),
    gap: std({ color: '#141312', roughness: 1 }),
    glass: std({ color: '#0c0c0c', roughness: 0.04, metalness: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    frame: std({ color: '#1d1c1b', roughness: 0.7 }),
    shadow: new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: contactShadow, transparent: true, opacity: 0.32, depthWrite: false }),
  };
  mats.glass.envMapIntensity = 0.9;
  mats.glassReflect.envMapIntensity = 1;

  // Placeholder art until the photo arrives (also keeps the shader stable)
  const artPlaceholder = new THREE.DataTexture(new Uint8Array([200, 194, 184, 255]), 1, 1);
  artPlaceholder.colorSpace = THREE.SRGBColorSpace;
  artPlaceholder.needsUpdate = true;
  mats.art.map = artPlaceholder;

  // ---------------------------------------------------------------- architecture
  const arch = new THREE.Group();
  scene.add(arch);
  const { x0, x1, z0, z1, h } = ROOM;
  arch.add(worldBox(x0 - WALL_T, x1 + WALL_T, -0.3, 0, z0 - WALL_T, z1 + WALL_T, mats.floor)); // floor slab
  arch.add(worldBox(x0 - 1.2, x1 + WALL_T, h, h + 0.3, z0 - WALL_T, z1 + WALL_T, mats.ceiling)); // roof with an overhang over the glazing
  // walls run up into the roof slab, so no light leaks along the ceiling line
  const hw = h + 0.15;
  arch.add(worldBox(x0 - WALL_T, x1 + WALL_T, 0, hw, z0 - WALL_T, z0, mats.wall)); // back wall (stue)
  arch.add(worldBox(x0 - WALL_T, x1 + WALL_T, 0, hw, z1, z1 + WALL_T, mats.wall)); // front wall (spise)
  arch.add(worldBox(x1, x1 + WALL_T, 0, hw, z0, z1, mats.wall)); // right wall
  // the glazing wall: short solid returns at each end, the rest glass
  const gz0 = z0 + 0.35;
  const gz1 = z1 - 0.35;
  arch.add(worldBox(x0 - WALL_T, x0, 0, hw, z0, gz0, mats.wall));
  arch.add(worldBox(x0 - WALL_T, x0, 0, hw, gz1, z1, mats.wall));
  // fascia under the roof's overhang
  arch.add(worldBox(x0 - 1.2, x0 - 1.12, h - 0.12, h + 0.3, z0 - WALL_T, z1 + WALL_T, mats.windowFrame));

  // window frames: slim black mullions, a head and a sill; glass set back mid-wall
  const gx = x0 - 0.1;
  const panels = 6;
  const pw = (gz1 - gz0) / panels;
  const fw = 0.05;
  arch.add(worldBox(gx - 0.04, gx + 0.04, 0, 0.04, gz0, gz1, mats.windowFrame));
  arch.add(worldBox(gx - 0.04, gx + 0.04, h - 0.06, h, gz0, gz1, mats.windowFrame));
  for (let i = 0; i <= panels; i++) {
    const z = gz0 + i * pw;
    arch.add(worldBox(gx - 0.04, gx + 0.04, 0, h, z - fw / 2, z + fw / 2, mats.windowFrame));
  }
  // window reveals lined in oak
  arch.add(worldBox(x0 - WALL_T + 0.02, x0, 0, 0.012, gz0, gz1, mats.oak, { cast: false }));
  const glassGeo = new THREE.PlaneGeometry(gz1 - gz0, h);
  const glassTint = new THREE.Mesh(glassGeo, mats.glassTint);
  glassTint.rotation.y = Math.PI / 2;
  glassTint.position.set(gx, h / 2, (gz0 + gz1) / 2);
  glassTint.renderOrder = 4;
  const glassRefl = new THREE.Mesh(glassGeo, mats.glassReflect);
  glassRefl.rotation.y = Math.PI / 2;
  glassRefl.position.set(gx + 0.002, h / 2, (gz0 + gz1) / 2);
  glassRefl.renderOrder = 5;
  arch.add(glassTint, glassRefl);

  // skirting boards (woodwork colour) on the three solid walls
  const sk = 0.075;
  arch.add(worldBox(x0, x1, 0, sk, z0, z0 + 0.012, mats.woodwork, { cast: false }));
  arch.add(worldBox(x0, x1, 0, sk, z1 - 0.012, z1, mats.woodwork, { cast: false }));
  arch.add(worldBox(x1 - 0.012, x1, 0, sk, z0, z1, mats.woodwork, { cast: false }));

  // recessed downlights in the ceiling
  const dlGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.01, 24);
  const downlights = [
    [VIEWS[0].artX, z0 + 0.95],
    [VIEWS[1].artX, z1 - 0.95],
    [-1.3, 0.2],
    [1.4, 0.2],
    [1.4, 2.4],
    [1.4, -2.2],
  ];
  downlights.forEach(([x, z]) => {
    const m = new THREE.Mesh(dlGeo, mats.downlight);
    m.position.set(x, h - 0.004, z);
    arch.add(m);
  });

  // sheer linen curtains, stacked at the middle mullion: the corners, where
  // the works hang, keep a clear view of the garden
  function curtain(zc, width) {
    const geo = new THREE.PlaneGeometry(width, h - 0.08, 64, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.sin((x / width) * Math.PI * 14) * 0.035 + Math.sin((x / width) * Math.PI * 5 + y * 0.6) * 0.012);
    }
    geo.computeVertexNormals();
    boxUV(geo);
    const m = new THREE.Mesh(geo, mats.curtain);
    m.rotation.y = Math.PI / 2;
    m.position.set(x0 + 0.12, (h - 0.08) / 2 + 0.01, zc);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  arch.add(curtain(-0.32, 0.55));
  arch.add(curtain(0.32, 0.55));
  // the curtain track
  arch.add(worldBox(x0 + 0.08, x0 + 0.16, h - 0.03, h, z0, z1, mats.lampWhite, { cast: false }));

  // ---------------------------------------------------------------- furniture
  const furn = new THREE.Group();
  scene.add(furn);
  const textured = (group) => {
    group.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh && o.material?.map && o.material.map.wrapS === THREE.RepeatWrapping && o.geometry.attributes.normal) {
        if (o.material === mats.art || o.material === mats.paperShade) return;
        o.geometry = boxUV(o.geometry.clone());
      }
    });
    return group;
  };
  const place = (obj, x, z, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = ry;
    furn.add(textured(obj));
    return obj;
  };

  // living room: the sofa centred under the work, close to the glazing; the
  // lamp, side table and olive tree on its far side, where the wall runs into
  // the picture
  const sx = VIEWS[0].artX;
  place(F.sofa(mats, null, { width: 2.0 }), sx, z0 + 0.95 / 2 + 0.05);
  const rug = new THREE.Mesh(boxUV(new RoundedBoxGeometry(2.4, 0.012, 3.0, 2, 0.005)), mats.rug);
  rug.position.set(sx + 0.15, 0.006, z0 + 1.85);
  rug.receiveShadow = true;
  furn.add(rug);
  place(F.coffeeTable(mats), sx + 0.1, z0 + 2.0);
  place(F.sideTable(mats), sx + 1.28, z0 + 0.36);
  const lantern = F.floorLantern(mats);
  place(lantern.group, sx + 1.9, z0 + 0.4);
  place(F.oliveTree(mats, { quality: Q.leaves }), sx + 2.85, z0 + 0.6);

  // dining room: the sideboard under the work, the table out in the room
  const bx = VIEWS[1].artX;
  const boardW = 1.3;
  place(F.sideboard(mats, { width: boardW }), bx, z1 - 0.225 - 0.03, Math.PI);
  // the vase at the far end, so its branches stay clear of a wide work
  const styling = F.sideboardStyling(mats, boardW, 0.15);
  styling.position.set(bx, 0.72, z1 - 0.24);
  styling.rotation.y = Math.PI;
  furn.add(textured(styling));
  const lamp = F.tableLamp(mats);
  place(lamp.group, bx - 0.45, z1 - 0.26);
  lamp.group.position.y = 0.72;
  const tableX = -1.4;
  const tableZ = 1.7;
  place(F.diningTable(mats), tableX, tableZ);
  [
    [tableX + 0.62, tableZ - 0.55, -Math.PI / 2],
    [tableX + 0.62, tableZ + 0.5, -Math.PI / 2],
    [tableX - 0.62, tableZ - 0.5, Math.PI / 2],
    [tableX - 0.62, tableZ + 0.5, Math.PI / 2],
  ].forEach(([x, z, r]) => place(F.chair(mats), x, z, r));
  const pend = F.pendant(mats, 0.95);
  pend.group.position.set(tableX, h, tableZ);
  furn.add(pend.group);
  place(F.figTree(mats, { quality: Q.leaves }), bx + 1.45, z1 - 0.45);

  // ---------------------------------------------------------------- garden + sky
  const sky = createSky();
  scene.add(sky);
  const garden = createGarden({ quality: Q.leaves, aniso });
  scene.add(garden.group);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight('#ffffff', '#8a7a68', 0.0);
  scene.add(hemi);

  const shadowBox = (light, size = 7) => {
    const c = light.shadow.camera;
    c.left = -size;
    c.right = size;
    c.top = size;
    c.bottom = -size;
    c.near = 1;
    c.far = 60;
    light.shadow.mapSize.set(Q.shadow, Q.shadow);
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.025;
  };
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  shadowBox(sun, 7.5);
  sun.shadow.radius = 2;
  sun.target.position.set(-1, 0.8, 0);
  scene.add(sun, sun.target);

  const skyLight = new THREE.DirectionalLight('#dfe8f5', 1);
  skyLight.castShadow = true;
  shadowBox(skyLight, 7);
  skyLight.shadow.radius = 4;
  skyLight.target.position.set(0, 0.8, 0);
  scene.add(skyLight, skyLight.target);

  // lamps
  const lanternLight = new THREE.PointLight('#ffd6a6', 0, 9, 2);
  lanternLight.position.copy(lantern.light).add(lantern.group.position);
  scene.add(lanternLight);
  const lampLight = new THREE.PointLight('#ffcf94', 0, 7, 2);
  lampLight.position.copy(lamp.light).add(lamp.group.position);
  scene.add(lampLight);
  const pendLight = new THREE.SpotLight('#ffd4a0', 0, 7, 1.0, 0.8, 2);
  pendLight.position.set(tableX, h - 0.95 - 0.12, tableZ);
  pendLight.target.position.set(tableX, 0, tableZ);
  scene.add(pendLight, pendLight.target);
  const pendGlow = new THREE.PointLight('#ffd4a0', 0, 5, 2);
  pendGlow.position.set(tableX, h - 0.75, tableZ);
  scene.add(pendGlow);
  // the picture light: a recessed spot aimed at the work
  const pictureSpot = new THREE.SpotLight('#fff0d8', 0, 8, 0.42, 0.75, 2);
  pictureSpot.castShadow = true;
  pictureSpot.shadow.mapSize.set(Q.shadow / 2, Q.shadow / 2);
  pictureSpot.shadow.bias = -0.0004;
  pictureSpot.shadow.radius = 3;
  scene.add(pictureSpot, pictureSpot.target);

  // ---------------------------------------------------------------- environment captures
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cubeRT = new THREE.WebGLCubeRenderTarget(Q.env, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.05, 400, cubeRT);
  cubeCam.position.set(0.2, 1.4, 0);
  let roomEnv = null;
  let skyEnv = null;
  const skyScene = new THREE.Scene();
  const skyClone = new THREE.Mesh(sky.geometry, sky.material);
  skyScene.add(skyClone);
  const groundDisc = new THREE.Mesh(new THREE.CircleGeometry(200, 32), new THREE.MeshBasicMaterial({ color: '#4c5a36' }));
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -1;
  skyScene.add(groundDisc);
  const skyCubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
  const skyCubeCam = new THREE.CubeCamera(0.1, 500, skyCubeRT);
  skyScene.add(skyCubeCam);

  // The sun's disc stays out of the captures: direct sun is the sun light's job,
  // and a blurred disc would wash every surface with false bounce light.
  function captureSky() {
    sky.material.uniforms.uDisc.value = 0;
    skyCubeCam.update(renderer, skyScene);
    sky.material.uniforms.uDisc.value = 1;
    const next = pmrem.fromCubemap(skyCubeRT.texture);
    skyEnv?.dispose();
    skyEnv = next;
    garden.setEnvironment(skyEnv.texture, 1);
  }
  function captureRoom() {
    const hidden = [glassTint, glassRefl];
    hidden.forEach((m) => (m.visible = false));
    sky.material.uniforms.uDisc.value = 0;
    cubeCam.update(renderer, scene);
    sky.material.uniforms.uDisc.value = 1;
    hidden.forEach((m) => (m.visible = true));
    const next = pmrem.fromCubemap(cubeRT.texture);
    roomEnv?.dispose();
    roomEnv = next;
    scene.environment = roomEnv.texture;
  }
  let envDirty = 2; // number of room captures still wanted (2 = also a bounce of a bounce)

  // ---------------------------------------------------------------- state
  const state = {
    view: VIEWS[0],
    time: TIMES[1],
    wall: null,
    work: null, // { group, outer, art, size }
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    exposureK: 1,
    sunBase: new THREE.Vector3(),
    skyDirs: [],
  };
  const view = { w: 1, h: 1 };

  // ---------------------------------------------------------------- camera (shift lens)
  // Returns { pos, yaw, tanV, sx, sy } for a view at rest, for the current
  // screen size and insets.
  //
  // The work is the hero: the camera stands on a line `bearing` degrees off
  // the wall's normal through the work's centre, as far back as gives the work
  // its share of the free band (the screen between the top bar and the panel).
  // The yaw puts the work to the side away from the glass, so the corner and
  // the garden take the rest of the picture. The camera stays level; the work
  // is moved up into the free band by shifting the lens, never by tilting.
  function cameraFor(v, work = state.work) {
    const W = view.w;
    const H = view.h;
    const aspect = W / H;
    const portrait = aspect < 1;
    const ins = state.insets;
    const fyTop = ins.top / H;
    const fyBot = 1 - ins.bottom / H;
    const band = Math.max(0.2, fyBot - fyTop);
    const outer = work ? work.outer : { w: 0.5, h: 0.7 };
    const cy = work ? work.centreY : 1.4;
    // 0 for an A4 sheet, 1 for a metre-wide canvas
    const size = THREE.MathUtils.clamp((Math.max(outer.w, outer.h) - 0.3) / 0.65, 0, 1);
    const lerp = THREE.MathUtils.lerp;
    // Lens: a slightly longer one for small works, a wider one on a tall phone
    // screen, where the width is all there is for the painting and the glass.
    const halfH = THREE.MathUtils.degToRad(portrait ? lerp(31, 34, size) : lerp(28, 33, size));
    const tanH = Math.tan(halfH);
    const tanV = tanH / aspect;
    // How much of the free band the work fills, and at most of the width
    const kH = portrait ? lerp(0.4, 0.5, size) : lerp(0.56, 0.66, size);
    const kW = portrait ? 0.27 : 0.36;
    // Where it sits: off centre, away from the glass; a little above the
    // middle of the band, so the furniture under it shows too
    const xp = -v.windowSide * (portrait ? 0.46 : 0.26);
    const fy = fyTop + band * 0.45;
    const eye = THREE.MathUtils.clamp(cy + 0.02, 1.2, 1.45);
    const b = THREE.MathUtils.degToRad(v.bearing);
    const dir = new THREE.Vector3(Math.sin(b), 0, v.facing * Math.cos(b)); // from the work out to the camera
    const C = new THREE.Vector3(v.artX, cy, v.wallZ);
    // the camera stays 0.3 m inside the room
    const dMax = Math.min((ROOM.x1 - 0.3 - v.artX) / dir.x, (ROOM.z1 - ROOM.z0 - 0.3) / Math.abs(dir.z));
    const pos = new THREE.Vector3();
    const p = new THREE.Vector3();
    let d = 2.5;
    let yaw = 0;
    let sy = 0;
    for (let iter = 0; iter < 6; iter++) {
      pos.copy(C).addScaledVector(dir, d);
      pos.y = eye;
      // yaw: the work's centre lands at xp
      const yawP = Math.atan2(-(C.x - pos.x), -(C.z - pos.z));
      yaw = yawP + Math.atan(xp * tanH);
      const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      // the work's outline in tangent space
      let u0 = Infinity;
      let u1 = -Infinity;
      let w0 = Infinity;
      let w1 = -Infinity;
      for (const sx of [-1, 1]) {
        for (const syy of [-1, 1]) {
          p.set(C.x + (sx * outer.w) / 2, cy + (syy * outer.h) / 2, C.z).sub(pos);
          const depth = p.dot(fwd);
          u0 = Math.min(u0, p.dot(right) / depth);
          u1 = Math.max(u1, p.dot(right) / depth);
          w0 = Math.min(w0, p.y / depth);
          w1 = Math.max(w1, p.y / depth);
        }
      }
      // vertical shift: the work's centre at fy
      sy = 1 - 2 * fy - (w0 + w1) / 2 / tanV;
      // share of the screen it fills now; size scales as 1/d
      const fh = (w1 - w0) / (2 * tanV);
      const fw = (u1 - u0) / (2 * tanH);
      const r = Math.max(fh / (kH * band), fw / kW);
      const next = THREE.MathUtils.clamp(d * r, 0.9, dMax);
      if (Math.abs(next - d) < 1e-3) break;
      d = next;
    }
    return { pos, yaw, tanV, sx: 0, sy };
  }

  const cam = { pos: new THREE.Vector3(), yaw: 0, tanV: 0.4, sx: 0, sy: 0 };
  const jit = { x: 0, y: 0 };
  function applyCamera() {
    camera.position.copy(cam.pos);
    camera.rotation.set(0, cam.yaw, 0, 'YXZ');
    camera.aspect = view.w / view.h;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(cam.tanV));
    camera.updateProjectionMatrix();
    const e = camera.projectionMatrix.elements;
    // off-axis shift (and sub-pixel jitter while accumulating): x_ndc += sx
    e[8] -= cam.sx + jit.x;
    e[9] -= cam.sy + jit.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld(true);
  }
  function snapCamera() {
    Object.assign(cam, cameraFor(state.view));
    applyCamera();
  }

  // ---------------------------------------------------------------- lighting per time
  function applyTime(t) {
    const d = new THREE.Vector3(...t.sun.dir).normalize();
    state.sunBase.copy(d);
    sun.color.set(t.sun.colour);
    sun.intensity = t.sun.intensity * K.sun;
    sun.position.copy(sun.target.position).addScaledVector(d, 25);
    const u = sky.material.uniforms;
    u.uSunDir.value.copy(d);
    u.uZenith.value.set(t.sky.zenith);
    u.uHorizon.value.set(t.sky.horizon);
    u.uGround.value.set(t.sky.ground);
    u.uSun.value.set(t.sun.colour).multiplyScalar(t.id === 'nat' ? 0.05 : 1);
    u.uCloud.value.set(t.sky.cloud);
    u.uCloudCover.value = t.sky.cover;
    u.uStars.value = t.sky.stars || 0;
    u.uIntensity.value = t.sky.intensity;
    scene.fog.color.set(t.fog);
    mats.glassTint.color.setRGB(t.glass * 0.96, t.glass, t.glass * 0.99);
    groundDisc.material.color.set(t.id === 'nat' ? '#05070a' : t.id === 'aften' ? '#3a3a24' : '#4c5a36');
    skyLight.color.set(t.skyLight.colour);
    skyLight.intensity = t.skyLight.intensity * K.sky;
    // daylight directions over the sky seen through the glazing
    state.skyDirs = [];
    for (let i = 0; i < 64; i++) {
      const az = (halton(i + 1, 2) - 0.5) * Math.PI * 0.85; // around -x
      const el = THREE.MathUtils.degToRad(8 + halton(i + 1, 3) * 62);
      state.skyDirs.push(new THREE.Vector3(-Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)));
    }
    const L = t.lamps;
    lanternLight.intensity = 5 * L;
    lampLight.intensity = 3.5 * L;
    pendLight.intensity = 14 * L;
    pendGlow.intensity = 1.5 * L;
    // a recessed spot on the work: dimmed by day, the main accent at night
    pictureSpot.intensity = 12 * Math.max(L, 0.1);
    mats.paperShade.emissiveIntensity = 1.4 * L;
    mats.opal.emissiveIntensity = 1.2 * L;
    mats.pendantShade.emissiveIntensity = 0.25 * L;
    mats.bulb.emissiveIntensity = 6 * L;
    mats.downlight.emissiveIntensity = 2.5 * L;
    // sheer curtains glow when backlit by daylight
    mats.curtain.emissive.set(t.skyLight.colour);
    mats.curtain.emissiveIntensity = t.id === 'nat' ? 0 : 0.1 * t.skyLight.intensity;
    scene.environmentIntensity = t.env * K.env;
    hemi.intensity = t.id === 'nat' ? 0.02 : 0.04;
    renderer.toneMappingExposure = t.exposure * K.exp * state.exposureK;
  }

  function placeLights() {
    const v = state.view;
    const w = state.work;
    const cy = w ? w.centreY : 1.5;
    pictureSpot.position.set(v.artX, h - 0.02, v.wallZ + v.facing * 0.85);
    pictureSpot.target.position.set(v.artX, cy - 0.05, v.wallZ);
    pictureSpot.target.updateMatrixWorld();
  }

  // per-sample jitter: camera sub-pixel, sun disc, sky dome, spot position
  function jitter(i, size) {
    if (i === 0) {
      jit.x = jit.y = 0;
      sun.position.copy(sun.target.position).addScaledVector(state.sunBase, 25);
      skyLight.position.copy(skyLight.target.position).addScaledVector(new THREE.Vector3(-0.75, 0.55, 0.1).normalize(), 25);
      skyLight.shadow.radius = 6;
    } else {
      jit.x = ((halton(i, 2) - 0.5) * 2) / size.x;
      jit.y = ((halton(i, 3) - 0.5) * 2) / size.y;
      const a = halton(i, 5) * Math.PI * 2;
      const r = Math.sqrt(halton(i, 7)) * 0.03;
      const d = state.sunBase.clone();
      const t1 = new THREE.Vector3().crossVectors(d, UP).normalize();
      const t2 = new THREE.Vector3().crossVectors(t1, d).normalize();
      d.addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).normalize();
      sun.position.copy(sun.target.position).addScaledVector(d, 25);
      const sd = state.skyDirs[(i - 1) % state.skyDirs.length];
      skyLight.position.copy(skyLight.target.position).addScaledVector(sd, 25);
      skyLight.shadow.radius = 2;
    }
    applyCamera();
  }

  // ---------------------------------------------------------------- the work
  let artTexture = null;
  function setArtTexture(t) {
    if (artTexture && artTexture !== t) artTexture.dispose();
    artTexture = t;
    mats.art.map = t || artPlaceholder;
    mats.art.needsUpdate = false;
  }

  function frameMaterial(frame) {
    if (!frame || frame.none) return mats.frame;
    const finish = frame.finish || 'matt';
    const wood = /eg|olie/.test(finish);
    const m = std({
      color: frame.colour || '#222222',
      map: wood ? (new THREE.Color(frame.colour).getHSL({}).l < 0.3 ? oakDark : oak) : oak,
      roughness: finish === 'satin' ? 0.4 : finish === 'blank' ? 0.2 : finish === 'olie' ? 0.5 : wood ? 0.6 : 0.72,
    });
    if (wood) {
      // the colour tints the grain; brighten so the swatch colour is the average
      m.color.multiplyScalar(1.12);
    } else {
      // paint: the grain barely shows through
      m.map = paintedGrain;
    }
    return m;
  }
  const paintedGrain = (() => {
    const c = makeCanvas(256, 128);
    const g = c.getContext('2d');
    const img = g.createImageData(256, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x++) {
        const v = 0.94 + (pnoise((x / 256) * 4, (y / 128) * 60, 4, 60, 2) - 0.5) * 0.06;
        const i = (y * 256 + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c, { aniso });
    t.repeat.set(1.2, 2.4);
    return t;
  })();

  /**
   * Hang a work. `spec` = { size (cm), medium, bare, offer }. Returns the
   * outer size in metres.
   */
  function hang(spec) {
    if (state.work) {
      furn.remove(state.work.root);
      state.work.root.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      if (state.work.frameMat && state.work.frameMat !== mats.frame) state.work.frameMat.dispose();
    }
    const frameMat = frameMaterial(spec.offer?.frame);
    const built = buildWork({ size: spec.size, offer: spec.offer, medium: spec.medium, bare: spec.bare, mats: { ...mats, frame: frameMat } });
    // the frame's own UVs run along each piece; scale them to metres
    built.group.traverse((o) => {
      if (o.isMesh && o.material === frameMat) {
        o.geometry.computeBoundingBox();
      }
    });
    const root = new THREE.Group();
    root.add(built.group);
    // soft contact shadow on the wall around and below the work
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(built.outer.w + 0.07, built.outer.h + 0.07), mats.shadow);
    sh.position.set(0, -0.012, 0.0015);
    sh.scale.setScalar(1);
    root.add(sh);
    state.work = { root, group: built.group, outer: built.outer, art: built.art, depth: built.depth, frameMat, spec, centreY: 0 };
    furn.add(root);
    positionWork();
    return built.outer;
  }

  function positionWork() {
    const w = state.work;
    if (!w) return;
    const v = state.view;
    w.centreY = hangCentre(v, w.outer);
    w.root.position.set(v.artX, w.centreY, v.wallZ);
    w.root.rotation.y = v.facing > 0 ? 0 : Math.PI;
    w.root.updateMatrixWorld(true);
    placeLights();
  }

  // ---------------------------------------------------------------- walls
  const wallpaperCache = new Map();
  function wallpaper(wall) {
    let t = wallpaperCache.get(wall.id);
    if (!t) {
      t = wallpaperTextures(wall, Q.tex);
      for (const k of ['map', 'rough', 'normal']) {
        t[k].anisotropy = aniso;
        t[k].repeat.set(1 / t.width, 1 / t.height);
      }
      wallpaperCache.set(wall.id, t);
    }
    return t;
  }
  function setWall(wall) {
    state.wall = wall;
    if (wall.kind === 'paper') {
      const t = wallpaper(wall);
      mats.wall.map = t.map;
      mats.wall.normalMap = t.normal;
      mats.wall.normalScale.set(0.6, 0.6);
      mats.wall.roughnessMap = t.rough;
      mats.wall.roughness = 1;
      mats.wall.color.set('#ffffff');
    } else {
      mats.wall.map = plasterMap;
      mats.wall.normalMap = plasterNormal;
      mats.wall.normalScale.set(0.5, 0.5);
      mats.wall.roughnessMap = white1;
      mats.wall.roughness = 0.92;
      mats.wall.color.set(wall.colour);
    }
    mats.woodwork.color.set(wall.woodwork || '#f3f1ec');
    envDirty = Math.max(envDirty, 1);
  }

  function setPalette(colours) {
    const [a, b, c, d] = colours;
    mats.accentFabric[0].color.set(a);
    mats.accentFabric[1].color.set('#e9e2d5'); // one calm linen cushion between the colours
    mats.accentFabric[2].color.set(b);
    mats.throw.color.set(c);
    mats.ceramic[0].color.set(c);
    mats.ceramic[1].color.set('#e8e2d6');
    mats.ceramic[2].color.set(b);
    mats.books[0].color.set(a);
    mats.books[1].color.set(d);
    mats.books[2].color.set(c);
  }

  // ---------------------------------------------------------------- render loop
  let running = false;
  let active = false;
  let raf = 0;
  const tweens = new Set();
  function tween(ms, fn) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tw = { t0, ms, fn, resolve };
      tweens.add(tw);
      kick();
      // a background tab stalls rAF: finish on a timer regardless
      setTimeout(() => {
        if (tweens.has(tw)) {
          tweens.delete(tw);
          fn(1);
          resolve();
          kick();
        }
      }, ms + 400);
    });
  }

  function tick() {
    raf = 0;
    if (!active) {
      running = false;
      return;
    }
    const now = performance.now();
    let moving = false;
    for (const tw of [...tweens]) {
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      tw.fn(ease(k));
      moving = true;
      if (k >= 1) {
        tweens.delete(tw);
        tw.resolve();
      }
    }
    if (envDirty > 0 && !moving) {
      if (envDirty >= 2) captureSky();
      captureRoom();
      envDirty--;
      pipeline.reset();
    }
    if (moving) pipeline.reset();
    const more = pipeline.step(scene, camera, jitter);
    if (moving || more || envDirty > 0 || tweens.size) {
      raf = requestAnimationFrame(tick);
    } else {
      running = false;
      fire('settled');
    }
  }

  function kick() {
    if (!active) return;
    if (!running) {
      running = true;
      raf = requestAnimationFrame(tick);
    }
  }

  /** Something changed: restart the progressive render. */
  function invalidate() {
    pipeline.reset();
    kick();
  }

  // Render one plain frame right now (also used before a snapshot)
  function renderNow() {
    if (envDirty > 0) {
      if (envDirty >= 2) captureSky();
      captureRoom();
      envDirty = Math.max(0, envDirty - 1);
    }
    pipeline.reset();
    pipeline.step(scene, camera, jitter);
  }

  // ---------------------------------------------------------------- crossfades
  // A change is shown as a crossfade: the current picture is copied onto the
  // overlay canvas, the scene changes underneath, and the copy fades out.
  let fadeTimer = 0;
  function snapshot() {
    if (!overlay || !view.w) return;
    const g = overlay.getContext('2d');
    if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
    }
    pipeline.present();
    g.drawImage(canvas, 0, 0);
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
  }
  function fadeOverlay(ms = 420) {
    if (!overlay) return;
    clearTimeout(fadeTimer);
    // let the new frame land first
    requestAnimationFrame(() => {
      overlay.style.transition = `opacity ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      overlay.style.opacity = '0';
    });
    fadeTimer = setTimeout(() => (overlay.style.opacity = '0'), ms + 200);
  }
  async function change(fn, { fade = true, ms = 420 } = {}) {
    const visible = active && fade && pipeline.count > 0;
    if (visible) snapshot();
    await fn();
    if (active) {
      renderNow();
      if (visible) fadeOverlay(ms);
      kick();
    }
  }

  // ---------------------------------------------------------------- listeners
  const listeners = new Map();
  const on = (e, fn) => (listeners.get(e) || listeners.set(e, new Set()).get(e)).add(fn);
  const off = (e, fn) => listeners.get(e)?.delete(fn);
  const fire = (e, d) => listeners.get(e)?.forEach((fn) => fn(d));

  // ---------------------------------------------------------------- public
  function resize(w, h) {
    view.w = Math.max(1, w);
    view.h = Math.max(1, h);
    renderer.setSize(view.w * Q.dpr, view.h * Q.dpr, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    pipeline.setSize(view.w, view.h, Q.dpr);
    snapCamera();
    invalidate();
  }

  // Screen rect (CSS px, relative to the canvas) of the visible artwork for a
  // camera resting in `viewId`
  function artRect() {
    const w = state.work;
    if (!w) return { x: 0, y: 0, width: 0, height: 0 };
    const keep = { ...cam };
    const kj = { ...jit };
    Object.assign(cam, cameraFor(state.view));
    jit.x = jit.y = 0;
    applyCamera();
    const c = new THREE.Vector3();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        c.set((sx * w.art.w) / 2, w.art.y + (sy * w.art.h) / 2, w.art.z);
        w.group.localToWorld(c);
        c.project(camera);
        const x = ((c.x + 1) / 2) * view.w;
        const y = ((1 - c.y) / 2) * view.h;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    Object.assign(cam, keep);
    Object.assign(jit, kj);
    applyCamera();
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  async function setView(id, { animate = true } = {}) {
    const v = viewById(id);
    if (v === state.view && !animate) return;
    const from = { ...cam, pos: cam.pos.clone() };
    await change(() => {
      state.view = v;
      positionWork();
      snapCamera();
    });
    if (animate && from.pos.distanceTo(cam.pos) > 0.01) {
      // a gentle push in: start a little further back and drift into place
      const to = { ...cam, pos: cam.pos.clone() };
      const back = new THREE.Vector3(Math.sin(to.yaw), 0, Math.cos(to.yaw)).multiplyScalar(0.35);
      await tween(900, (k) => {
        cam.pos.copy(to.pos).addScaledVector(back, 1 - k);
        cam.tanV = to.tanV;
        applyCamera();
      });
    }
  }

  function setTime(id) {
    state.time = timeById(id);
    applyTime(state.time);
    envDirty = 2;
  }

  function setExposure(k) {
    state.exposureK = THREE.MathUtils.clamp(Number.isFinite(k) ? k : 1, 0, 1);
    renderer.toneMappingExposure = state.time.exposure * K.exp * state.exposureK;
    pipeline.present();
  }

  function show() {
    active = true;
    kick();
  }
  function hide() {
    active = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    running = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    } else kick();
  });

  // ---------------------------------------------------------------- warm up
  applyTime(state.time);

  return {
    renderer,
    scene,
    camera,
    mats,
    quality: Q,
    get view() {
      return state.view;
    },
    get time() {
      return state.time;
    },
    get work() {
      return state.work;
    },
    get converged() {
      return !running && pipeline.count >= pipeline.samples;
    },
    get samples() {
      return pipeline.count;
    },
    on,
    off,
    hang,
    setArtTexture,
    setPalette,
    setWall,
    setTime,
    setView,
    setViewInstant(id) {
      state.view = viewById(id);
      positionWork();
      snapCamera();
      invalidate();
    },
    setInsets(ins) {
      state.insets = { ...state.insets, ...ins };
      snapCamera();
      invalidate();
    },
    positionWork,
    change,
    invalidate,
    renderNow,
    resize,
    artRect,
    setExposure,
    show,
    hide,
    // dev: render sample i straight to the screen (no accumulation)
    debugSample(i) {
      jitter(i, pipeline.size);
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    },
    lights: { sun, skyLight, pictureSpot },
    pipeline,
    prewarmWall(wall) {
      if (wall?.kind === 'paper') {
        const t = wallpaper(wall);
        // upload now, so the first frame with it does not stall
        ['map', 'rough', 'normal'].forEach((k) => renderer.initTexture(t[k]));
      }
    },
    setCanvasEdge(colour) {
      mats.canvasEdge.color.set(colour);
    },
  };
}
