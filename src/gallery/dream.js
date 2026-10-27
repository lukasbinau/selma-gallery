// The world behind Lille stjerne's door (journey.js opens it): a ~50 s
// flight through Selma's paintings, told as a circle of life in five
// chapters, from the painting's star back to the star.
//
//   I   Stjernen  darkness; the star comes towards you and blooms
//   II  Rejsen    racing through a spiral tunnel of landscapes and patterns
//   III Solen     a red sun (Cirkler's colours); the faces orbit it like planets
//   IV  Blå time  the sun sinks and goes blue, the faces fall like leaves
//   V   Hjulet    every painting rises into a turning wheel that closes
//                 into a point of light, which is the star again
//
// Colours come from the paintings and the site's palette (red #ff2234,
// violet #5e17eb, pink #f767d3, yellow #fcd23b, the room's deep #230a66).
// The camera stays at the origin looking down -z; everything moves past it.
import * as THREE from 'three';

export const DURATION = 48.8;

// Chapter titles: [from, to, text] in seconds
export const STORY = [
  [0.6, 5.6, 'I · Stjernen'],
  [8, 13, 'II · Rejsen'],
  [20.5, 25.5, 'III · Solen'],
  [31.6, 36.5, 'IV · Blå time'],
  [40.5, 45, 'V · Hjulet'],
];

// Who plays which part (ids from vaerker.json; missing ones are skipped)
const TUNNEL = ['lilla-skyer', 'blaa-fliser', 'rapsmarker', 'moenster-lyseroed', 'groent-glas', 'cirkler', 'lille-stjerne'];
const ORBIT = ['ansigt', 'orange-mand', 'portraet', 'figur', 'sol-og-figur'];
const DUSK = 'blaa-time';

const smooth = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const easeIn = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * t;
};
const easeOut = (x) => 1 - easeIn(1 - x);
// 0 → 1 → 0 over [a, b], fading for `fin` seconds in and `fout` out
const win = (t, a, b, fin = 0.6, fout = fin) => smooth((t - a) / fin) * (1 - smooth((t - (b - fout)) / fout));

// Smoothly interpolated keyframes: [[t, number | '#colour'], …]
function track(list) {
  const pts = list.map(([t, v]) => [t, typeof v === 'string' ? new THREE.Color(v) : v]);
  const out = new THREE.Color();
  return (t) => {
    let i = pts.findIndex((p) => p[0] > t);
    if (i === -1) i = pts.length;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i)];
    const k = a === b ? 0 : smooth((t - a[0]) / (b[0] - a[0]));
    if (typeof a[1] === 'number') return a[1] + (b[1] - a[1]) * k;
    return out.copy(a[1]).lerp(b[1], k);
  };
}

