// A hidden feature: lean in to Blåt mønster and tap the cross in its middle.
// The pattern grows out of the frame and over every wall of the gallery, a
// glowing edge running ahead of it, until the room is one of Selma's tiles.
// It stays while you walk around; lean in to Blåt mønster and tap it again
// and the pattern draws back into the painting.
//
// The walls share one material (mats.wall in gallery.js); this patches it to
// lay the painting over the wall paint inside a growing radius around the
// painting, mirrored tile by tile, so the borders meet like real tiles.
import * as THREE from 'three';

// Measured on public/art/blaa-fliser-1024.jpg (u from the left, v from the bottom)
const CROSS = [0.5075, 0.4931];
const CROSS_R = [0.11, 0.085]; // the oval around the cross: generous for a finger
const TILE_W = 0.75; // metres of wall per tile across (the height follows the painting)
const REACH = 30; // metres: past the farthest corner of the room
const GROW = 7; // seconds to cover the room…
const SHRINK = 3; // …and to draw back

const GLSL_VERT = /* glsl */ `
varying vec3 vSpreadPos;
`;

const GLSL_FRAG = /* glsl */ `
uniform float uSpread;
uniform vec3 uOrigin;
uniform sampler2D uPattern;
uniform vec2 uTile;
uniform float uTime;
varying vec3 vSpreadPos;
vec3 spreadGlow = vec3(0.0);

float spHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float spNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(spHash(i), spHash(i + vec2(1.0, 0.0)), u.x),
             mix(spHash(i + vec2(0.0, 1.0)), spHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

// vMapUv on the walls is metres / 2.5 (wallMesh in gallery.js)
const GLSL_APPLY = /* glsl */ `
#include <map_fragment>
if (uSpread > 0.0) {
  float d = distance(vSpreadPos, uOrigin);
  // A ragged, slowly shifting front, like paint soaking into the wall
  float wob = spNoise(vSpreadPos.xy * 1.3 + vSpreadPos.z * 0.9 + uTime * 0.25) - 0.5;
  float edge = uSpread + wob * min(uSpread, 1.4);
  float m = 1.0 - smoothstep(edge - 0.12, edge, d);
  if (m > 0.0) {
    vec3 pat = texture(uPattern, vMapUv * 2.5 / uTile + 0.5).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, pat, m);
    float front = smoothstep(edge - 0.4, edge - 0.04, d) * m;
    spreadGlow = pat * 0.07 * m + vec3(0.85, 0.82, 1.0) * 0.55 * front;
  }
}
`;

export function createSpread({ id, material, aspect, frame, room }) {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = {
    uSpread: { value: 0 },
    uOrigin: { value: frame.centre.clone() },
    uPattern: { value: blank },
    uTile: { value: new THREE.Vector2(TILE_W, TILE_W / aspect) },
    uTime: { value: 0 },
  };

  const wall = room.mats.wall;
  wall.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_VERT}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSpreadPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_FRAG}`)
      .replace('#include <map_fragment>', GLSL_APPLY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += spreadGlow;');
  };
  wall.customProgramCacheKey = () => 'spread';

  // The pattern's own copy of the painting: the frame's texture comes and goes
  // with distance (gallery.js frees it far away), the walls need it always
  let pattern = null;
  let loading = null;
  function loadPattern() {
    loading ??= room
      .loadArt(id, 1024)
      .then((tex) => {
        tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
        tex.needsUpdate = true;
        pattern = tex;
        uniforms.uPattern.value = tex;
      })
      .catch((err) => {
        loading = null; // a later tap may try again
        console.warn('galleri: mønsteret kunne ikke hentes', err);
      });
    return loading;
  }

  let goal = 0;
  let k = 0; // 0 = only the painting, 1 = the whole room

  const hitsCross = (hit) => {
    if (!hit?.uv || hit.object.material !== material) return false;
    const du = (hit.uv.x - CROSS[0]) / CROSS_R[0];
    const dv = (hit.uv.y - CROSS[1]) / CROSS_R[1];
    return du * du + dv * dv <= 1;
  };

  return {
    tap(hit, { leaned }) {
      if (!leaned || hit?.object.material !== material) return false;
      if (goal) {
        goal = 0; // any tap on the painting calls the pattern home
        return true;
      }
      if (!hitsCross(hit)) return false;
      goal = 1;
      loadPattern();
      return true;
    },
    reset() {
      goal = k = 0;
      uniforms.uSpread.value = 0;
    },
    update(dt) {
      if (goal === k || (goal && !pattern)) return;
      k = goal ? Math.min(1, k + dt / GROW) : Math.max(0, k - dt / SHRINK);
      uniforms.uTime.value += dt;
      // Slow out of the frame, then racing over the walls
      uniforms.uSpread.value = k > 0 ? 0.35 + REACH * k * k * k : 0;
    },
  };
}
