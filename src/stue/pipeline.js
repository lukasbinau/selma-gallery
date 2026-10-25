// Progressive rendering for a still camera. The room is a product shot: while
// something moves we render one ordinary frame per tick; once everything is
// still, every tick renders one more jittered sample (sub-pixel camera offset,
// sun and sky directions spread over their real angular size) and blends it
// into a running average. After a second or so the picture converges to soft
// area-light shadows and clean anti-aliasing, then rendering stops entirely.
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const fsTriangle = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
};

// Low-discrepancy points in [0, 1)²
export function halton(i, base) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

export function createPipeline(renderer, { samples = 48, msaa = 4 } = {}) {
  const size = new THREE.Vector2(1, 1);
  const rtOpts = { type: THREE.HalfFloatType, depthBuffer: true };
  const frame = new THREE.WebGLRenderTarget(1, 1, { ...rtOpts, samples: msaa });
  const accum = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

  // accum = mix(accum, frame, 1 / (n + 1)) through ordinary alpha blending
  const blendMat = new THREE.ShaderMaterial({
    uniforms: { tFrame: { value: null }, uWeight: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader:
      'uniform sampler2D tFrame; uniform float uWeight; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tFrame, vUv).rgb, uWeight); }',
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.ZeroFactor,
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(fsTriangle(), blendMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const output = new OutputPass();
  output.renderToScreen = true;

  let count = 0; // samples in the average

  function setSize(w, h, pixelRatio) {
    size.set(Math.max(1, Math.round(w * pixelRatio)), Math.max(1, Math.round(h * pixelRatio)));
    frame.setSize(size.x, size.y);
    accum.setSize(size.x, size.y);
    count = 0;
  }

  /** Forget the average: the next sample starts a new picture. */
  function reset() {
    count = 0;
  }

  /**
   * Render one pass of the scene and fold it into the picture. `jitter(i)` is
   * called before rendering sample i (i = 0 for a plain, unjittered frame).
   * Returns true while more samples are wanted.
   */
  function step(scene, camera, jitter) {
    const i = count;
    jitter?.(i, size);
    renderer.setRenderTarget(frame);
    renderer.clear();
    renderer.render(scene, camera);

    blendMat.uniforms.tFrame.value = frame.texture;
    blendMat.uniforms.uWeight.value = 1 / (i + 1);
    renderer.setRenderTarget(accum);
    renderer.render(quadScene, quadCam);
    count = i + 1;

    present();
    return count < samples;
  }

  function present() {
    renderer.setRenderTarget(null);
    output.render(renderer, null, accum);
  }

  return {
    setSize,
    reset,
    step,
    present,
    get count() {
      return count;
    },
    get samples() {
      return samples;
    },
    size,
    dispose() {
      frame.dispose();
      accum.dispose();
      blendMat.dispose();
      output.dispose();
    },
  };
}
