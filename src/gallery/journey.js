// A hidden feature: tap the star in Lille stjerne (or its lower door, the one
// above the stairs; leaned in or not). A brass handle appears on the door,
// is pulled down, and the door swings open towards you onto a glimpse of a
// stairwell with a star at the bottom. You dive through into dream.js: a
// ~75 s story told by Selma's own figures. At the end the painting puts
// itself back together and you are pulled back out as the door closes.
// A tap or Esc during the journey brings you back early.
//
// The door is cut to the doorway's exact shape: a mask traced from the
// photo itself (a flood fill over the door's blue), so it matches whatever
// photo is on the wall.
import * as THREE from 'three';

// Measured on public/art/lille-stjerne-1024.jpg (u from the left, v from the bottom)
const STAR = [0.5688, 0.8008]; // the star in the upper window: tap it…
const STAR_TAP = 0.06;
const BOX = { u: [0.47, 0.715], v: [0.141, 0.53] }; // …or the lower door, down to the top step
const SEED = [0.59, 0.36]; // a point on the door's blue
const HINGE = 0.481; // the door's left edge
const HANDLE = [0.676, 0.33];
const FLOOR_STAR = [0.585, 0.18]; // the star lying at the foot of the door
const DOOR_ANGLE = THREE.MathUtils.degToRad(108);
const VEIL = '#fff1c2'; // the light you pass through, both ways
const CAPTION_HINT = 'Tryk for at vende tilbage';

// The way in (seconds after the tap) and out (seconds after the switch back)
const IN = { handle: [0.5, 1.1], press: [1.3, 1.62], release: [1.95, 2.3], open: [1.8, 3.4], portal: [1.9, 3.1], dive: [3.1, 4.7], veil: [4.2, 4.7] };
const OUT = { back: 2.4, veil: [0.1, 0.8], portal: [1.4, 2.4], close: [1.2, 2.8], handle: [2.8, 3.2], done: 3.3 };
const EXIT_VEIL = 0.8; // fade to light at the end of the dream (or on a tap)
const CAST_URL = (name) => `${import.meta.env.BASE_URL}art/dream/${name}.webp`;

const smooth = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const easeIn = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t;
};
const span = (t, [a, b]) => smooth((t - a) / (b - a));
// A springy pop: 0 → a little over 1 → 1
const pop = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t === 0 ? 0 : 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
};

const GLSL_HEAD = /* glsl */ `
uniform float uPortal;
uniform float uGlow;
uniform float uTime;
uniform sampler2D uMask;
uniform vec4 uBox;
uniform vec2 uCentre;
uniform float uAspect;
vec3 journeyGlow = vec3(0.0);

// Behind the door: a stairwell going down into blue, the star waiting at the bottom
vec3 journeyPortal(vec2 uv) {
  vec2 q = (uv - uCentre) * vec2(uAspect, 1.0);
  float depth = smoothstep(0.55, 0.12, uv.y);
  vec3 c = mix(vec3(0.002, 0.004, 0.05), vec3(0.02, 0.06, 0.75), depth);
  float stepLine = smoothstep(0.08, 0.0, abs(fract(uv.y * 30.0 + uTime * 0.8) - 0.5) - 0.38);
  c += vec3(0.12, 0.03, 0.4) * stepLine * depth;
  float star = exp(-length(q) * 16.0);
  return c + vec3(1.0, 0.8, 0.3) * star * (1.1 + 0.3 * sin(uTime * 3.0));
}
`;

const GLSL_MAP = /* glsl */ `
#ifdef USE_MAP
  vec4 jTexel = texture(map, vMapUv);
  vec3 jCol = jTexel.rgb;
  vec2 jBox = (vMapUv - uBox.xy) / uBox.zw;
  float jIn = all(greaterThan(jBox, vec2(0.0))) && all(lessThan(jBox, vec2(1.0))) ? texture(uMask, jBox).g : 0.0;
  // The stars (in the window and at the foot of the door) wake up
  if (uGlow > 0.0 && jTexel.r > 0.4 && jTexel.g > 0.3 && jTexel.b < 0.2) journeyGlow += jTexel.rgb * uGlow * 2.5;
  // Behind the door: the way down
  if (uPortal > 0.0 && jIn > 0.0) {
    vec3 p = journeyPortal(vMapUv);
    jCol = mix(jCol, p, uPortal * jIn);
    journeyGlow += p * uPortal * jIn * 0.22;
  }
  diffuseColor *= vec4(jCol, jTexel.a);
#endif
`;

