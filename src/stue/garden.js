// The back garden seen through the glazing: a larch deck right outside the
// glass, modelled, and beyond it a real photograph of a garden (a CC0 HDRI
// panorama, see CREDITS.md) projected the way a "grounded skybox" is: the
// photo is looked up by direction from the point it was taken at, on a dome
// whose floor is flattened into the lawn. That point follows the room's
// camera (follow), so every view sees the photo from where it was taken: no
// stretching, and the horizon and verticals stay true. While the camera moves,
// the lawn lies on a real ground plane under the modelled deck, so the two
// keep their parallax, and the trees sit far out on the dome's wall.
//
// The photo is graded per time of day (setTime). Its sky (a mask made with the
// photo) is let go where the procedural sky (sky.js) should show instead: the
// evening's glow, the stars at night.
import * as THREE from 'three';
import { oakFloor, toTexture } from './textures.js';
import { mesh } from './furniture.js';

// The sector of the panorama in the files: 160° across, centred on the view
// straight out of the glazing (-x), from 40° above the horizon to 45° below.
// Made from the full 8K panorama by scripts/garden-photo.mjs.
const SECTOR = { az: 160, top: 40, bottom: -45 };
const PHOTOS = {
  large: [new URL('./photos/have-3200.avif', import.meta.url).href, new URL('./photos/have-3200.webp', import.meta.url).href],
  small: [new URL('./photos/have-1600.avif', import.meta.url).href, new URL('./photos/have-1600.webp', import.meta.url).href],
  sky: [new URL('./photos/have-himmel.webp', import.meta.url).href], // white = sky
};
// The photo's camera stood CAMERA_H above the lawn (y = -0.14), about the
// room camera's eye height. R: the dome's radius, out at the tree line.
const LAWN_Y = -0.14;
const CAMERA_H = 1.6;
const R = 60;

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // from where the photo was taken
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  #define PI 3.14159265
  uniform sampler2D uMap;
  uniform sampler2D uSky;
  uniform vec3 uGain;      // exposure and colour balance of the land
  uniform vec3 uSkyGain;   // the same for the photographed sky
  uniform float uSat;      // saturation
  uniform float uSkyKeep;  // 1: the photographed sky, 0: the procedural sky through it
  uniform vec3 uAz;        // half width, top, bottom of the sector (radians)
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float th = atan(-d.z, -d.x); // from straight out (-x) round towards -z
    float el = asin(clamp(d.y, -1.0, 1.0));
    vec2 uv = vec2(0.5 + th / (2.0 * uAz.x), (el - uAz.z) / (uAz.y - uAz.z));
    uv = clamp(uv, vec2(0.001), vec2(0.999));
    vec3 c = texture2D(uMap, uv).rgb;
    // the sky, and anything above the top of the sector (the overhang hides it anyway)
    float sky = max(texture2D(uSky, uv).r, smoothstep(uAz.y - 0.12, uAz.y, el));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 land = max(mix(vec3(l), c, uSat), 0.0) * uGain;
    vec3 col = mix(land, c * uSkyGain, sky);
    float a = 1.0 - sky * (1.0 - uSkyKeep);
    gl_FragColor = vec4(col, a);
  }
`;

function photoDome() {
  const geo = new THREE.SphereGeometry(R, 128, 64);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -CAMERA_H) p.setY(i, -CAMERA_H); // the lawn
  const deg = THREE.MathUtils.degToRad;
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uMap: { value: null },
      uSky: { value: null },
      uGain: { value: new THREE.Color(1, 1, 1) },
      uSkyGain: { value: new THREE.Color(1, 1, 1) },
      uSat: { value: 1 },
      uSkyKeep: { value: 1 },
      uAz: { value: new THREE.Vector3(deg(SECTOR.az / 2), deg(SECTOR.top), deg(SECTOR.bottom)) },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, material);
  dome.renderOrder = -5; // over the procedural sky, under the glass
  dome.visible = false; // until the photo has loaded
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
  const ready = Promise.all([loadPhoto(large ? PHOTOS.large : PHOTOS.small, { aniso }), loadPhoto(PHOTOS.sky, { srgb: false })]).then(([photo, sky]) => {
    u.uMap.value = photo;
    u.uSky.value = sky;
  });

  return {
    group,
    /** Resolves once the photo is in (it never blocks the first picture). */
    ready,
    showPhoto() {
      dome.visible = true;
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
