// The back garden seen through the glazing: a larch deck right outside the
// glass, modelled, and beyond it a real photograph of a garden: a high-
// resolution backplate (CC0, see CREDITS.md), one per room, since the stue
// and the spisestue look out along the glazing in opposite directions.
//
// The photo is projected the way it was taken: looked up by direction, as a
// 24 mm lens saw it, from a point that follows the room's camera (follow), on
// a dome whose floor is flattened into the lawn. Every view sees it from where
// it was taken, so the horizon and verticals stay true and nothing stretches;
// while the camera moves, the lawn lies on a real ground plane under the
// modelled deck, so the two keep their parallax. (Trees 30 m and more away
// barely move between the two camera angles, so the photo needs no layers.)
//
// Sizes follow what the glass shows: a small first picture straight away,
// then a sharp one (phone, desktop, desktop at DPR 2) once it has loaded.
// The photo is graded per time of day (setTime); its sky (a mask made with
// the photo) is let go where the procedural sky (sky.js) should show instead:
// the evening's glow, the stars at night.
import * as THREE from 'three';
import { oakFloor, toTexture } from './textures.js';
import { mesh } from './furniture.js';

const url = (name) => new URL(`./photos/${name}`, import.meta.url).href;
// Where each photo looks: yaw from straight out of the glazing (-x) round
// towards -z, the camera's tilt, and the sky's average colour above the frame
// (from scripts/garden-photo.mjs). Yaws put the photo's open middle (lawn
// running back to the tree line) where the glass is seen at the angle: 8°–31°
// from the stue, -35° to -9° from the spisestue, for every work. Straight on,
// a sliver of glass at the screen's edge looks further round (±65°–74°), past
// the frame's side: the photo is mirrored there.
const PHOTOS = {
  stue: {
    yaw: 20,
    pitch: 2.7,
    sky: '#ebeff2',
    first: [url('have-stue-768.avif'), url('have-stue-768.webp')],
    phone: [url('have-stue-1600.avif'), url('have-stue-1600.webp')],
    desktop: [url('have-stue-3072.avif'), url('have-stue-3072.webp')],
    desktop2x: [url('have-stue-5120.avif'), url('have-stue-3072.webp')],
    mask: [url('have-stue-himmel.webp')],
  },
  spise: {
    yaw: -22,
    pitch: -0.5,
    sky: '#eaeef2',
    first: [url('have-spise-768.avif'), url('have-spise-768.webp')],
    phone: [url('have-spise-1600.avif'), url('have-spise-1600.webp')],
    desktop: [url('have-spise-3072.avif'), url('have-spise-3072.webp')],
    desktop2x: [url('have-spise-5120.avif'), url('have-spise-3072.webp')],
    mask: [url('have-spise-himmel.webp')],
  },
};
// 24 mm on full frame: half the frame is 18 × 12 mm
const TAN = new THREE.Vector2(18 / 24, 12 / 24);
// The photo's camera stood CAMERA_H above the lawn (y = -0.14), about the
// room camera's eye height. R: the dome's radius, out at the tree line.
const LAWN_Y = -0.14;
const CAMERA_H = 1.5;
const R = 60;

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // from where the photo was taken
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uSky;
  uniform vec3 uF, uR, uU;   // the photo's camera: forward, right, up
  uniform vec2 uTan;         // tangents of half the frame
  uniform vec3 uSkyCol;      // the photo's sky, above the frame
  uniform vec3 uGain;        // exposure and colour balance of the land
  uniform vec3 uSkyGain;     // the same for the photographed sky
  uniform float uSat;        // saturation
  uniform float uSkyKeep;    // 1: the photographed sky, 0: the procedural sky through it
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float z = max(dot(d, uF), 1e-3);
    vec2 uv = 0.5 + vec2(dot(d, uR), dot(d, uU)) / z / (2.0 * uTan);
    // below the frame is the deck's: clamp; beside it, mirrored (wrapS)
    vec2 st = vec2(uv.x, clamp(uv.y, 0.0005, 0.9995));
    vec3 c = texture2D(uMap, st).rgb;
    float sky = texture2D(uSky, st).r;
    // over the top edge the photo eases into its own sky
    float over = smoothstep(0.97, 1.0, uv.y);
    c = mix(c, uSkyCol, over);
    sky = max(sky, over);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 land = max(mix(vec3(l), c, uSat), 0.0) * uGain;
    vec3 col = mix(land, c * uSkyGain, sky);
    gl_FragColor = vec4(col, 1.0 - sky * (1.0 - uSkyKeep));
  }
