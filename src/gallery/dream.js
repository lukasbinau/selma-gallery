// The world behind Lille stjerne's lower door (journey.js opens it): a ~75 s
// story told with Selma's own figures, cut out of her paintings
// (scripts/dream-cutouts.mjs) and brought to life.
//
//   Trappen    down the blue stairs, to the star lying at the bottom
//   Morgen     the star rises over Rapsmarker's fields and becomes the sun;
//              the red woman from Sol og figur wakes, flowers sprout
//   Ansigterne Portræt, Blå øjne and Orange mand open their eyes in the sky
//              and sing to her; she rises up to them
//   Festen     the song turns to colour: the faces fall apart into their
//              own paint and become Cirkler, whose circles fly off as
//              planets; the woman from Vådt hår arrives and the two dance;
//              Grønt glas's jug pours light, and Selma's patterns turn
//   Blå time   Lilla skyer's clouds roll in, the colours drain to blue,
//              the two fall asleep, the sun goes down
//   Hjem       everything turns to light and gathers in the star, which
//              climbs the stairs and settles in its window: the painting
//              Lille stjerne puts itself back together, grain by grain
//
// Four tools do the work: puppets (a cutout on a bendable mesh: heads nod,
// legs kick, eyes blink, mouths sing), paint-dust (thousands of points that
// take their colour from one picture and fly to their place in another),
// a sky dome, and a kaleidoscope of Selma's patterns.
import * as THREE from 'three';
import CAST from './dream-cast.json';

export const DURATION = 75;

// The story, as it is told on screen: [from, to, text]
export const STORY = [
  [1, 5.4, 'Bag døren gik en trappe ned i mørket.'],
  [7.4, 11.6, 'Nederst lå en stjerne. Den steg op og blev til en sol.'],
  [13, 18.2, 'Solen vækkede pigen på marken.'],
  [22, 26.2, 'Ansigterne på himlen åbnede øjnene'],
  [27, 32.2, 'og sang for hende.'],
  [35, 39, 'Sangen blev til farver,'],
  [41, 47.6, 'og alle dansede, til farverne løb sammen.'],
  [51, 55.4, 'Så kom den blå time.'],
  [56.4, 61.2, 'De faldt i søvn under skyerne.'],
  [63, 66, 'Alt blev til lys igen,'],
  [69.6, 74.4, 'og stjernen gik op ad trappen, hjem til sit vindue.'],
];

// Moments for the soundtrack (dream-sound.js): bells as the faces sing, and so on
export const CUES = [];

// The paintings the dream uses whole (journey.js loads them)
export const PAINTINGS = ['rapsmarker', 'cirkler', 'blaa-time', 'lille-stjerne', 'blaa-fliser', 'moenster-lyseroed'];
// …and the cutouts (public/art/dream/<name>.webp)
export const CUTOUTS = Object.keys(CAST);

// ------------------------------------------------------------------ easing and keyframes
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeIn = (x) => clamp01(x) ** 3;
const easeOut = (x) => 1 - (1 - clamp01(x)) ** 3;
const span = (t, a, b) => smooth((t - a) / (b - a));
// 0 → 1 → 0 over [a, b]
const win = (t, a, b, fin = 0.6, fout = fin) => smooth((t - a) / fin) * (1 - smooth((t - (b - fout)) / fout));
// A springy pop: 0 → a little over 1 → 1
const pop = (x) => {
  const t = clamp01(x);
  return t === 0 ? 0 : 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
};
const lerp = (a, b, k) => a + (b - a) * k;

// [[t, number | '#colour' | [x, y, z]], …] → value at t, smoothly between keys
function track(list) {
  const pts = list.map(([t, v]) => [t, typeof v === 'string' ? new THREE.Color(v) : Array.isArray(v) ? new THREE.Vector3(...v) : v]);
  const outC = new THREE.Color();
  const outV = new THREE.Vector3();
  return (t) => {
    let i = pts.findIndex((p) => p[0] > t);
    if (i === -1) i = pts.length;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i)];
    const k = a === b ? 0 : smooth((t - a[0]) / (b[0] - a[0]));
    if (typeof a[1] === 'number') return a[1] + (b[1] - a[1]) * k;
    if (a[1].isColor) return outC.copy(a[1]).lerp(b[1], k);
    return outV.copy(a[1]).lerp(b[1], k);
  };
}

// ------------------------------------------------------------------ the timeline
const STAGE = new THREE.Vector3(0, 5, -9); // where the sky scenes play

// Camera: where it is and what it looks at. Steps of 0.01 s are cuts, hidden in a flash.
const CAM_POS = track([
  [0, [0, 0, 0]],
  [5.99, [0, 0, 0]],
  [6, [0, 1.0, 5.4]],
  [12, [0, 1.15, 4.8]],
  [18.5, [0, 1.5, 4.3]],
  [22, [0, 3.7, 1.4]],
  [33, [0, 4.5, 0.5]],
  [38, [0, 4.8, -0.4]],
  [46, [0.7, 5.3, -0.8]],
  [50, [0, 5, 0]],
  [65.99, [0, 5, 0.4]],
  [66, [0, 5, 0]],
  [68.99, [0, 5, 0]],
  [69, [0, 5, 0]],
]);
const CAM_LOOK = track([
  [0, [0, -1, -0.32]],
  [5.99, [0, -1, -0.32]],
  [6, [0, 1.6, -20]],
  [12, [0, 1.9, -20]],
  [18.5, [0, 2.6, -20]],
  [22, [0, 4.9, -9]],
  [50, [0, 5, -9]],
  [65.99, [0, 5, -9]],
  [66, [0, 6, -0.32]],
  [68.99, [0, 6, -0.32]],
  [69, [0, 5, -9]],
]);
const FOV = track([[0, 78], [6, 58], [20, 56], [34, 60], [44, 64], [50, 56], [62, 60], [66, 78], [68.99, 78], [69, 50], [75, 50]]);

// A full-screen warm flash hides each cut
const FLASH = (t) => win(t, 5.3, 6.7, 0.7, 0.7) + win(t, 65.3, 66.7, 0.7, 0.7) + win(t, 68.3, 69.7, 0.7, 0.7);

