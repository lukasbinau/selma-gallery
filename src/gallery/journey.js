// A hidden feature: tap the star in Lille stjerne's upper doorway (leaned in
// or not). The star glows, the blue doorway opens as two real doors swinging
// towards you, a tunnel of light turns behind them, and you dive through
// into dream.js: a ~50 s journey through all of Selma's paintings. At the end
// the star rushes at you and you are back in front of the painting, as the
// doors close. A tap or Esc during the journey brings you back early.
//
// The doors are cut to the doorway's exact shape: a mask traced from the
// photo itself (a flood fill from the star over the blue), so they match
// whatever photo is on the wall.
import * as THREE from 'three';

// Measured on public/art/lille-stjerne-1024.jpg (u from the left, v from the bottom)
const STAR = [0.5688, 0.8008];
const STAR_TAP = 0.06; // tap radius (v units): a bit beyond the rays
const BOX = { u: [0.452, 0.706], v: [0.604, 0.918] }; // the upper doorway, with a margin
const APEX = 0.565; // where the two doors meet: under the arch's point
const DOOR_ANGLE = THREE.MathUtils.degToRad(104);
const VEIL = '#fff1c2'; // the light you pass through, both ways
const CAPTION_HINT = 'Tryk for at vende tilbage';

// The way in (seconds after the tap) and out (seconds after the switch back)
const IN = { open: [0.9, 2.7], portal: [1.0, 2.5], dive: [2.5, 4.1], veil: [3.6, 4.1] };
const OUT = { back: 2.4, veil: [0.1, 0.8], portal: [1.4, 2.4], close: [1.2, 2.8], done: 3 };
const EXIT_VEIL = 0.6; // fade to light at the end of the dream (or on a tap)

const smooth = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const easeIn = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t;
};
const span = (t, [a, b]) => smooth((t - a) / (b - a));

const GLSL_HEAD = /* glsl */ `
uniform float uPortal;
uniform float uGlow;
uniform float uTime;
uniform sampler2D uMask;
uniform vec4 uBox;
uniform vec2 uCentre;
uniform float uAspect;
vec3 journeyGlow = vec3(0.0);

vec3 journeyPortal(vec2 uv) {
  vec2 q = (uv - uCentre) * vec2(uAspect, 1.0);
  float r = length(q) * 22.0;
  float a = atan(q.y, q.x);
  float w = r - uTime * 1.6 + sin(a * 4.0 + uTime) * 0.15;
  float band = fract(w);
  float idx = mod(floor(w), 4.0);
  // yellow, pink, violet, red: the site's colours, linear
  vec3 c = idx < 1.0 ? vec3(0.97, 0.64, 0.04) : idx < 2.0 ? vec3(0.93, 0.13, 0.65) : idx < 3.0 ? vec3(0.11, 0.01, 0.83) : vec3(1.0, 0.016, 0.035);
  c *= 0.55 + 0.45 * smoothstep(0.0, 0.5, band) * smoothstep(1.0, 0.5, band);
  return c + vec3(1.0, 0.95, 0.8) * exp(-r * 1.6) * 1.5; // light at the far end
}
`;

const GLSL_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 jTexel = texture(map, vMapUv);
  vec3 jCol = jTexel.rgb;
  vec2 jBox = (vMapUv - uBox.xy) / uBox.zw;
  float jIn = all(greaterThan(jBox, vec2(0.0))) && all(lessThan(jBox, vec2(1.0))) ? texture(uMask, jBox).g : 0.0;
  // The star wakes up
  if (uGlow > 0.0 && jIn > 0.5 && jTexel.r > 0.4 && jTexel.b < 0.25) journeyGlow += jTexel.rgb * uGlow * 3.0;
  // Behind the doors: the tunnel of light
  if (uPortal > 0.0 && jIn > 0.0) {
    vec3 p = journeyPortal(vMapUv);
    jCol = mix(jCol, p, uPortal * jIn);
    journeyGlow += p * uPortal * jIn * 0.45;
  }
  diffuseColor *= vec4(jCol, jTexel.a);