// ------------------------------------------------------------------ timing
const BG = track([
  [0, '#05010f'],
  [4.5, '#160646'],
  [5.8, '#230a66'],
  [6.6, '#5e17eb'],
  [9, '#1d0f8a'],
  [13, '#0a2bb0'],
  [17.5, '#0f4f5c'],
  [19.6, '#3a0726'],
  [22.5, '#7a0b26'],
  [27, '#9c1060'],
  [30.5, '#5a0a40'],
  [33.5, '#0b1a6e'],
  [38.5, '#040834'],
  [41, '#230a66'],
  [45.5, '#4a14b8'],
  [47.6, '#230a66'],
]);
const SPEED = track([[0, 1.5], [5.4, 4], [6.6, 24], [18.8, 24], [20.2, 2], [31, 1.4], [33, 0.5], [40, 0.8], [46.6, 2], [48.8, 34]]);
const SPREAD = track([[0, 1], [5.4, 0.9], [6.4, 2.4], [8, 1], [19.5, 1.2], [31, 1.1], [40, 1], [45.5, 1.3], [47.4, 0.6]]);
const SPIN = track([[0, 0.05], [19.5, 0.1], [21, 0.45], [30, 0.3], [33, 0.05], [41, 0.3], [46, 1.6], [48.8, 0.2]]);
const FALL = track([[0, 0], [31, 0], [33, 1.3], [39, 1.1], [40.5, 0]]);
const SIZE = track([[0, 1.6], [6, 2.2], [7.5, 1.4], [19.5, 2], [31, 1.4], [33, 1.1], [40, 1.6], [47, 2.4]]);
const GLOW = track([[0, 0.45], [5.6, 0.8], [6.6, 1], [8, 0.6], [19.5, 0.75], [31, 0.55], [39, 0.4], [44, 0.8], [48.8, 1]]);
const COL_A = track([[0, '#fcd23b'], [7, '#ffffff'], [12, '#9fb6ff'], [17, '#fcd23b'], [20, '#ff2234'], [30, '#f767d3'], [33, '#b8c6ff'], [40, '#f767d3'], [46, '#fcd23b']]);
const COL_B = track([[0, '#f767d3'], [7, '#7aa0ff'], [12, '#4b7bff'], [17, '#9fd36a'], [20, '#fcd23b'], [30, '#ff8a3d'], [33, '#ffffff'], [40, '#5e17eb'], [46, '#ffffff']]);
const FOV = track([[0, 58], [6, 62], [7.2, 74], [18.6, 74], [20.4, 58], [39, 58], [44, 64], [47.4, 66], [48.8, 104]]);

// ------------------------------------------------------------------ textures drawn here
// Selma's eight-rayed star, as on Lille stjerne and Sol og figur
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

// ------------------------------------------------------------------ the motes
// Every mote's place is worked out on the GPU from a few running totals, so
// the CPU only updates uniforms: travel (towards you), spin (round the axis),
// fall (downwards) and spread (out from the axis).
const MOTES = 2600;
const LEN = 92;

function buildMotes() {
  const pos = new Float32Array(MOTES * 3);
  const seed = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    pos[i * 3] = Math.random() * Math.PI * 2; // angle
    pos[i * 3 + 1] = 0.9 + Math.pow(Math.random(), 0.8) * 11; // distance from the axis
    pos[i * 3 + 2] = Math.random() * LEN; // place along the way
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTravel: { value: 0 },
      uSpin: { value: 0 },
      uFall: { value: 0 },
      uSpread: { value: 1 },
      uSize: { value: 1.6 },
      uGlow: { value: 0.5 },
      uColA: { value: new THREE.Color() },
      uColB: { value: new THREE.Color() },
      uScale: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTravel, uSpin, uFall, uSpread, uSize, uScale;
      uniform vec3 uColA, uColB;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        float z = mod(position.z + uTravel * (0.7 + seed * 0.6), ${LEN.toFixed(1)}) - ${(LEN - 4).toFixed(1)};
        float a = position.x + uSpin * (0.5 + seed);
        float r = position.y * uSpread;
        vec3 p = vec3(cos(a) * r, sin(a) * r, z);
        p.y = mod(p.y - uFall * (0.6 + seed) + 14.0, 28.0) - 14.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uSize * (0.4 + seed) * uScale * 14.0 / -mv.z, 0.0, 64.0);
        vColor = mix(uColA, uColB, fract(seed * 7.0));
        vFade = smoothstep(${(-(LEN - 4)).toFixed(1)}, -55.0, z) * smoothstep(3.5, 0.3, z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      varying vec3 vColor;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * a * uGlow * vFade);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