// The door's shape, traced from the photo: a flood fill over the door's blue
// (and the star lying in it), inside the door's box.
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
  const sx = Math.round(SEED[0] * W) - x0;
  const sy = Math.round((1 - SEED[1]) * H) - y0;
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
  if (count < w * h * 0.3) throw new Error('døren blev ikke fundet');

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = filled[i] ? 255 : 0;
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
    uCentre: { value: new THREE.Vector2(...FLOOR_STAR) },
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

  // ---------------------------------------------------------------- the door and its handle
  let artMesh = null;
  frame.group.traverse((o) => {
    if (o.material === material) artMesh = o;
  });
  const doors = { leaf: null, handle: null, lever: null, material: null, tracing: null, failed: false };

  function buildDoor(mask) {
    mask.repeat.set(1 / du, 1 / dv); // painting uv → door uv
    mask.offset.set(-BOX.u[0] / du, -BOX.v[0] / dv);
    const mat = new THREE.MeshStandardMaterial({
      map: material.map,
      alphaMap: mask,
      alphaTest: 0.5,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const { artW, artH } = frame;
    const vMid = (BOX.v[0] + BOX.v[1]) / 2;
    const geo = new THREE.PlaneGeometry(du * artW, dv * artH);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, BOX.u[0] + uv.getX(i) * du, BOX.v[0] + uv.getY(i) * dv);
    geo.translate(((BOX.u[0] + BOX.u[1]) / 2 - HINGE) * artW, 0, 0); // turns on its left edge
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    const leaf = new THREE.Group();
    leaf.position.set((HINGE - 0.5) * artW, (vMid - 0.5) * artH, 0.003);
    leaf.add(mesh);
    leaf.visible = false;
    artMesh.add(leaf);

    // The handle: a brass rose and a lever pointing towards the hinge
    const brass = new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: 0.9, roughness: 0.28 });
    const handle = new THREE.Group();
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.008, 24).rotateX(Math.PI / 2), brass);
    const lever = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.012, 0.012), brass);
    bar.position.set(-0.03, 0, 0.014);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 16, 12), brass);
    knob.position.set(-0.066, 0, 0.014);
    lever.add(bar, knob);
    handle.add(rose, lever);
    handle.position.set((HANDLE[0] - HINGE) * artW, (HANDLE[1] - vMid) * artH, 0.004);
    handle.traverse((o) => (o.castShadow = true));
    handle.scale.setScalar(0.0001);
    leaf.add(handle);

    Object.assign(doors, { leaf, handle, lever, material: mat });
    uniforms.uMask.value = mask;
  }

  function traceOnce() {
    doors.tracing ??= room
      .artUrl(id, 1024)
      .then(traceDoorway)
      .then(buildDoor)
      .catch((err) => {
        doors.tracing = null;
        doors.failed = true;
        throw err;
      });
    return doors.tracing;
  }

  // open: 0 shut … 1 wide open; handle: its size (0 … 1); press: the lever down (0 … 1)
  function setDoor(open, handle = 0, press = 0) {
    if (!doors.leaf) return;
    doors.leaf.visible = state !== 'idle';
    doors.leaf.rotation.y = -DOOR_ANGLE * open;
    doors.handle.scale.setScalar(Math.max(0.0001, handle));
    doors.lever.rotation.z = 0.62 * press; // the lever points towards the hinge: turning it this way pulls it down
    if (doors.material.map !== material.map) doors.material.map = material.map; // the photo upgrades as you walk up
  }

  // ---------------------------------------------------------------- overlay: the light, the story
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
    centre.set(((BOX.u[0] + BOX.u[1]) / 2 - 0.5) * frame.artW, ((BOX.v[0] + BOX.v[1]) / 2 - 0.5) * frame.artH, 0);
    artMesh.localToWorld(centre);
    normal.set(0, 0, 1).transformDirection(artMesh.matrixWorld);
  }

  // The dream, its cast (cutouts) and the paintings it uses whole
  const castLoader = new THREE.TextureLoader();
  function loadCutout(name) {
    return castLoader.loadAsync(CAST_URL(name)).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    });
  }
  function freeTextures() {
    textures.forEach(({ tex, art }) => (art ? room.freeTexture(tex) : tex.dispose()));
    textures = [];
  }
  function loadDream() {
    dreamLoad = import('./dream.js').then(async (mod) => {
      const [paintings, cutouts] = await Promise.all([
        Promise.allSettled(mod.PAINTINGS.map((pid) => room.loadArt(pid, 1024))),
        Promise.allSettled(mod.CUTOUTS.map(loadCutout)),
      ]);
      const pmap = new Map();
      const cmap = new Map();
      paintings.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        pmap.set(mod.PAINTINGS[i], r.value);
        textures.push({ tex: r.value, art: true });
      });
      cutouts.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        cmap.set(mod.CUTOUTS[i], r.value);
        textures.push({ tex: r.value, art: false });
      });
      if (state === 'idle') return freeTextures(); // given up meanwhile
      if (cmap.size < mod.CUTOUTS.length) throw new Error('figurerne kunne ikke hentes');
      dream = mod.createDream({ cast: cmap, paintings: pmap, pixelRatio: room.renderer.getPixelRatio(), calm: room.reduced() });
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
    freeTextures();
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

  // Nothing to dive into (the dream or the door would not load): back out
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
    setDoor(0);
    setVeil(0);
    caption.hidden = true;
    room.setAway(false);
    room.takeOver(null);
    sound?.stop(1.2);
    sound = null;
    cleanupDream();
  }

  // The star in the window, or the lower door itself
  const hitsStart = (hit) => {
    if (!hit?.uv || hit.object.material !== material) return false;
    const { x, y } = hit.uv;
    if (Math.hypot((x - STAR[0]) * aspect, y - STAR[1]) < STAR_TAP) return true;
    return x > BOX.u[0] + 0.02 && x < BOX.u[1] - 0.02 && y > BOX.v[0] + 0.02 && y < BOX.v[1] - 0.06;
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
        if (!hitsStart(hit)) return false;
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
        uniforms.uGlow.value = smooth(clock / 0.5) * (1 - span(clock, [2.6, 3.6]));
        // The door waits for its shape (traced from the photo in the first moments)
        if (doors.failed) return leaveEarly();
        if (!doors.leaf && clock > IN.handle[0]) clock = IN.handle[0];
        if (clock - dt < IN.press[0] && clock >= IN.press[0]) sound?.click();
        const handle = pop((clock - IN.handle[0]) / (IN.handle[1] - IN.handle[0]));
        setDoor(span(clock, IN.open), handle, span(clock, IN.press) * (1 - span(clock, IN.release)));
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
        sound?.cues(dreamT, dream.cues);
        room.renderer.getDrawingBufferSize(_size);
        dream.frame(dreamT, dt, _size.x / Math.max(1, _size.y), _size.y);
        if (exitAt < 0 && dreamT >= dream.duration - EXIT_VEIL) {
          exitAt = dreamT;
          sound?.leave();
        }
        const fadeIn = 1 - smooth(dreamT / 0.7);
        const fadeOut = exitAt >= 0 ? smooth((dreamT - exitAt) / EXIT_VEIL) : 0;
        setVeil(Math.max(fadeIn, fadeOut));
        const c = dream.caption(dreamT);
        caption.hidden = c.alpha <= 0.001 && (dreamT < 6 || dreamT > 12.5);
        titleEl.textContent = c.text;
        titleEl.style.opacity = String(c.alpha);
        hintEl.style.opacity = String(smooth((dreamT - 6.5) / 0.8) * (1 - smooth((dreamT - 11) / 1)));
        if (fadeOut >= 1) {
          state = 'out';
          clock = 0;
          caption.hidden = true;
          cleanupDream();
        }
        return;
      }

      // out: back through the doorway, the light fading, the door closing
      setVeil(1 - span(clock, OUT.veil));
      uniforms.uPortal.value = 1 - span(clock, OUT.portal);
      setDoor(1 - span(clock, OUT.close), 1 - span(clock, OUT.handle));
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