#endif
`;

// The doorway's shape, traced from the photo: flood fill from the star over
// the blue (and the star), plus the star's own disc for its dark outlines.
async function traceDoorway(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob());
  const W = bitmap.width;
  const H = bitmap.height;
  const x0 = Math.floor(BOX.u[0] * W);
  const x1 = Math.ceil(BOX.u[1] * W);
  const y0 = Math.floor((1 - BOX.v[1]) * H);
  const y1 = Math.ceil((1 - BOX.v[0]) * H);
  const w = x1 - x0;
  const h = y1 - y0;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sg = src.getContext('2d', { willReadFrequently: true });
  sg.drawImage(bitmap, x0, y0, w, h, 0, 0, w, h);
  bitmap.close?.();
  const d = sg.getImageData(0, 0, w, h).data;

  const ok = (i) => {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    return (b > 110 && b > r) || (r > 150 && g > 130 && b < 150);
  };
  const filled = new Uint8Array(w * h);
  const sx = Math.round(STAR[0] * W) - x0;
  const sy = Math.round((1 - STAR[1]) * H) - y0;
  const stack = [sy * w + sx];
  filled[stack[0]] = 1;
  let count = 0;
  while (stack.length) {
    const k = stack.pop();
    count++;
    const x = k % w;
    const y = (k / w) | 0;
    if (x > 0 && !filled[k - 1] && ok(k - 1)) (filled[k - 1] = 1), stack.push(k - 1);
    if (x < w - 1 && !filled[k + 1] && ok(k + 1)) (filled[k + 1] = 1), stack.push(k + 1);
    if (y > 0 && !filled[k - w] && ok(k - w)) (filled[k - w] = 1), stack.push(k - w);
    if (y < h - 1 && !filled[k + w] && ok(k + w)) (filled[k + w] = 1), stack.push(k + w);
  }
  if (count < w * h * 0.25) throw new Error('døråbningen blev ikke fundet');

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const starR = 0.05 * H;
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i / w) | 0;
    const v = filled[i] || Math.hypot(x - sx, y - sy) < starR ? 255 : 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export function createJourney({ id, material, aspect, frame, room }) {
  const du = BOX.u[1] - BOX.u[0];
  const dv = BOX.v[1] - BOX.v[0];
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const uniforms = {
    uPortal: { value: 0 },
    uGlow: { value: 0 },
    uTime: { value: 0 },
    uMask: { value: blank },
    uBox: { value: new THREE.Vector4(BOX.u[0], BOX.v[0], du, dv) },
    uCentre: { value: new THREE.Vector2(APEX, (BOX.v[0] + BOX.v[1]) / 2 - 0.02) },
    uAspect: { value: aspect },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n#ifdef USE_MAP\n${GLSL_HEAD}\n#endif`)
      .replace('#include <map_fragment>', GLSL_MAP)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_MAP\n  totalEmissiveRadiance += journeyGlow;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'journey';

  // ---------------------------------------------------------------- the doors
  let artMesh = null;
  frame.group.traverse((o) => {
    if (o.material === material) artMesh = o;
  });
  const doors = { left: null, right: null, material: null, mask: null, tracing: null, failed: false };

  function buildDoors(mask) {
    mask.repeat.set(1 / du, 1 / dv); // painting uv → doorway uv
    mask.offset.set(-BOX.u[0] / du, -BOX.v[0] / dv);
    const mat = new THREE.MeshStandardMaterial({
      map: material.map,
      alphaMap: mask,
      alphaTest: 0.5,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const { artW, artH } = frame;
    const yMid = ((BOX.v[0] + BOX.v[1]) / 2 - 0.5) * artH;
    const leaf = (u0, u1, hingeU) => {
      const geo = new THREE.PlaneGeometry((u1 - u0) * artW, dv * artH);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), BOX.v[0] + uv.getY(i) * dv);
      }
      // Hinge on the leaf's outer edge
      geo.translate(((u0 + u1) / 2 - hingeU) * artW, 0, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      const pivot = new THREE.Group();
      pivot.position.set((hingeU - 0.5) * artW, yMid, 0.003);
      pivot.add(mesh);
      pivot.visible = false;
      artMesh.add(pivot);
      return pivot;
    };
    doors.left = leaf(BOX.u[0], APEX, BOX.u[0]);
    doors.right = leaf(APEX, BOX.u[1], BOX.u[1]);
    doors.material = mat;
    doors.mask = mask;
    uniforms.uMask.value = mask;
  }

  function traceOnce() {
    doors.tracing ??= room
      .artUrl(id, 1024)
      .then(traceDoorway)
      .then(buildDoors)
      .catch((err) => {
        doors.tracing = null;
        doors.failed = true;
        throw err;
      });
    return doors.tracing;
  }

  function setDoors(open) {
    if (!doors.left) return;
    const show = open > 0.0005 || state !== 'idle';
    doors.left.visible = doors.right.visible = show;
    doors.left.rotation.y = -DOOR_ANGLE * open;
    doors.right.rotation.y = DOOR_ANGLE * open;
    if (doors.material.map !== material.map) doors.material.map = material.map; // the photo upgrades as you walk up
  }

  // ---------------------------------------------------------------- overlay: the light, the chapter titles
  const veil = document.createElement('div');
  veil.className = 'galleri__veil';
  veil.style.background = VEIL;
  veil.hidden = true;
  const caption = document.createElement('div');
  caption.className = 'galleri__dream-caption';
  caption.innerHTML = '<span class="galleri__dream-title"></span><span class="galleri__dream-hint"></span>';
  caption.hidden = true;
  room.root.append(veil, caption);
  const titleEl = caption.firstElementChild;
  const hintEl = caption.lastElementChild;
  hintEl.textContent = CAPTION_HINT;
  const setVeil = (a) => {
    veil.hidden = a <= 0.001;
    veil.style.opacity = String(a);
  };

  // ---------------------------------------------------------------- state
  let state = 'idle'; // idle → in → dream → out → idle
  let clock = 0; // seconds in the current state
  let dreamT = 0;
  let exitAt = -1; // dream time the way out began
  let dream = null;
  let dreamLoad = null;
  let textures = [];
  let sound = null;
  let ready = false;

  const centre = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _size = new THREE.Vector2();
  function doorway() {
    artMesh.updateMatrixWorld(true);
    centre.set((APEX - 0.5) * frame.artW, ((BOX.v[0] + BOX.v[1]) / 2 - 0.5) * frame.artH, 0);
    artMesh.localToWorld(centre);
    normal.set(0, 0, 1).transformDirection(artMesh.matrixWorld);
  }

  function loadDream() {
    const works = room.works;
    dreamLoad = Promise.all([
      import('./dream.js'),
      Promise.allSettled(works.map((w) => room.loadArt(w.id, 640))),
    ]).then(([mod, results]) => {
      const map = new Map();
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          map.set(works[i].id, r.value);
          textures.push(r.value);
        }
      });
      if (state === 'idle') {
        // given up meanwhile
        textures.forEach((t) => room.freeTexture(t));
        textures = [];
        return;
      }
      dream = mod.createDream({ works, textures: map, pixelRatio: room.renderer.getPixelRatio(), calm: room.reduced() });
      room.renderer.compile(dream.scene, dream.camera);
      ready = true;
    });
    dreamLoad.catch((err) => {
      console.warn('galleri: rejsen kunne ikke starte', err);
      if (state === 'in') leaveEarly();
    });
  }

  function cleanupDream() {
    dream?.dispose();
    dream = null;
    textures.forEach((t) => room.freeTexture(t));
    textures = [];
    ready = false;
    dreamLoad = null;
  }

  function begin() {
    state = 'in';
    clock = 0;
    dreamT = 0;
    exitAt = -1;
    room.takeOver(api);
    room.setLean(true);
    room.setAway(true);
    doors.failed = false;
    traceOnce().catch((err) => console.warn('galleri: døren kunne ikke tegnes', err));
    loadDream();
    import('./dream-sound.js')
      .then(({ createDreamSound }) => {
        if (state === 'idle') return;
        sound = createDreamSound();
        sound?.start();
      })
      .catch(() => {});
  }

  // Nothing to dive into (the dream or the doors would not load): back out
  // the way we came, from as far as the dive got
  function leaveEarly() {
    const p = Math.min(Math.max((clock - IN.dive[0]) / (IN.dive[1] - IN.dive[0]), 0), 1);
    state = 'out';
    clock = (1 - p) * OUT.back * 0.5;
    sound?.leave();
  }

  function finish() {
    state = 'idle';
    clock = 0;
    uniforms.uPortal.value = uniforms.uGlow.value = 0;
    setDoors(0);
    setVeil(0);
    caption.hidden = true;
    room.setAway(false);
    room.takeOver(null);
    sound?.stop(1.2);
    sound = null;
    cleanupDream();
  }

  const hitsStar = (hit) => {
    if (!hit?.uv || hit.object.material !== material) return false;
    return Math.hypot((hit.uv.x - STAR[0]) * aspect, hit.uv.y - STAR[1]) < STAR_TAP;
  };

  function onVisibility() {
    if (!sound) return;
    if (document.hidden) sound.pause();
    else sound.resume();
  }
  document.addEventListener('visibilitychange', onVisibility);

  const api = {
    tap(hit) {
      if (state === 'idle') {
        if (!hitsStar(hit)) return false;
        begin();
        return true;
      }
      // Once inside, any tap (or Esc) heads for home
      if (state === 'dream' && exitAt < 0) {
        exitAt = dreamT;
        sound?.leave();
      }
      return true;
    },

    reset() {
      if (state === 'idle') return;
      sound?.stop(0.3);
      sound = null;
      finish();
    },

    update(dt) {
      if (state === 'idle') return;
      clock += dt;
      uniforms.uTime.value += dt;

      if (state === 'in') {
        uniforms.uGlow.value = smooth(clock / 0.5) * (1 - span(clock, [2.2, 3.2]));
        // The doors wait for their shape (traced from the photo in the first moments)
        if (doors.failed) return leaveEarly();
        if (!doors.left && clock > IN.open[0]) clock = IN.open[0];
        setDoors(span(clock, IN.open));
        uniforms.uPortal.value = span(clock, IN.portal);
        setVeil(span(clock, IN.veil));
        if (clock >= IN.dive[1]) {
          clock = IN.dive[1]; // hold in the light until the dream is built
          if (ready) {
            state = 'dream';
            clock = 0;
            dreamT = 0;
          }
        }
        return;
      }

      if (state === 'dream') {
        dreamT += dt;
        sound?.at(dreamT);
        room.renderer.getSize(_size);
        dream.frame(dreamT, dt, _size.x / Math.max(1, _size.y));
        if (exitAt < 0 && dreamT >= dream.duration - EXIT_VEIL) {
          exitAt = dreamT;
          sound?.leave();
        }
        const fadeIn = 1 - smooth(dreamT / 0.7);
        const fadeOut = exitAt >= 0 ? smooth((dreamT - exitAt) / EXIT_VEIL) : 0;
        setVeil(Math.max(fadeIn, fadeOut));
        const c = dream.caption(dreamT);
        caption.hidden = c.alpha <= 0.001 && dreamT > 5.5;
        titleEl.textContent = c.text;
        titleEl.style.opacity = String(c.alpha);
        hintEl.style.opacity = String(smooth((dreamT - 1) / 0.8) * (1 - smooth((dreamT - 4.5) / 1)));
        if (fadeOut >= 1) {
          state = 'out';
          clock = 0;
          caption.hidden = true;
          cleanupDream();
        }
        return;
      }

      // out: back through the doorway, the light fading, the doors closing
      setVeil(1 - span(clock, OUT.veil));
      uniforms.uPortal.value = 1 - span(clock, OUT.portal);
      setDoors(1 - span(clock, OUT.close));
      if (clock >= OUT.done) finish();
    },

    // After the gallery has placed its camera: the dive in, the pull back out
    camera(camera) {
      let p = 0;
      if (state === 'in') p = (clock - IN.dive[0]) / (IN.dive[1] - IN.dive[0]);
      else if (state === 'out') p = 1 - smooth(clock / OUT.back);
      else if (state === 'dream') p = 1;
      p = Math.min(Math.max(p, 0), 1);
      if (p <= 0) return;
      doorway();
      const k = state === 'in' ? easeIn(p) : p;
      camera.getWorldDirection(_a);
      _a.multiplyScalar(3).add(camera.position); // where the gallery was looking
      _b.copy(centre).addScaledVector(normal, -(0.2 + 3 * k)); // the doorway, then on through it
      const look = _a.lerp(_b, smooth(p * 2.2));
      camera.position.lerp(_b.copy(centre).addScaledVector(normal, -0.35), k);
      camera.lookAt(look);
      camera.fov += 55 * k * k;
      camera.updateProjectionMatrix();
    },

    // While dreaming, the dream draws the frame instead of the room
    render() {
      if (state !== 'dream' || !dream) return false;
      room.renderer.render(dream.scene, dream.camera);
      return true;
    },
  };
  return api;
}