// ------------------------------------------------------------------ the world
export function createDream({ works, textures, pixelRatio = 1, calm = false }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color();
  scene.fog = new THREE.Fog(0x000000, 16, 70);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 200);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  const motes = buildMotes();
  motes.material.uniforms.uScale.value = pixelRatio * 10;
  keep(motes.geometry);
  keep(motes.material);
  scene.add(motes);

  const starTex = keep(starTexture());
  const glowTex = keep(glowTexture());
  const sprite = (map, colour, additive = true) => {
    const m = keep(
      new THREE.SpriteMaterial({
        map,
        color: colour,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    return new THREE.Sprite(m);
  };

  // The star (chapters I and V)
  const star = new THREE.Group();
  const starGlow = sprite(glowTex, '#fcd23b');
  const starBody = sprite(starTex, '#ffffff', false);
  star.add(starGlow, starBody);
  scene.add(star);

  // The sun (chapters III and IV): Cirkler's red ring round a violet heart,
  // Sol og figur's star in the middle
  const sun = new THREE.Group();
  const discGeo = keep(new THREE.CircleGeometry(1, 64));
  const sunMat = keep(new THREE.MeshBasicMaterial({ color: '#ff2234', transparent: true, toneMapped: false, fog: false }));
  const heartMat = keep(new THREE.MeshBasicMaterial({ color: '#5e17eb', transparent: true, toneMapped: false, fog: false }));
  const sunDisc = new THREE.Mesh(discGeo, sunMat);
  sunDisc.scale.setScalar(2.3);
  const heart = new THREE.Mesh(discGeo, heartMat);
  heart.scale.setScalar(1.25);
  heart.position.z = 0.01;
  const sunGlow = sprite(glowTex, '#ff2234');
  sunGlow.scale.setScalar(13);
  const sunStar = sprite(starTex, '#ffffff', false);
  sunStar.scale.setScalar(1.7);
  sunStar.position.z = 0.02;
  sun.add(sunGlow, sunDisc, heart, sunStar);
  scene.add(sun);

  // Rings pulsing out from the sun, in Cirkler's colours
  const ringGeo = keep(new THREE.TorusGeometry(1, 0.022, 8, 120));
  const rings = ['#ff2234', '#f767d3', '#9fd36a', '#fcd23b'].map((c) => {
    const m = new THREE.Mesh(
      ringGeo,
      keep(new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending })),
    );
    scene.add(m);
    return m;
  });

  // Rejsen's tunnel: rings in the site's colours rushing past
  const TUNNEL_RINGS = 12;
  const tunnelGeo = keep(new THREE.TorusGeometry(3.6, 0.035, 8, 140));
  const tunnel = Array.from({ length: TUNNEL_RINGS }, (_, k) => {
    const colour = ['#fcd23b', '#f767d3', '#ff2234', '#9fd36a', '#ffffff', '#5e17eb'][k % 6];
    const m = new THREE.Mesh(
      tunnelGeo,
      keep(new THREE.MeshBasicMaterial({ color: colour, transparent: true, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending })),
    );
    scene.add(m);
    return m;
  });

  // The paintings, as unlit cards
  const cards = new Map();
  const cardGeo = keep(new THREE.PlaneGeometry(1, 1));
  works.forEach((w) => {
    const tex = textures.get(w.id);
    if (!tex) return;
    const img = tex.image;
    const aspect = img?.width && img?.height ? img.width / img.height : 0.8;
    const mat = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    const mesh = new THREE.Mesh(cardGeo, mat);
    mesh.userData.size = new THREE.Vector2(Math.sqrt(aspect) * 1.5, (1 / Math.sqrt(aspect)) * 1.5); // equal area
    mesh.visible = false;
    scene.add(mesh);
    cards.set(w.id, mesh);
  });
  const order = works.map((w) => w.id).filter((id) => cards.has(id));

  function card(id, x, y, z, scale, opacity, rotZ = 0, rotY = 0) {
    const m = cards.get(id);
    if (!m || opacity <= 0.002) return;
    m.visible = true;
    m.position.set(x, y, z);
    m.scale.set(m.userData.size.x * scale, m.userData.size.y * scale, 1);
    m.rotation.set(0, rotY, rotZ);
    m.material.opacity = Math.min(1, opacity);
    m.renderOrder = Math.round(1000 + z * 10); // far ones first: they blend over each other properly
  }

  // ---------------------------------------------------------------- running totals
  const run = { travel: 0, spin: 0, fall: 0, wheel: 0, starSpin: 0 };
  const calmK = calm ? 0.4 : 1;

  function update(t, dt) {
    const u = motes.material.uniforms;
    run.travel += SPEED(t) * dt;
    run.spin += SPIN(t) * dt * calmK;
    run.fall += FALL(t) * dt;
    run.starSpin += dt * (0.25 + 1.5 * smooth((t - 45) / 2.5)) * calmK;
    u.uTravel.value = run.travel;
    u.uSpin.value = run.spin;
    u.uFall.value = run.fall;
    u.uSpread.value = SPREAD(t);
    u.uSize.value = SIZE(t);
    u.uGlow.value = GLOW(t);
    u.uColA.value.copy(COL_A(t));
    u.uColB.value.copy(COL_B(t));

    scene.background.copy(BG(t));
    scene.fog.color.copy(scene.background);

    camera.fov = FOV(t);
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    // Rejsen rolls with the spiral; Solen sways round the sun; Hjulet turns with the wheel
    if (!calm) {
      const sway = win(t, 19.6, 31.5, 1.5, 2) * Math.sin(t * 0.32) * 1.1;
      camera.position.x = sway;
      camera.position.y = sway * 0.25;
      if (sway) camera.lookAt(0, 0, -16);
      camera.rotateZ(win(t, 6.6, 19.6, 1.5) * Math.sin(t * 0.33) * 0.32 + win(t, 41, 48.8, 2, 0.6) * run.wheel * 0.05);
    }
    camera.updateProjectionMatrix();

    // -------------------------------------------------- I · the star, and again in V
    let starZ = -34;
    let starS = 0;
    let starA = 0;
    let glowS = 0;
    let glowA = 0;
    if (t < 7) {
      const k = easeOut((t - 0.3) / 5.2);
      starZ = -34 + 28 * k;
      starS = 1.4 * smooth((t - 0.2) / 1.2);
      starA = 1;
      glowS = 5;
      glowA = 0.6 + 0.2 * Math.sin(t * 3);
      const bloom = smooth((t - 5.4) / 1.3);
      starS *= 1 + 4 * bloom;
      starA *= 1 - bloom;
      glowS += 26 * bloom;
      glowA *= 1 - smooth((t - 5.9) / 0.9);
    } else if (t > 45.4) {
      const born = smooth((t - 45.4) / 2);
      const rush = easeIn((t - 47.3) / 1.5);
      starZ = -10 + 9.2 * rush;
      starS = 1.5 * born + 5 * rush;
      starA = born;
      glowS = 5 + 14 * rush;
      glowA = 0.75 * born;
    }
    star.visible = starA > 0.002;
    star.position.set(0, 0, starZ);
    starBody.scale.setScalar(starS);
    starBody.material.opacity = starA;
    starBody.material.rotation = run.starSpin;
    starGlow.scale.setScalar(glowS);
    starGlow.material.opacity = glowA;

    // -------------------------------------------------- II · the tunnel
    const inTunnel = win(t, 6.6, 19.6, 1.2, 1);
    tunnel.forEach((ring, k) => {
      const z = ((k * 90) / TUNNEL_RINGS + run.travel * 0.9) % 90 - 86;
      ring.visible = inTunnel > 0.002;
      ring.position.set(Math.sin(z * 0.05 + t * 0.4) * 0.8, Math.cos(z * 0.04 + t * 0.3) * 0.6, z);
      ring.rotation.z = k * 0.4 + run.spin;
      ring.material.opacity = inTunnel * smooth((z + 86) / 30) * smooth((2 - z) / 4) * 0.9;
    });
    TUNNEL.forEach((id, k) => {
      const age = t - (7.4 + k * 1.6);
      if (age < 0 || age > 2.8) return;
      const z = -36 + age * 15;
      const a = k * 2.2 + age * 0.9 * calmK;
      const r = 2.2 + 0.3 * Math.sin(k * 1.7);
      card(id, Math.cos(a) * r, Math.sin(a) * r, z, 1.15, win(age, 0, 2.8, 0.6, 0.25), a - Math.PI / 2, -Math.cos(a) * 0.35);
    });

    // -------------------------------------------------- III · the sun and its planets, IV · it sets
    const sunIn = smooth((t - 19.2) / 2.6);
    const dusk = smooth((t - 31) / 3.5);
    const sunOn = sunIn * (1 - smooth((t - 37) / 2.5));
    sun.visible = sunOn > 0.002;
    sun.position.set(0, -dusk * dusk * 3.2, -46 + 30 * easeOut((t - 19.2) / 3.2));
    sun.scale.setScalar(0.4 + 0.6 * sunIn - 0.35 * dusk);
    sunMat.color.set('#ff2234').lerp(new THREE.Color('#0b1a6e'), dusk);
    heartMat.color.set('#5e17eb').lerp(new THREE.Color('#030622'), dusk);
    sunMat.opacity = heartMat.opacity = sunOn;
    sunGlow.material.color.set('#ff2234').lerp(new THREE.Color('#2a3cff'), dusk);
    sunGlow.material.opacity = sunOn * (0.8 - 0.5 * dusk);
    sunStar.material.opacity = sunOn * (1 - dusk);
    sunStar.material.rotation = -run.starSpin * 0.6;

    rings.forEach((ring, k) => {
      const phase = ((t - 20.5) / 2.4 + k / 4) % 1;
      const on = t > 20.5 ? win(t, 20.5, 32, 1, 1.5) * sunOn : 0;
      ring.visible = on > 0.002;
      ring.position.copy(sun.position);
      ring.scale.setScalar(2.4 + phase * 9);
      ring.material.opacity = on * (1 - phase) * 0.75;
    });

    ORBIT.forEach((id, k) => {
      const a = (k * Math.PI * 2) / ORBIT.length + (t - 19.5) * 0.34 * calmK;
      const fallT = Math.max(0, t - 31);
      const r = 4.5 * (1 + fallT * 0.14);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.62 + 0.3 - fallT * fallT * 0.2;
      const z = sun.position.z + Math.sin(a) * 1.6;
      const tumble = fallT * 0.5 * (k % 2 ? 1 : -1) * calmK;
      card(id, x, y, z, 1.2, win(t, 19.8, 37.5, 1.8, 3), Math.sin(t * 0.7 + k) * 0.12 + tumble, tumble * 0.6);
    });

    card(DUSK, 0, 0.6, -14 + Math.max(0, t - 31.5) * 0.45, 2.5, win(t, 31.6, 39.9, 2.2, 1.6) * 0.9);

    // -------------------------------------------------- V · the wheel
    run.wheel += (0.32 + 2.6 * smooth((t - 44) / 3.2)) * dt * calmK;
    if (t > 40) {
      const rise = easeOut((t - 40) / 2.4);
      const close = easeIn((t - 45.2) / 2.1);
      const R = 5.4 * (1 - close);
      order.forEach((id, k) => {
        const a = (k * Math.PI * 2) / order.length + run.wheel;
        card(
          id,
          Math.cos(a) * R,
          Math.sin(a) * R - (1 - rise) * 9,
          -10,
          0.95 * (1 - 0.85 * close),
          rise * (1 - smooth((t - 46.6) / 0.8)),
          a - Math.PI / 2,
        );
      });
    }
  }

  // Before each frame: hide every card, update() shows the ones on stage
  function frame(t, dt, aspect) {
    camera.aspect = aspect;
    for (const m of cards.values()) m.visible = false;
    update(t, dt);
  }

  function caption(t) {
    for (const [a, b, text] of STORY) if (t >= a - 0.1 && t <= b + 0.1) return { text, alpha: win(t, a, b, 0.8, 1) };
    return { text: '', alpha: 0 };
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
  }

  return { scene, camera, frame, caption, dispose, duration: DURATION };
}