// Sky: top, horizon, below
const SKY_TOP = track([
  [0, '#01041c'], [5.99, '#0a1470'], [6.0, '#2c7fd6'], [12, '#3fb3e6'], [19, '#4aa8e8'], [23, '#5e17eb'], [33, '#7a1fd0'],
  [36, '#b0127a'], [44, '#ff2234'], [49, '#9c1060'], [52, '#1a1a7a'], [58, '#050a3a'], [62, '#030620'], [66, '#0a1470'], [69, '#230a66'],
]);
const SKY_MID = track([
  [0, '#030a40'], [5.99, '#1a2ad0'], [6.0, '#ffb36b'], [12, '#ffe39a'], [19, '#bfe6ff'], [23, '#f767d3'], [33, '#f767d3'],
  [36, '#ff6a9a'], [44, '#fcd23b'], [49, '#f767d3'], [52, '#3a3ab0'], [58, '#0b1a6e'], [62, '#0b0f40'], [66, '#2a3cff'], [69, '#5e17eb'],
]);
const SKY_LOW = track([[0, '#000214'], [5.99, '#000214'], [6.0, '#2a6a3a'], [20, '#2a6a3a'], [24, '#3a0a5a'], [50, '#3a0a5a'], [54, '#02041a'], [66, '#02041a'], [69, '#120530']]);
const STARS = track([[0, 0.8], [5.99, 0.5], [6.0, 0], [52, 0], [57, 1], [64, 1], [66, 0.7], [69, 0.25]]);
const FOG_NEAR = track([[0, 1.5], [5.99, 1.5], [6, 14], [20, 22], [50, 22], [60, 10], [62, 16], [65.99, 16], [66, 1.5], [68.99, 1.5], [69, 16]]);
const FOG_FAR = track([[0, 9], [5.99, 9], [6, 80], [65.99, 80], [66, 9], [68.99, 9], [69, 80]]);

