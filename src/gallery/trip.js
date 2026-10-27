// A hidden feature: lean in to Lilla skyer and tap its red sun, and the
// painting comes alive. The clouds boil, ripples and a slow swirl spread from
// the sun, colour waves roll outwards, and every so often the picture folds
// into a kaleidoscope. Tap again (or step away) and it settles back.
//
// No video: the effect is a patch on the painting's own material, so it warps
// whatever texture is on the wall (thumb or full size), stays lit by the room
// and shows in the floor's reflection. Colours drift slowly, never flash.
import * as THREE from 'three';

// Which works have a trip, and where their trigger sits in texture space
// (u from the left, v from the bottom; measured on public/art/<id>-1024.jpg)
export const TRIPS = {
  'lilla-skyer': { sun: [0.2541, 0.5129], radius: [0.0426, 0.0337], horizon: 0.458 },
};

const IN_RATE = 0.9; // per second: the trip builds over ~2 s…
const OUT_RATE = 2.6; // …and settles in under a second
const TAP_SLACK = 2.2; // the sun is small: a tap this many radii out still counts

const GLSL_HEAD = /* glsl */ `
uniform float uTrip;
uniform float uTime;
uniform vec2 uSun;
uniform float uAspect;
uniform float uHorizon;
vec3 tripGlow = vec3(0.0);

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x),
             mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * tNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// Rotate a colour's hue around the grey axis
vec3 tHue(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
// Mirror outside 0..1, so warped edges reflect the painting instead of smearing
vec2 tMirror(vec2 uv) { return 1.0 - abs(1.0 - mod(uv, 2.0)); }

vec4 tripSample(vec2 uv0) {
  // Gradients of the unwarped coordinates: no mip seams where the warp folds
  vec2 gx = dFdx(uv0), gy = dFdy(uv0);
  if (uTrip <= 0.0) return texture(map, uv0);

  float k = uTrip;
  float t = uTime;
  vec2 asp = vec2(uAspect, 1.0); // square space, so rings around the sun are round
  vec2 p = (uv0 - uSun) * asp;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Boiling sky, flowing fields: a slow fbm domain warp, stronger above the horizon
  vec2 q = vec2(tFbm(uv0 * 3.0 + vec2(0.0, t * 0.25)), tFbm(uv0 * 3.0 + vec2(5.2, -t * 0.22)));
  vec2 warp = (q - 0.5) * 0.13 * k * mix(0.55, 1.5, smoothstep(uHorizon - 0.06, uHorizon + 0.06, uv0.y));
  // The furrows slide sideways in waves
  warp.x += k * 0.018 * sin(uv0.y * 26.0 - t * 1.7) * (1.0 - smoothstep(uHorizon - 0.02, uHorizon + 0.04, uv0.y));

  // A swirl around the sun that breathes in and out, and ripples running outwards
  float swirlAng = ang + k * (0.9 * sin(t * 0.31) + 0.5) / (1.0 + r * 6.0);
  float rr = r + k * 0.011 * sin(r * 40.0 - t * 3.0);
  vec2 uvS = uSun + vec2(cos(swirlAng), sin(swirlAng)) * rr / asp + warp;

  // Kaleidoscope: the painting folds into eight mirrored slices, in phases
  float seg = 6.2831853 / 8.0;
  float folded = abs(mod(ang + t * 0.15, seg) - seg * 0.5) - t * 0.08;
  vec2 uvK = uSun + vec2(cos(folded), sin(folded)) * rr / asp * (1.0 + 0.15 * sin(t * 0.4)) + warp * 0.5;
  float kal = k * smoothstep(0.55, 0.95, 0.5 + 0.5 * sin(t * 0.21 - 1.4));

  // Colour fringes pulling away from the sun
  vec2 ca = (uvS - uSun) * 0.02 * k;
  vec4 mid = textureGrad(map, tMirror(uvS), gx, gy);
  vec3 colS = vec3(textureGrad(map, tMirror(uvS + ca), gx, gy).r, mid.g, textureGrad(map, tMirror(uvS - ca), gx, gy).b);
  vec3 colK = textureGrad(map, tMirror(uvK), gx, gy).rgb;
  vec3 col = mix(colS, colK, kal);

  // Hue waves rolling out from the sun (slow: a full cycle takes ~12 s)
  vec3 shifted = tHue(col, t * 0.5 + r * 7.0 + q.x * 2.5);
  float l = dot(shifted, vec3(0.2126, 0.7152, 0.0722));
  shifted = max(mix(vec3(l), shifted, 1.6), 0.0);
  col = mix(col, shifted, 0.8 * k);

  // It glows from within, the sun most of all
  float sun = 1.0 - smoothstep(0.0, 0.09, r);
  tripGlow = k * (col * 0.18 +vec3(1.0, 0.25, 0.35) * sun * (0.8 + 0.5 * sin(t * 1.6)));
  return vec4(col, mid.a);
}
`;

export function createTrip(material, { aspect, sun, radius, horizon }) {
  const uniforms = {
    uTrip: { value: 0 },
    uTime: { value: 0 },
    uSun: { value: new THREE.Vector2(...sun) },
    uAspect: { value: aspect },
    uHorizon: { value: horizon },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n#ifdef USE_MAP\n${GLSL_HEAD}\n#endif`)
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n  diffuseColor *= tripSample( vMapUv );\n#endif',
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_MAP\n  totalEmissiveRadiance += tripGlow;\n#endif',
      );
  };
  // Its own program: the other paintings share the unpatched one
  material.customProgramCacheKey = () => 'trip';

  let goal = 0;
  let k = 0;

  return {
    get active() {
      return goal === 1;
    },
    // How far in (0..1), for the camera sway
    get amount() {
      return k * k * (3 - 2 * k);
    },
    get time() {
      return uniforms.uTime.value;
    },
    start() {
      goal = 1;
    },
    stop() {
      goal = 0;
    },
    reset() {
      goal = k = 0;
      uniforms.uTrip.value = 0;
    },
    // A raycast hit on the art plane: is it on (or near) the sun?
    hitsSun(hit) {
      if (!hit?.uv || hit.object.material !== material) return false;
      const du = (hit.uv.x - sun[0]) / radius[0];
      const dv = (hit.uv.y - sun[1]) / radius[1];
      return du * du + dv * dv <= TAP_SLACK * TAP_SLACK;
    },
    update(dt, { slow = false } = {}) {
      if (goal === 0 && k === 0) return;
      k += (goal - k) * (1 - Math.exp(-dt * (goal ? IN_RATE : OUT_RATE)));
      if (goal === 0 && k < 0.002) k = 0;
      uniforms.uTrip.value = k * k * (3 - 2 * k);
      uniforms.uTime.value += dt * (slow ? 0.3 : 1);
    },
  };
}