`;

function photoDome() {
  const geo = new THREE.SphereGeometry(R, 128, 64);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -CAMERA_H) p.setY(i, -CAMERA_H); // the lawn
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uMap: { value: null },
      uSky: { value: null },
      uF: { value: new THREE.Vector3() },
      uR: { value: new THREE.Vector3() },
      uU: { value: new THREE.Vector3() },
      uTan: { value: TAN },
      uSkyCol: { value: new THREE.Color() },
      uGain: { value: new THREE.Color(1, 1, 1) },
      uSkyGain: { value: new THREE.Color(1, 1, 1) },
      uSat: { value: 1 },
      uSkyKeep: { value: 1 },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, material);
  dome.renderOrder = -5; // over the procedural sky, under the glass
  dome.visible = false; // until a photo has loaded
  return dome;
}

// AVIF where the browser has it, WebP otherwise. Decoded off the main thread
// (createImageBitmap) where the browser can, so the photo never stalls a frame.
function loadPhoto(urls, { aniso = 1, srgb = true } = {}) {
  const bitmaps = typeof createImageBitmap === 'function';
  const loader = bitmaps ? new THREE.ImageBitmapLoader() : new THREE.TextureLoader();
  if (bitmaps) loader.setOptions({ imageOrientation: 'flipY', colorSpaceConversion: srgb ? 'default' : 'none' });
  return new Promise((resolve, reject) => {
    const next = (i) =>
      loader.load(
        urls[i],
        (img) => {
          const t = bitmaps ? new THREE.Texture(img) : img;
          if (bitmaps) {
            t.flipY = false; // flipped while decoding
            t.needsUpdate = true;
          }
          if (srgb) t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = aniso;
          t.wrapS = THREE.MirroredRepeatWrapping;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          resolve(t);
        },
        undefined,
        () => (i + 1 < urls.length ? next(i + 1) : reject(new Error('garden photo'))),
      );
    next(0);
  });
}

export function createGarden({ aniso = 8, large = true } = {}) {
  const group = new THREE.Group();
  group.name = 'garden';

  // 256 px is plenty seen through the glass, and a quarter of the drawing time
  const deck = oakFloor(256, { tone: [128, 110, 92], seed: 9 });
  const deckMap = toTexture(deck.map, { aniso });
  const deckNormal = toTexture(deck.normal, { srgb: false, aniso });
  deckMap.repeat.set(1 / 2.4, 1 / 2.4);
  deckNormal.repeat.copy(deckMap.repeat);
  const deckMat = new THREE.MeshStandardMaterial({ map: deckMap, normalMap: deckNormal, roughness: 0.8, color: '#a69a8e' });

  // the deck right outside the glazing, its edge a step above the lawn
  const deckGeo = new THREE.BoxGeometry(3.6, 0.12, 22);
  {
    const p = deckGeo.attributes.position;
    const uv = deckGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i), p.getX(i) + p.getY(i));
  }
  const deckMesh = mesh(deckGeo, deckMat);
  deckMesh.position.set(-3.25 - 1.8, -0.08, 0);
  group.add(deckMesh);

  const dome = photoDome();
  group.add(dome);
  const u = dome.material.uniforms;

  // The sharp size for this screen: a phone renders at 1.5× at most
  const sharpTier = !large ? 'phone' : (globalThis.devicePixelRatio || 1) >= 1.5 ? 'desktop2x' : 'desktop';
  // per room: { first, sharp, mask } textures as they arrive
  const loaded = { stue: {}, spise: {} };
  let current = null; // the room shown
  let shown = null; // the texture on the dome
  let onUpdate = (apply) => apply();

  function best(id) {
    const l = loaded[id];
    return l.mask && (l.sharp || l.first);
  }
  // Put the room's best photo on the dome; a sharp photo of the other room
  // gives its GPU memory back (it is uploaded again if that room comes back)
  function apply() {
    const id = current;
    const map = id && best(id);
    if (!map) return;
    const P = PHOTOS[id];
    u.uMap.value = map;
    u.uSky.value = loaded[id].mask;
    u.uSkyCol.value.set(P.sky);
    const yaw = THREE.MathUtils.degToRad(P.yaw);
    const pitch = THREE.MathUtils.degToRad(P.pitch);
    u.uF.value.set(-Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw));
    u.uR.value.set(Math.sin(yaw), 0, -Math.cos(yaw));
    u.uU.value.crossVectors(u.uR.value, u.uF.value);
    for (const other of Object.keys(loaded)) if (other !== id) loaded[other].sharp?.dispose();
    if (shown && shown !== map && shown === loaded[id].first) shown.dispose();
    shown = map;
    dome.visible = true;
  }
  function arrive(id, key, t) {
    loaded[id][key] = t;
    if (id === current && best(id) !== shown) onUpdate(apply);
  }
  function load(id, key, urls, opts) {
    if (loaded[id][key] !== undefined) return;
    loaded[id][key] = null;
    loadPhoto(urls, opts).then(
      (t) => arrive(id, key, t),
      () => {}, // no photo: the procedural sky alone, over the deck
    );
  }
  // both rooms' first pictures and masks straight away: together under 100 KB
  for (const id of Object.keys(PHOTOS)) {
    load(id, 'mask', PHOTOS[id].mask, { srgb: false });
    load(id, 'first', PHOTOS[id].first, { aniso });
  }

  return {
    group,
    /**
     * fn(apply) is called when a better photo for the room shown has arrived;
     * the room calls apply() inside a crossfade.
     */
    onUpdate(fn) {
      onUpdate = fn;
    },
    /** The room shown ('stue' | 'spise'): its photo goes up straight away. */
    setView(id) {
      if (!PHOTOS[id] || id === current) return;
      current = id;
      load(id, 'sharp', PHOTOS[id][sharpTier], { aniso });
      apply();
    },
    /** Centre the photo on the camera (only its height stays put). */
    follow(pos) {
      dome.position.set(pos.x, LAWN_Y + CAMERA_H, pos.z);
      dome.updateMatrixWorld();
    },
    // The deck gets its own sky light (set by the room per time of day)
    setEnvironment(env, intensity) {
      deckMat.envMap = env;
      deckMat.envMapIntensity = intensity;
    },
    /**
     * Grade the photo for a time of day. `gain` is relative to the photo as
     * shot: the room's exposure and glass are divided out by the caller.
     */
    setTime({ gain, tint, sat, sky, skyTint }) {
      u.uGain.value.set(tint).multiplyScalar(gain);
      u.uSkyGain.value.set(skyTint || tint).multiplyScalar(gain);
      u.uSat.value = sat;
      u.uSkyKeep.value = sky;
    },
  };
}