// ------------------------------------------------------------------ textures drawn here
function starTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  const ray = (len, w, colour) => {
    g.fillStyle = colour;
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i * Math.PI) / 4 + (i % 2 ? 0.08 : -0.05));
      g.beginPath();
      g.moveTo(0, -w);
      g.quadraticCurveTo(len * 0.5, -w * 0.6, len * (i % 2 ? 0.78 : 1), 0);
      g.quadraticCurveTo(len * 0.5, w * 0.6, 0, w);
      g.closePath();
      g.fill();
      g.restore();
    }
  };
  ray(118, 15, '#e88a1c');
  ray(110, 10, '#fcd23b');
  g.fillStyle = '#ffe98a';
  g.beginPath();
  g.arc(0, 0, 16, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ shaders
const OUTPUT = /* glsl */ `
#include <tonemapping_fragment>
#include <colorspace_fragment>
`;

// A cutout on a bendable mesh. Up to four "deformers", each
//   uDefC[i] = (centre u, centre v, radius (× height), type)
//   uDefP[i] = (pivot u, pivot v, amount, extra)
// type 1: turn round the pivot by `amount` radians (a head, a leg)
// type 2: squash round the centre: height × amount, width × extra (eyes, mouths)
// type 3: sway sideways by `amount`, `extra` = phase (flowers, hair)
const PUPPET_VERT = /* glsl */ `
uniform vec2 uSize;
uniform vec4 uDefC[4];
uniform vec4 uDefP[4];
uniform float uTime;
uniform float uBreath;
varying vec2 vUv;
vec2 turn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
void main() {
  vUv = uv;
  vec2 p0 = (uv - 0.5) * uSize;
  vec2 p = p0;
  for (int i = 0; i < 4; i++) {
    vec4 c = uDefC[i];
    vec4 q = uDefP[i];
    if (c.w < 0.5) continue;
    vec2 cc = (c.xy - 0.5) * uSize;
    float r = c.z * uSize.y;
    float w = 1.0 - smoothstep(r * 0.45, r, length(p0 - cc));
    if (c.w < 1.5) {
      vec2 pv = (q.xy - 0.5) * uSize;
      p = pv + turn(p - pv, q.z * w);
    } else if (c.w < 2.5) {
      p.y = cc.y + (p.y - cc.y) * mix(1.0, q.z, w);
      p.x = cc.x + (p.x - cc.x) * mix(1.0, q.w, w);
    } else {
      p.x += q.z * w * sin(uTime * 2.4 + p0.y * 2.2 + q.w) * uSize.x;
    }
  }
  // Breathing: the top of the figure rises and falls a little
  p.y += uBreath * 0.014 * uSize.y * sin(uTime * 1.8) * uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
const PUPPET_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uDrain;
uniform vec3 uGlow;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  float a = c.a * uOpacity;
  if (a < 0.01) discard;
  vec3 col = c.rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, uTint * l * 2.4, uDrain);
  col += uGlow * c.a;
  gl_FragColor = vec4(col, a);
  ${OUTPUT}
}`;

// Paint-dust: a grid of points that takes its colours from picture A (a
// rectangle of it, uUvA) laid out in rectangle uBoxA, and flies to picture
// B in uBoxB, each point on its own little arc. Either end can instead be a
// point of light (uPointA/B = 1).
const DUST_VERT = /* glsl */ `
attribute vec2 grid;
attribute float rnd;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec4 uUvA;
uniform vec4 uUvB;
uniform mat4 uBoxA;
uniform mat4 uBoxB;
uniform vec3 uPointA;
uniform vec3 uPointB;
uniform float uIsPointA;
uniform float uIsPointB;
uniform float uProg;
uniform float uStagger;
uniform float uSwirl;
uniform float uCellA;
uniform float uCellB;
uniform float uProj;
uniform float uTime;
uniform float uOpacity;
uniform float uShimmer;
varying vec4 vCol;
void main() {
  vec4 ca = texture(uTexA, uUvA.xy + grid * uUvA.zw);
  vec4 cb = texture(uTexB, uUvB.xy + grid * uUvB.zw);
  vec3 jitter = (vec3(rnd, fract(rnd * 7.31), fract(rnd * 3.77)) - 0.5);
  vec3 pa = mix((uBoxA * vec4(grid - 0.5, 0.0, 1.0)).xyz, uPointA + jitter * 0.3, uIsPointA);
  vec3 pb = mix((uBoxB * vec4(grid - 0.5, 0.0, 1.0)).xyz, uPointB + jitter * 0.3, uIsPointB);
  // a point of light keeps the colour of the paint it came from
  cb = mix(cb, ca, uIsPointB);
  ca = mix(ca, cb, uIsPointA);
  float e = clamp(uProg * (1.0 + uStagger) - rnd * uStagger, 0.0, 1.0);
  e = e * e * (3.0 - 2.0 * e);
  float arc = sin(3.14159 * e);
  vec3 swirl = vec3(sin(rnd * 31.0 + e * 5.0 + uTime * 0.7), cos(rnd * 17.0 + e * 4.0 + uTime * 0.5), sin(rnd * 7.0 + e * 3.0)) * uSwirl * arc;
  vec3 p = mix(pa, pb, e) + swirl + jitter * uShimmer * sin(uTime * 3.0 + rnd * 40.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vCol = mix(ca, cb, e);
  vCol.rgb *= 1.0 + arc * 0.6; // light in flight
  vCol.a *= uOpacity;
  float cell = mix(uCellA, uCellB, e) * (1.0 + arc * 0.6);
  gl_PointSize = vCol.a < 0.08 ? 0.0 : clamp(cell * uProj / -mv.z * 1.7, 1.0, 48.0);
}`;
const DUST_FRAG = /* glsl */ `
varying vec4 vCol;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vCol;
  ${OUTPUT}
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLow;
uniform float uStars;
uniform float uTime;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  vec3 col = d.y > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.55, d.y)) : mix(uMid, uLow, smoothstep(0.0, 0.25, -d.y));
  vec2 g = vec2(atan(d.z, d.x) * 70.0, d.y * 70.0);
  vec2 cell = floor(g);
  float hs = h21(cell);
  if (hs > 0.975) {
    vec2 at = vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5;
    float s = smoothstep(0.13, 0.0, length(fract(g) - 0.5 - at * 0.6));
    col += vec3(1.0, 0.95, 0.85) * s * uStars * (0.55 + 0.45 * sin(uTime * 2.2 + hs * 60.0));
  }
  gl_FragColor = vec4(col, 1.0);
  ${OUTPUT}
}`;

// Selma's patterns folded into a turning mandala, two of them melting into each other
const KALEIDO_FRAG = /* glsl */ `
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
vec2 fold(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }
void main() {
  vec2 q = vUv - 0.5;
  float r = length(q);
  float a = atan(q.y, q.x) + uTime * 0.18;
  float seg = 6.2831853 / 10.0;
  a = abs(mod(a, seg) - seg * 0.5);
  vec2 s = vec2(cos(a), sin(a)) * (r * 2.4 - uTime * 0.12);
  vec3 col = mix(texture2D(uTexA, fold(s + 0.3)).rgb, texture2D(uTexB, fold(s * 1.3 + 0.1)).rgb, uMix);
  gl_FragColor = vec4(col, uOpacity * smoothstep(0.5, 0.36, r));
  ${OUTPUT}
}`;
const PLAIN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// ------------------------------------------------------------------ the world
export function createDream({ cast, paintings, pixelRatio = 1, calm = false }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 18, 90);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300);
  scene.add(camera);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const calmK = calm ? 0.35 : 1;

  // ---------------------------------------------------------------- sky
  const skyMat = keep(
    new THREE.ShaderMaterial({
      uniforms: { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: { value: 0 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(150, 48, 24)), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);

  // ---------------------------------------------------------------- sprites
  const starTex = keep(starTexture());
  const glowTex = keep(glowTexture());
  const sprite = (map, colour, additive = true) =>
    new THREE.Sprite(
      keep(
        new THREE.SpriteMaterial({
          map,
          color: colour,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      ),
    );
  const star = new THREE.Group();
  const starGlow = sprite(glowTex, '#ffd36b');
  const starBody = sprite(starTex, '#ffffff', false);
  star.add(starGlow, starBody);
  scene.add(star);

  // The flash that hides the cuts: a sheet in front of the camera
  const flashMat = keep(new THREE.MeshBasicMaterial({ color: '#fff3d0', transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  const flash = new THREE.Mesh(keep(new THREE.PlaneGeometry(4, 4)), flashMat);
  flash.position.z = -0.2;
  flash.renderOrder = 100;
  camera.add(flash);

  // ---------------------------------------------------------------- puppets
  const puppetGeo = keep(new THREE.PlaneGeometry(1, 1, 36, 36));
  function puppet(tex, height, { breath = 0 } = {}) {
    const img = tex?.image;
    const aspect = img?.width && img?.height ? img.width / img.height : 1;
    const u = {
      map: { value: tex },
      uSize: { value: new THREE.Vector2(height * aspect, height) },
      uDefC: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
      uDefP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
      uTime: { value: Math.random() * 10 },
      uBreath: { value: breath },
      uOpacity: { value: 0 },
      uTint: { value: new THREE.Color('#7a8cff') },
      uDrain: { value: 0 },
      uGlow: { value: new THREE.Color(0, 0, 0) },
    };
    const mat = keep(
      new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: PUPPET_VERT,
        fragmentShader: PUPPET_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    const mesh = new THREE.Mesh(puppetGeo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    const p = {
      mesh,
      u,
      height,
      aspect,
      // (type, centre, radius, pivot, amount, extra): see PUPPET_VERT
      def(i, type, [cx, cy], r, [px, py] = [0, 0], amount = type === 2 ? 1 : 0, extra = 1) {
        u.uDefC.value[i].set(cx, cy, r, type);
        u.uDefP.value[i].set(px, py, amount, extra);
        return p;
      },
      set(i, amount, extra) {
        u.uDefP.value[i].z = amount;
        if (extra !== undefined) u.uDefP.value[i].w = extra;
        return p;
      },
      show(opacity, x, y, z, scale = 1, rotZ = 0, flip = false, rotY = 0) {
        mesh.visible = opacity > 0.003;
        u.uOpacity.value = Math.min(1, opacity);
        mesh.position.set(x, y, z);
        mesh.scale.set(flip ? -scale : scale, scale, 1);
        mesh.rotation.set(0, rotY, rotZ);
        mesh.renderOrder = Math.round(500 + z * 10);
        return p;
      },
      // Its rectangle in the world, for paint-dust to start from or land on
      box(out) {
        mesh.updateMatrixWorld();
        return out.copy(mesh.matrixWorld).multiply(_m.makeScale(u.uSize.value.x, u.uSize.value.y, 1));
      },
    };
    puppets.push(p);
    return p;
  }
  const _m = new THREE.Matrix4();
  const puppets = [];

  // The cast
  const red = puppet(cast.get('figur-sol'), 1.25, { breath: 1 }) // Sol og figur's woman
    .def(0, 1, [0.86, 0.78], 0.28, [0.79, 0.6]) // head
    .def(1, 1, [0.07, 0.66], 0.33, [0.13, 0.26]) // the raised leg
    .def(2, 1, [0.88, 0.17], 0.17, [0.75, 0.42]); // the front arm
  const pink = puppet(cast.get('vaadt-haar'), 1.3, { breath: 1 }) // Vådt hår's woman
    .def(0, 1, [0.8, 0.6], 0.34, [0.6, 0.62]) // head
    .def(1, 2, [0.73, 0.67], 0.08); // her blue eye
  const faces = [
    { p: puppet(cast.get('portraet'), 2.3, { breath: 0.5 }), eyes: [[0.33, 0.52, 0.07], [0.63, 0.52, 0.07]], mouth: [0.5, 0.22, 0.12], at: [-3.1, 5.7, -7.8], look: -0.32 },
    { p: puppet(cast.get('blaa-oejne'), 2.1, { breath: 0.5 }), eyes: [[0.22, 0.53, 0.07], [0.62, 0.55, 0.1]], mouth: [0.38, 0.27, 0.13], at: [0, 7.0, -8.4], look: 0 },
    { p: puppet(cast.get('orange-mand'), 2.2, { breath: 0.5 }), eyes: [[0.43, 0.6, 0.07], [0.68, 0.6, 0.07]], mouth: [0.55, 0.35, 0.11], at: [3.1, 5.6, -7.8], look: 0.32 },
  ];
  for (const f of faces) {
    f.p.def(0, 2, f.eyes[0].slice(0, 2), f.eyes[0][2]).def(1, 2, f.eyes[1].slice(0, 2), f.eyes[1][2]).def(2, 2, f.mouth.slice(0, 2), f.mouth[2]);
    f.p.def(3, 1, [0.5, 0.6], 0.9, [0.5, -0.2]); // a sway of the whole head
  }
  const flowers = Array.from({ length: 9 }, (_, k) => puppet(cast.get('blomst'), 0.9 + (k % 3) * 0.18).def(0, 3, [0.5, 0.75], 0.6, [0, 0], 0.03, k * 1.7));
  const FLOWER_AT = [[-2.3, -1.2], [1.9, -1.6], [-1.1, -3.1], [0.9, -2.7], [2.9, -3.7], [-3.1, -3.5], [-4.5, -6.2], [4.3, -5.8], [0.2, -6.6]];
  const clouds = [0, 1, 2].map(() => puppet(cast.get('sky'), 6).def(0, 3, [0.5, 0.8], 0.8, [0, 0], 0.012, 0));
  const circles = [1, 2, 3, 4].map((k) => puppet(cast.get(`cirkel-${k}`), 1));
  const jug = puppet(cast.get('kande'), 1.55);
  const glass = puppet(cast.get('glas'), 0.95);
  const dusk = puppet(paintings.get('blaa-time'), 5.2);

  // The field: Rapsmarker laid out as the ground, mirrored tile by tile
  const groundTex = paintings.get('rapsmarker');
  if (groundTex) {
    groundTex.wrapS = groundTex.wrapT = THREE.MirroredRepeatWrapping;
    groundTex.needsUpdate = true;
  }
  // Only the fields (Rapsmarker's sky is the top fifth), mirrored tile by tile
  const groundMat = keep(
    new THREE.ShaderMaterial({
      uniforms: {
        map: { value: groundTex ?? null },
        uTint: { value: new THREE.Color('#ffffff') },
        uOpacity: { value: 1 },
        uFog: { value: new THREE.Color() },
        uNear: { value: 10 },
        uFar: { value: 80 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uTint;
        uniform float uOpacity;
        uniform vec3 uFog;
        uniform float uNear;
        uniform float uFar;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          vec2 f = 1.0 - abs(1.0 - mod(vUv, 2.0));
          vec3 col = texture2D(map, vec2(f.x, f.y * 0.77)).rgb * uTint;
          col = mix(col, uFog, smoothstep(uNear, uFar, vDist));
          gl_FragColor = vec4(col, uOpacity);
          ${OUTPUT}
        }`,
      transparent: true,
      depthWrite: false,
    }),
  );
  const groundGeo = keep(new THREE.PlaneGeometry(160, 160));
  const guv = groundGeo.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) * 22, guv.getY(i) * 22);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = -5;
  scene.add(ground);

  // ---------------------------------------------------------------- the stairs (in and out)
  // A spiral staircase you look straight down (or up) into: blue steps
  // winding round a column, the red walls of the painting round it all
  const stairs = new THREE.Group();
  const stepMats = ['#2b3df5', '#3524c8'].map((c) => keep(new THREE.MeshBasicMaterial({ color: c, toneMapped: false })));
  const edgeMat = keep(new THREE.MeshBasicMaterial({ color: '#8a3bff', toneMapped: false }));
  const wallMat = keep(new THREE.MeshBasicMaterial({ color: '#c8323e', toneMapped: false, side: THREE.BackSide }));
  const stepGeo = keep(new THREE.BoxGeometry(1.25, 0.12, 0.5));
  const edgeGeo = keep(new THREE.BoxGeometry(1.25, 0.03, 0.035));
  const STEPS = 30;
  const STEP_TURN = 0.42; // radians per step
  const STEP_DROP = 0.26; // metres per step
  const steps = Array.from({ length: STEPS }, (_, k) => {
    const g = new THREE.Group();
    const tread = new THREE.Mesh(stepGeo, stepMats[k % 2]);
    tread.position.x = 0.95;
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.set(0.95, 0.06, 0.25);
    g.add(tread, edge);
    stairs.add(g);
    return g;
  });
  const shaft = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.75, 1.75, 30, 48, 1, true)), wallMat);
  const column = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.28, 30, 24, 1, true)), keep(new THREE.MeshBasicMaterial({ color: '#2a1a9a', toneMapped: false })));
  stairs.add(shaft, column);
  scene.add(stairs);

  // ---------------------------------------------------------------- rings (song, planets' trails)
  const ringGeo = keep(new THREE.TorusGeometry(1, 0.02, 8, 100));
  const RING_COLOURS = ['#fcd23b', '#f767d3', '#ff2234', '#9fd36a', '#ffffff'];
  const rings = Array.from({ length: 10 }, (_, k) => {
    const m = new THREE.Mesh(
      ringGeo,
      keep(new THREE.MeshBasicMaterial({ color: RING_COLOURS[k % 5], transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending })),
    );
    m.visible = false;
    scene.add(m);
    return m;
  });

  // ---------------------------------------------------------------- kaleidoscope
  const kaleidoMat = keep(
    new THREE.ShaderMaterial({
      uniforms: {
        uTexA: { value: paintings.get('blaa-fliser') ?? null },
        uTexB: { value: paintings.get('moenster-lyseroed') ?? null },
        uMix: { value: 0 },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: PLAIN_VERT,
      fragmentShader: KALEIDO_FRAG,
      transparent: true,
      depthWrite: false,
    }),
  );
  const kaleido = new THREE.Mesh(keep(new THREE.PlaneGeometry(18, 18)), kaleidoMat);
  kaleido.position.set(STAGE.x, STAGE.y, -15);
  kaleido.renderOrder = 10;
  scene.add(kaleido);

  // ---------------------------------------------------------------- the pour (Grønt glas)
  const POUR = 260;
  const pourGeo = new THREE.BufferGeometry();
  pourGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POUR * 3), 3));
  keep(pourGeo);
  const pourMat = keep(
    new THREE.PointsMaterial({ map: glowTex, color: '#d8ff7a', size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  const pour = new THREE.Points(pourGeo, pourMat);
  pour.frustumCulled = false;
  scene.add(pour);
  const pourSeed = Array.from({ length: POUR }, () => Math.random());

  // ---------------------------------------------------------------- paint-dust
  const GRID = 112;
  const dustGeo = new THREE.BufferGeometry();
  {
    const n = GRID * GRID;
    const grid = new Float32Array(n * 2);
    const rnd = new Float32Array(n);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        grid[i * 2] = (x + 0.5) / GRID;
        grid[i * 2 + 1] = (y + 0.5) / GRID;
        rnd[i] = Math.random();
      }
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    dustGeo.setAttribute('grid', new THREE.BufferAttribute(grid, 2));
    dustGeo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  }
  keep(dustGeo);
  const dusts = [0, 1, 2, 3].map(() => {
    const u = {
      uTexA: { value: null },
      uTexB: { value: null },
      uUvA: { value: new THREE.Vector4(0, 0, 1, 1) },
      uUvB: { value: new THREE.Vector4(0, 0, 1, 1) },
      uBoxA: { value: new THREE.Matrix4() },
      uBoxB: { value: new THREE.Matrix4() },
      uPointA: { value: new THREE.Vector3() },
      uPointB: { value: new THREE.Vector3() },
      uIsPointA: { value: 0 },
      uIsPointB: { value: 0 },
      uProg: { value: 0 },
      uStagger: { value: 0.6 },
      uSwirl: { value: 1 },
      uCellA: { value: 0.03 },
      uCellB: { value: 0.03 },
      uProj: { value: 600 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uShimmer: { value: 0 },
    };
    const mat = keep(new THREE.ShaderMaterial({ uniforms: u, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false }));
    const points = new THREE.Points(dustGeo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 700;
    scene.add(points);
    return { points, u };
  });

  // A rectangle in the world: centre, width, height
  const boxAt = (out, x, y, z, w, h, rotZ = 0) =>
    out.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotZ), new THREE.Vector3(w, h, 1));
  const cellOf = (m) => {
    const e = m.elements;
    return Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6])) / GRID;
  };

  // One flight of paint-dust: from a picture (or a point) to a picture (or a point)
  // q: { a: {tex, uv, box | point}, b: {…}, t0, t1, swirl, stagger, fadeIn, fadeOut, shimmer }
  function flight(d, t, q) {
    const on = t >= q.show[0] && t <= q.show[1];
    d.points.visible = on;
    if (!on) return;
    const u = d.u;
    const side = (end, tex, uv, box, point, isPoint) => {
      tex.value = end.tex ?? null;
      uv.value.set(...(end.uv ?? [0, 0, 1, 1]));
      if (end.point) {
        point.value.copy(end.point);
        isPoint.value = 1;
      } else {
        box.value.copy(end.box);
        isPoint.value = 0;
      }
    };
    side(q.a, u.uTexA, u.uUvA, u.uBoxA, u.uPointA, u.uIsPointA);
    side(q.b, u.uTexB, u.uUvB, u.uBoxB, u.uPointB, u.uIsPointB);
    if (!q.a.tex) u.uTexA.value = q.b.tex;
    if (!q.b.tex) u.uTexB.value = q.a.tex;
    u.uCellA.value = q.a.point ? 0.02 : cellOf(q.a.box);
    u.uCellB.value = q.b.point ? 0.02 : cellOf(q.b.box);
    u.uProg.value = span(t, q.t0, q.t1);
    u.uSwirl.value = (q.swirl ?? 1) * calmK;
    u.uStagger.value = q.stagger ?? 0.6;
    u.uShimmer.value = q.shimmer ? q.shimmer(t) : 0;
    u.uOpacity.value = smooth((t - q.show[0]) / (q.fadeIn ?? 0.01)) * (1 - smooth((t - (q.show[1] - (q.fadeOut ?? 0.01))) / (q.fadeOut ?? 0.01)));
  }

  // ---------------------------------------------------------------- the song: who sings when
  const SONG = [];
  {
    const notes = [587.33, 659.25, 783.99, 880, 987.77, 783.99, 659.25, 880, 1174.66, 987.77, 783.99, 880, 659.25, 783.99];
    let tt = 26.6;
    notes.forEach((f, k) => {
      SONG.push({ t: tt, face: k % 3, f });
      tt += k % 3 === 2 ? 0.62 : 0.44;
    });
  }
  CUES.length = 0;
  SONG.forEach((s) => CUES.push({ t: s.t, kind: 'bell', f: s.f }));
  CUES.push({ t: 11.2, kind: 'shine' }, { t: 23.0, kind: 'bell', f: 1318.5 }, { t: 23.6, kind: 'bell', f: 1174.66 }, { t: 24.2, kind: 'bell', f: 987.77 });
  CUES.push({ t: 34, kind: 'swoosh' }, { t: 39.2, kind: 'pop' }, { t: 43.4, kind: 'pour' }, { t: 62, kind: 'swoosh' }, { t: 69.2, kind: 'swoosh' });
  CUES.sort((a, b) => a.t - b.t);

  // Fixed spots for the sky scenes
  const DANCE = new THREE.Vector3(0, 4.55, -8.4);
  const HOME = new THREE.Vector3(0, 5, -6); // where Lille stjerne puts itself together
  const homeH = 4.6;
  const homeW = homeH * (paintings.get('lille-stjerne')?.image?.width / paintings.get('lille-stjerne')?.image?.height || 0.8);
  const STAR_UV = [0.5688, 0.8008];

  const _boxA = new THREE.Matrix4();
  const _boxB = new THREE.Matrix4();
  const _v = new THREE.Vector3();
  const snapshot = new Map(); // puppet boxes captured as their dust flight begins
  const snap = (key, p) => {
    if (!snapshot.has(key)) snapshot.set(key, p.box(new THREE.Matrix4()));
    return snapshot.get(key);
  };

  // ------------------------------------------------------------------ frame
  let last = -1;
  function update(t, dt, aspect, heightPx) {
    if (t < last) snapshot.clear(); // played again from the start
    last = t;
    const now = t;
    for (const p of puppets) {
      p.mesh.visible = false;
      p.u.uTime.value += dt * calmK;
    }

    // ---- camera, sky, flash
    camera.aspect = aspect;
    camera.fov = FOV(t);
    camera.position.copy(CAM_POS(t));
    camera.lookAt(CAM_LOOK(t));
    if (!calm) camera.rotateZ(win(t, 40, 50, 2, 2) * Math.sin(t * 0.9) * 0.05 + win(t, 0, 6, 0.5, 0.4) * Math.sin(t * 1.3) * 0.04);
    camera.updateProjectionMatrix();
    const proj = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    skyMat.uniforms.uTop.value.copy(SKY_TOP(t));
    skyMat.uniforms.uMid.value.copy(SKY_MID(t));
    skyMat.uniforms.uLow.value.copy(SKY_LOW(t));
    skyMat.uniforms.uStars.value = STARS(t);
    skyMat.uniforms.uTime.value = t;
    sky.position.copy(camera.position);
    scene.fog.color.copy(SKY_MID(t)).lerp(SKY_LOW(t), 0.3);
    scene.fog.near = FOG_NEAR(t);
    scene.fog.far = FOG_FAR(t);
    flashMat.opacity = Math.min(1, FLASH(t));
    flash.visible = flashMat.opacity > 0.003;

    // ---- the stairs: down at the start, up near the end
    const down = t < 6;
    const up = t >= 66 && t < 69;
    stairs.visible = down || up;
    if (stairs.visible) {
      stairs.position.copy(camera.position);
      const dir = down ? -1 : 1;
      const travel = down ? t * 3.2 : (t - 66) * 4.5; // steps passed
      steps.forEach((g, k) => {
        const kk = (((k - travel) % STEPS) + STEPS) % STEPS;
        g.position.set(0, dir * (0.9 + kk * STEP_DROP), 0);
        g.rotation.y = kk * STEP_TURN + (down ? 0 : Math.PI);
        g.visible = kk > 0.6;
      });
      shaft.position.y = column.position.y = dir * 15;
      wallMat.color.set(down ? '#a8283a' : '#c8323e');
    }

    // ---- the star: waiting at the bottom of the stairs, rising, then home
    let starOn = 0;
    if (down) {
      // the reflected star in the doorway, at the foot of the stairs
      const k = smooth(t / 5.6);
      star.position.set(0, -7 + k * 5.4, -0.5 + k * 0.2).add(camera.position);
      starOn = 1;
      starBody.scale.setScalar(0.6 + 1.6 * easeIn(t / 6));
      starGlow.scale.setScalar(2.5 + 9 * easeIn(t / 6));
    } else if (t < 58) {
      // the sun: up from the horizon, over the sky scenes, down in the blue hour
      const rise = easeOut((t - 6) / 6);
      const set = easeIn((t - 52) / 6);
      star.position.set(lerp(0, 11, smooth((t - 19) / 5)), lerp(0.2, 8.5, rise) + smooth((t - 19) / 5) * 2 - set * 13, -32);
      starOn = 1 - smooth((t - 56) / 2);
      starBody.scale.setScalar(lerp(1.2, 3.4, rise));
      starGlow.scale.setScalar(lerp(6, 15, rise) * (1 - 0.5 * set));
      starGlow.material.color.set('#ffd36b').lerp(_c.set('#ff6a2b'), smooth((t - 50) / 4));
    }
    if (t >= 62 && t < 66) {
      // born again where everything gathered
      const born = smooth((t - 63.2) / 1.8);
      const rush = easeIn((t - 65) / 1);
      star.position.copy(DANCE).lerp(camera.position, rush * 0.85);
      starOn = born;
      starBody.scale.setScalar(0.4 + 1.2 * born);
      starGlow.scale.setScalar(2 + 5 * born + 10 * rush);
    } else if (up) {
      // ahead, up the stairs
      star.position.set(0, 6.5 - smooth((t - 66) / 3) * 4.5, -0.5).add(camera.position);
      starOn = 1;
      starBody.scale.setScalar(0.9 + easeIn((t - 67.6) / 1.4) * 3);
      starGlow.scale.setScalar(4 + easeIn((t - 67.6) / 1.4) * 12);
    } else if (t >= 69) {
      // home: from the middle of the burst to its window in the painting
      const k = smooth((t - 71) / 2);
      const target = _v.set(HOME.x + (STAR_UV[0] - 0.5) * homeW, HOME.y + (STAR_UV[1] - 0.5) * homeH, HOME.z + 0.05);
      star.position.set(HOME.x, HOME.y, HOME.z + 0.6).lerp(target, k);
      starOn = 1 - smooth((t - 73) / 1.2);
      starBody.scale.setScalar(lerp(1.4, homeW * 0.11, k));
      starGlow.scale.setScalar(lerp(6, 1.2, k));
    }
    star.visible = starOn > 0.003;
    starBody.material.opacity = starOn;
    starGlow.material.opacity = starOn * 0.85;
    starBody.material.rotation += dt * 0.3 * calmK;

    // ---- the field
    const fieldOn = win(t, 5.9, 61.5, 0.3, 3);
    ground.visible = fieldOn > 0.003;
    groundMat.uniforms.uOpacity.value = fieldOn;
    groundMat.uniforms.uTint.value.set('#ffffff').lerp(_c.set('#3a4bc0'), smooth((t - 51) / 6));
    groundMat.uniforms.uFog.value.copy(scene.fog.color);
    groundMat.uniforms.uNear.value = 8;
    groundMat.uniforms.uFar.value = 70;

    // ---- flowers: sprout on the field, then a wreath round the party
    flowers.forEach((f, k) => {
      const [x, z] = FLOWER_AT[k];
      const grow = pop((t - (12.6 + k * 0.38)) / 0.9);
      const lift = smooth((t - (35.5 + k * 0.15)) / 3);
      const a = (k / flowers.length) * Math.PI * 2 + (t - 35) * 0.25 * calmK;
      const wx = STAGE.x + Math.cos(a) * 4.6;
      const wy = STAGE.y + Math.sin(a) * 3.1;
      const fx = lerp(x, wx, lift);
      const fy = lerp(f.height * 0.5 * grow, wy, lift);
      const fz = lerp(z, -11, lift);
      f.set(0, 0.03 + 0.03 * Math.sin(t * 0.7 + k));
      f.show(win(t, 12.6, 53, 0.2, 2.5), fx, fy, fz, Math.max(0.001, grow) * (1 - 0.3 * lift), lift * a * 0.2);
    });

    // ---- the clouds: one drifting over the morning, two rolling in at dusk
    clouds[0].show(win(t, 7, 21, 2, 1.6), lerp(-24, -6, (t - 7) / 14), 9.5, -34, 1.2);
    clouds[1].show(win(t, 50, 62.3, 2.5, 0.3), lerp(-14, -3.9, easeOut((t - 50) / 6)), 8.6, -12, 0.42);
    clouds[2].show(win(t, 50.5, 62, 2.5, 1), lerp(14, 4.1, easeOut((t - 50.5) / 6)), 8.1, -12.4, 0.38, 0, true);
    const drain = smooth((t - 52) / 6);
    for (const c of clouds) c.u.uDrain.value = 0.3 + 0.5 * drain;

    // ---- the red woman: asleep on the field, wakes, rises, dances, sleeps
    {
      const wake = smooth((t - 14) / 2.2);
      const sleep = smooth((t - 55) / 2.6);
      const awake = wake * (1 - sleep);
      red.set(0, lerp(-0.32, 0.04 + 0.08 * Math.sin(t * 1.3), awake)); // head
      red.set(1, lerp(0.95, 0.12 * Math.sin(t * 2.2) - 0.05, awake) + win(t, 40, 50, 1, 1) * 0.25 * Math.sin(t * 4.4)); // the leg kicks
      red.set(2, win(t, 40, 50, 1, 1) * 0.35 * Math.sin(t * 4.4 + 1)); // the arm waves in the dance
      let x = -0.15;
      let y = 0.6;
      let z = 1.4;
      let s = 1;
      // carried up by the song
      const rise = smooth((t - 24.5) / 6);
      x = lerp(x, 0, rise);
      y = lerp(y, 3.6, rise) + Math.sin(t * 1.1) * 0.06 * rise;
      z = lerp(z, -8.2, rise);
      s = lerp(1, 1.5, rise);
      // the dance
      const dance = win(t, 39.6, 51.5, 1.2, 1.6);
      const a = (t - 40) * 1.05 * calmK;
      const dx = DANCE.x + Math.cos(a) * 1.15;
      const dy = DANCE.y - 0.2 + Math.abs(Math.sin(t * 2.2)) * 0.18;
      const dz = DANCE.z + Math.sin(a) * 0.6;
      x = lerp(x, dx, dance);
      y = lerp(y, dy, dance);
      z = lerp(z, dz, dance);
      // asleep beside her
      const rest = smooth((t - 52) / 4);
      x = lerp(x, -0.85, rest);
      y = lerp(y, 4.0, rest);
      z = lerp(z, -8.5, rest);
      const flip = dance > 0.5 && rest < 0.5 && Math.cos(a) > 0;
      red.u.uDrain.value = drain * 0.75;
      red.show(win(t, 5.95, 62.05, 0.05, 0.05), x, y, z, s, 0, flip);
      red.u.uGlow.value.setRGB(0.25, 0.08, 0.02).multiplyScalar(win(t, 26, 32, 1, 2));
    }

    // ---- the faces in the sky
    faces.forEach((f, k) => {
      const appear = smooth((t - (20.4 + k * 0.5)) / 1.6);
      const open = smooth((t - (23 + k * 0.6)) / 0.3);
      const blinkPhase = (t * 0.37 + k * 0.29) % 1;
      const blink = 1 - win(blinkPhase, 0.9, 0.98, 0.03, 0.03) * 0.9;
      const eyes = lerp(0.1, 1, open) * (open > 0.99 ? blink : 1);
      f.p.set(0, eyes).set(1, eyes);
      // singing: the mouth opens on each of its notes
      let mouth = 0;
      for (const s of SONG) if (s.face === k) mouth = Math.max(mouth, win(t, s.t - 0.05, s.t + 0.42, 0.06, 0.3));
      f.p.set(2, 1 + 0.9 * mouth, 1 + 0.12 * mouth);
      f.p.set(3, Math.sin(t * 0.9 + k * 2) * 0.05 + mouth * 0.04);
      const [x, y, z] = f.at;
      const bob = Math.sin(t * 0.8 + k * 1.9) * 0.12;
      f.p.show(appear * (t < 34 ? 1 : 0), x, y + bob, z - (1 - appear) * 8, 1, 0, false, f.look * open);
      f.p.u.uGlow.value.setRGB(0.2, 0.12, 0.05).multiplyScalar(mouth);
    });

    // song rings, from the mouth of whoever sings
    rings.forEach((r) => (r.visible = false));
    {
      let ri = 0;
      for (const s of SONG) {
        const age = t - s.t;
        if (age < 0 || age > 1.6 || ri >= rings.length) continue;
        const f = faces[s.face];
        const ring = rings[ri++];
        ring.visible = true;
        const [mu, mv] = f.mouth;
        ring.position.set(f.at[0] + (mu - 0.5) * f.p.height * f.p.aspect, f.at[1] + (mv - 0.5) * f.p.height, f.at[2] + 0.1);
        ring.scale.setScalar(0.15 + age * 1.6);
        ring.material.opacity = (1 - age / 1.6) * 0.8;
      }
    }

    // ---- Festen: the faces fall apart into paint and become Cirkler
    const cirklerTex = paintings.get('cirkler');
    const cirklerH = 3.6;
    const cirklerW = cirklerH * (cirklerTex?.image ? cirklerTex.image.width / cirklerTex.image.height : 1);
    const CIRK = new THREE.Vector3(STAGE.x, STAGE.y + 1.5, -10.4);
    if (t >= 33.9 && t < 40.4) {
      faces.forEach((f, k) => {
        flight(dusts[k], t, {
          show: [34, 40.4],
          a: { tex: f.p.u.map.value, box: snap(`face${k}`, f.p) },
          b: { tex: cirklerTex, uv: [k / 3, 0, 1 / 3, 1], box: boxAt(_boxB, CIRK.x + (k / 3 + 1 / 6 - 0.5) * cirklerW, CIRK.y, CIRK.z, cirklerW / 3, cirklerH) },
          t0: 34,
          t1: 37.6,
          swirl: 1.6,
          shimmer: (tt) => 0.04 * win(tt, 37.6, 40.4, 0.5, 0.5),
          fadeOut: 1.2,
        });
      });
      // the drifting cloud joins in as the sparkle round it
      flight(dusts[3], t, {
        show: [34, 39.6],
        a: { tex: clouds[0].u.map.value, box: snap('cloud0', clouds[0]) },
        b: { point: CIRK },
        t0: 34,
        t1: 38,
        swirl: 2.4,
        fadeIn: 1,
        fadeOut: 1.6,
      });
    } else {
      dusts.forEach((d) => (d.points.visible = false));
    }

    // Cirkler's circles step out of the painting and fly into orbit
    circles.forEach((c, k) => {
      const meta = CAST[`cirkel-${k + 1}`];
      const [x0, y0, x1, y1] = meta.box; // where it sat in the photo (fractions, y from the top)
      const homeX = CIRK.x + ((x0 + x1) / 2 - 0.5) * cirklerW;
      const homeY = CIRK.y + (0.5 - (y0 + y1) / 2) * cirklerH;
      const size = (y1 - y0) * cirklerH;
      const out = easeOut((t - 39.8) / 2.2);
      const a = (k / 4) * Math.PI * 2 + 0.6 + (t - 40) * 0.42 * calmK;
      const ox = STAGE.x + Math.cos(a) * 3.5;
      const oy = STAGE.y + 0.2 + Math.sin(a) * 2.2;
      const oz = -9.4 + Math.sin(a) * 1.2;
      const drift = easeIn((t - 50) / 3);
      const x = lerp(homeX, ox, out);
      const y = lerp(homeY, oy, out) + drift * 6;
      const z = lerp(CIRK.z + 0.02, oz, out);
      c.u.uSize.value.set(size, size);
      c.show(win(t, 39.2, 53, 0.4, 2), x, y, z, 1 - 0.25 * out, (t - 40) * 0.8 * (k % 2 ? 1 : -1) * calmK);
      c.u.uDrain.value = drain * 0.6;
    });

    // ---- the pink woman arrives and dances
    {
      const enter = easeOut((t - 38.4) / 2);
      const a = (t - 40) * 1.05 * calmK + Math.PI;
      const dance = win(t, 39.6, 51.5, 0.01, 1.6);
      let x = lerp(7, DANCE.x + Math.cos(a) * 1.15, enter);
      let y = lerp(6.5, DANCE.y + Math.abs(Math.sin(t * 2.2 + 1)) * 0.16, enter);
      let z = lerp(-9, DANCE.z + Math.sin(a) * 0.6, enter);
      const rest = smooth((t - 52) / 4);
      x = lerp(x, 0.75, rest);
      y = lerp(y, 3.95, rest);
      z = lerp(z, -8.45, rest);
      const flip = dance > 0.5 && rest < 0.5 ? Math.cos(a) > 0 : true;
      const asleep = smooth((t - 55.4) / 1.2);
      const blinkPhase = (t * 0.31) % 1;
      pink.set(0, (0.12 * Math.sin(t * 2.2) * win(t, 40, 51, 1, 1)) - 0.25 * asleep); // nods to the beat, droops asleep
      pink.set(1, lerp(1 - win(blinkPhase, 0.9, 0.98, 0.03, 0.03) * 0.9, 0.1, asleep));
      pink.u.uDrain.value = drain * 0.75;
      pink.show(win(t, 38.4, 62.05, 0.6, 0.05), x, y, z, 1.25, rest * -1.25, flip);
    }

    // ---- Grønt glas: the jug tips and pours light into the glass
    {
      const on = win(t, 40.6, 51, 0.8, 1.6);
      const tip = smooth((t - 42) / 1.4) * (1 - smooth((t - 47.2) / 1.2));
      jug.show(on, -3.2, 6.3, -9.6, 1, -1.15 * tip);
      const brim = smooth((t - 44) / 3);
      glass.show(on, -2.15, 4.05, -9.5, 1);
      glass.u.uGlow.value.setRGB(0.35, 0.5, 0.12).multiplyScalar(brim * (0.7 + 0.3 * Math.sin(t * 6)));
      // spout: the jug's top right corner, turned with it
      const h = jug.height;
      const w = h * jug.aspect;
      const sx = -3.2 + Math.cos(-1.15 * tip) * (w * 0.42) - Math.sin(-1.15 * tip) * (h * 0.47);
      const sy = 6.3 + Math.sin(-1.15 * tip) * (w * 0.42) + Math.cos(-1.15 * tip) * (h * 0.47);
      const flow = win(t, 43.2, 47.6, 0.3, 0.5);
      pour.visible = flow > 0.003;
      pourMat.opacity = flow;
      const pos = pourGeo.attributes.position.array;
      for (let i = 0; i < POUR; i++) {
        const k = (pourSeed[i] + t * 0.9) % 1;
        const tx = -2.15;
        const ty = 4.05 + glass.height * 0.25;
        pos[i * 3] = lerp(sx, tx, k) + Math.sin(k * 3.1) * 0.25 + (pourSeed[(i + 7) % POUR] - 0.5) * 0.06;
        pos[i * 3 + 1] = lerp(sy, ty, k) + Math.sin(k * Math.PI) * 0.35 - k * k * 0.2;
        pos[i * 3 + 2] = -9.5;
      }
      pourGeo.attributes.position.needsUpdate = true;
    }

    // ---- the patterns turn behind everything, Blåt mønster melting into Lyserødt mønster
    kaleidoMat.uniforms.uOpacity.value = win(t, 44.6, 52.4, 2, 2.4) * 0.92;
    kaleido.visible = kaleidoMat.uniforms.uOpacity.value > 0.003;
    kaleidoMat.uniforms.uTime.value = t * calmK;
    kaleidoMat.uniforms.uMix.value = 0.5 + 0.5 * Math.sin(t * 0.6);

    // ---- Blå time: the painting comes up behind them, its window lit
    dusk.show(win(t, 50.6, 62.05, 2.6, 0.05) * 0.8, 0, 5.2, -14, 1);
    dusk.u.uDrain.value = 0.2;

    // ---- Hjem: everyone turns to light and gathers into the star…
    if (t >= 61.95 && t < 66) {
      const P = DANCE.clone();
      flight(dusts[0], t, { show: [62, 65.6], a: { tex: red.u.map.value, box: snap('red', red) }, b: { point: P }, t0: 62.1, t1: 64.6, swirl: 1.4, fadeOut: 0.8 });
      flight(dusts[1], t, { show: [62, 65.6], a: { tex: pink.u.map.value, box: snap('pink', pink) }, b: { point: P }, t0: 62.2, t1: 64.8, swirl: 1.4, fadeOut: 0.8 });
      flight(dusts[2], t, { show: [62, 65.6], a: { tex: dusk.u.map.value, box: snap('dusk', dusk) }, b: { point: P }, t0: 62, t1: 65, swirl: 2.2, fadeOut: 0.8 });
      flight(dusts[3], t, { show: [62, 65.6], a: { tex: clouds[1].u.map.value, box: snap('cloud1', clouds[1]) }, b: { point: P }, t0: 62.3, t1: 65, swirl: 2, fadeOut: 0.8 });
    }
    // …and, up the stairs, the painting Lille stjerne puts itself together round it
    if (t >= 69) {
      const lille = paintings.get('lille-stjerne');
      const burst = _v.set(HOME.x, HOME.y, HOME.z + 0.6);
      dusts.forEach((d, k) => {
        const qx = k % 2;
        const qy = Math.floor(k / 2);
        flight(d, t, {
          show: [69, 80],
          a: { tex: lille, uv: [qx / 2, qy / 2, 0.5, 0.5], point: burst.clone() },
          b: {
            tex: lille,
            uv: [qx / 2, qy / 2, 0.5, 0.5],
            box: boxAt(_boxA, HOME.x + (qx - 0.5) * (homeW / 2), HOME.y + (qy - 0.5) * (homeH / 2), HOME.z, homeW / 2, homeH / 2),
          },
          t0: 69.2 + k * 0.15,
          t1: 72.8,
          swirl: 2.2,
          stagger: 0.75,
        });
      });
    }
    for (const d of dusts) {
      d.u.uProj.value = proj;
      d.u.uTime.value = now;
    }
  }
  const _c = new THREE.Color();

  function frame(t, dt, aspect, heightPx = 800) {
    update(t, dt, aspect, heightPx);
  }

  function caption(t) {
    for (const [a, b, text] of STORY) if (t >= a - 0.1 && t <= b + 0.1) return { text, alpha: win(t, a, b, 0.8, 0.9) };
    return { text: '', alpha: 0 };
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { scene, camera, frame, caption, dispose, duration: DURATION, cues: CUES };
}
