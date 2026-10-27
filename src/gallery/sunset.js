// A hidden feature: lean in to Sol og figur and tap its sun. The sun sinks
// out of the blue disc, the sky burns orange and goes to night (with stars),
// then the sun comes back up. The dotted ring streams along its arc the whole
// time, and the gallery's own lights follow the day: warm at sunset, dim and
// blue at night. One cycle, then everything is as it was.
//
// Like trip.js, it is a patch on the painting's own material: the star is
// lifted off the painting (its spot refilled with sky paint from around it)
// and drawn again lower down, only where the painting is sky.
import * as THREE from 'three';

// Measured on public/art/sol-og-figur-1024.jpg (u from the left, v from the
// bottom). Lengths are in v units, in a space where u is scaled by the
// aspect so circles stay round.
const CENTRE = [0.4373, 0.7105]; // the blue disc and the dotted ring share it
const DISC_R = 0.2123;
const DOT_R = 0.241; // the ring of red dots…
const DOT_ARC = [-131, 71]; // …runs from here to here (degrees, counter-clockwise from the right)
const STAR = [0.3987, 0.7507];
const STAR_R = 0.15; // the star's reach, rays and their ragged tips included
const DROP = [0.02, -0.4]; // where the sun goes when it has set

const DURATION = 22; // seconds for the whole day

const GLSL_HEAD = /* glsl */ `
uniform float uOn;
uniform float uDrop;
uniform float uDusk;
uniform float uNight;
uniform float uPhi;
uniform float uTime;
uniform float uAspect;
vec3 sunsetGlow = vec3(0.0);

const vec2 S_CENTRE = vec2(${CENTRE.join(', ')});
const float S_DISC_R = ${DISC_R};
const float S_DOT_R = ${DOT_R};
const float S_BAND = 0.014;
const float S_A0 = ${THREE.MathUtils.degToRad(DOT_ARC[0]).toFixed(5)};
const float S_SPAN = ${THREE.MathUtils.degToRad(DOT_ARC[1] - DOT_ARC[0]).toFixed(5)};
const vec2 S_STAR = vec2(${STAR.join(', ')});
const float S_STAR_R = ${STAR_R};
const vec2 S_DROP = vec2(${DROP.join(', ')});
const vec3 S_SKY = vec3(0.058, 0.138, 0.5); // the disc's blue, linear

float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Colour tests on linear texels
bool sBlue(vec3 c) { return c.b > 0.25 && c.b > c.r * 1.8 && c.b > c.g * 1.3; }
bool sDot(vec3 c) { return c.r > 0.2 && c.g < 0.06 && c.b < 0.12; }

vec4 sunsetSample(vec2 uv) {
  vec4 orig = texture(map, uv);
  if (uOn <= 0.0) return orig;

  vec2 asp = vec2(uAspect, 1.0);
  vec2 p = (uv - S_CENTRE) * asp;
  float r = length(p);
  vec3 col = orig.rgb;

  // The painted star leaves: everything inside its reach that is not sky
  // (rays, their orange edges) gets the sky paint just beyond the rays
  vec2 q = (uv - S_STAR) * asp;
  float rq = length(q);
  bool wasStar = rq < S_STAR_R && !sBlue(col);
  if (wasStar) {
    // The sky's colour around the star, averaged, with a little brush grain
    vec3 sum = vec3(0.0);
    float n = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398;
      vec3 c = texture(map, S_STAR + vec2(cos(a), sin(a)) * (S_STAR_R + 0.01) / asp, 4.0).rgb;
      if (sBlue(c)) { sum += c; n += 1.0; }
    }
    vec3 fill = n > 0.0 ? sum / n : S_SKY;
    col = fill * (0.9 + 0.2 * sHash(floor(uv * vec2(140.0, 40.0))));
  }

  // Sky: the blue of the disc, and of the corner it opens into up to the frame
  bool region = r < S_DISC_R * 1.06 || (uv.x < 0.45 && uv.y > 0.6);
  bool sky = region && (wasStar || sBlue(orig.rgb));

  if (sky) {
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722)) / 0.135; // keeps the brush texture
    float h = clamp((p.y + S_DISC_R) / (2.0 * S_DISC_R), 0.0, 1.0);
    vec3 dusk = mix(vec3(0.85, 0.16, 0.02), vec3(0.3, 0.03, 0.2), h);
    col = mix(col, dusk * lum, uDusk);
    col = mix(col, vec3(0.01, 0.012, 0.055) * lum, uNight);

    // Stars come out at night, each twinkling at its own pace
    vec2 g = uv * 90.0;
    vec2 cell = floor(g);
    float hs = sHash(cell);
    if (hs > 0.93) {
      vec2 at = vec2(sHash(cell + 3.1), sHash(cell + 7.3)) - 0.5;
      float d = length(fract(g) - 0.5 - at * 0.6);
      float star = smoothstep(0.14, 0.0, d) * (0.6 + 0.4 * sin(uTime * 2.0 + hs * 40.0)) * uNight;
      col += vec3(1.0, 0.95, 0.8) * star;
      sunsetGlow += vec3(1.0, 0.95, 0.8) * star;
    }

    // The sun, moved down its path: drawn only where there is sky
    vec2 su = uv - S_DROP * uDrop;
    if (length((su - S_STAR) * asp) < S_STAR_R) {
      vec3 sc = texture(map, su).rgb;
      if (!sBlue(sc)) {
        vec3 sunCol = mix(sc, vec3(1.0, 0.32, 0.04), uDusk * 0.75);
        col = sunCol;
        sunsetGlow += sunCol * 0.7;
      }
    }
    sunsetGlow += col * 0.1 * uDusk; // a sunset sky lights itself a little
  }

  // The dots stream along their arc: where a dot was, the pink behind it;
  // where the arc, turned back by uPhi, has a dot, that dot
  if (abs(r - S_DOT_R) < S_BAND) {
    float rel = atan(p.y, p.x) - S_A0;
    if (rel >= 0.0 && rel <= S_SPAN) {
      vec2 dir = p / r;
      if (sDot(col)) col = texture(map, S_CENTRE + dir * (S_DOT_R + S_BAND * 1.6) / asp).rgb;
      float a = S_A0 + mod(rel - uPhi, S_SPAN);
      vec3 dotC = texture(map, S_CENTRE + vec2(cos(a), sin(a)) * r / asp).rgb;
      if (sDot(dotC)) col = dotC;
    }
  }

  return vec4(col, orig.a);
}
`;

