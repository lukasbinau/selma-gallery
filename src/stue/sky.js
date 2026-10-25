// The sky seen through the glazing: an analytic gradient with a sun glow, soft
// drifting clouds and stars at night. Outputs linear HDR radiance, so it is
// brighter than the interior and blooms out like a real exposure would.
import * as THREE from 'three';

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // always at the far plane
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uCloud;
  uniform float uCloudCover;
  uniform float uStars;
  uniform float uIntensity;
  uniform float uDisc;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    // gradient: horizon band to zenith, a darker ground below the horizon
    float t = pow(clamp(h, 0.0, 1.0), 0.45);
    vec3 col = mix(uHorizon, uZenith, t);
    col = mix(col, uGround, smoothstep(0.0, -0.08, h));
    // sun: a hot disc plus wide forward-scattered glow
    float mu = max(dot(d, uSunDir), 0.0);
    col += uSun * (pow(mu, 8.0) * 0.35 + pow(mu, 64.0) * 0.6 + smoothstep(0.9997, 0.99985, mu) * 40.0 * uDisc);
    // clouds on a plane high above
    if (h > 0.0 && uCloudCover > 0.0) {
      vec2 uv = d.xz / (h + 0.08) * 0.9;
      float c = fbm(uv * 0.7 + vec2(3.1, 1.7));
      c = smoothstep(1.0 - uCloudCover, 1.15 - uCloudCover * 0.6, c);
      float lit = 0.75 + 0.5 * pow(mu, 3.0);
      col = mix(col, uCloud * lit, c * smoothstep(0.0, 0.18, h) * 0.85);
    }
    // stars, only well above the horizon
    if (uStars > 0.0 && h > 0.05) {
      vec2 g = d.xz / (h + 0.3) * 260.0;
      float s = hash(floor(g));
      float star = step(0.9975, s) * smoothstep(0.5, 0.0, length(fract(g) - 0.5));
      col += vec3(star) * uStars * smoothstep(0.05, 0.3, h);
    }
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
      uCloudCover: { value: 0.4 },
      uStars: { value: 0 },
      uIntensity: { value: 1 },
      uDisc: { value: 1 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}