const smooth = (t) => {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
};
const between = (a, b, t) => smooth((t - a) / (b - a));

// The day, as a function of s = 0..1 through the cycle
function day(s) {
  const drop = s < 0.32 ? smooth(s / 0.32) : s < 0.62 ? 1 : 1 - between(0.62, 0.86, s);
  const dusk = between(0.04, 0.22, s) * (1 - between(0.3, 0.42, s)) + 0.55 * between(0.64, 0.74, s) * (1 - between(0.78, 0.92, s));
  const night = between(0.3, 0.42, s) * (1 - between(0.62, 0.74, s));
  return { drop, dusk, night };
}

export function createSunset({ material, aspect, room }) {
  const uniforms = {
    uOn: { value: 0 },
    uDrop: { value: 0 },
    uDusk: { value: 0 },
    uNight: { value: 0 },
    uPhi: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: aspect },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n#ifdef USE_MAP\n${GLSL_HEAD}\n#endif`)
      .replace('#include <map_fragment>', '#ifdef USE_MAP\n  diffuseColor *= sunsetSample( vMapUv );\n#endif')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_MAP\n  totalEmissiveRadiance += sunsetGlow;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'sunset';

  const span = THREE.MathUtils.degToRad(DOT_ARC[1] - DOT_ARC[0]);
  let running = false;
  let s = 0;

  function apply() {
    const { drop, dusk, night } = day(s);
    uniforms.uOn.value = running ? 1 : 0;
    uniforms.uDrop.value = drop;
    uniforms.uDusk.value = dusk;
    uniforms.uNight.value = night;
    // One whole arc over the day, so every dot is back in its place at the end
    uniforms.uPhi.value = span * (s * s * s * (s * (s * 6 - 15) + 10));
    room.setMood(dusk, night);
  }

  const hitsSun = (hit) => {
    if (!hit?.uv || hit.object.material !== material) return false;
    return Math.hypot((hit.uv.x - STAR[0]) * aspect, hit.uv.y - STAR[1]) < STAR_R;
  };

  return {
    tap(hit, { leaned }) {
      if (running || !leaned || !hitsSun(hit)) return false;
      running = true;
      s = 0;
      return true;
    },
    reset() {
      if (!running && s === 0) return;
      running = false;
      s = 0;
      apply();
    },
    update(dt) {
      if (!running) return;
      uniforms.uTime.value += dt;
      s += dt / DURATION;
      if (s >= 1) {
        running = false;
        s = 0;
      }
      apply();
    },
  };
}
