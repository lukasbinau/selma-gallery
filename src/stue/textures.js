// Procedural textures for the room: everything is drawn in code. The costly
// ones (per-pixel noise) are drawn once at build time into small files
// (npm run stue-textures, see texture-files.js), and drawn here at runtime
// only if a file fails. All tiles repeat seamlessly (noise lattices wrap with
// the tile) and are sized in real-world metres by the caller through
// texture.repeat.
import * as THREE from 'three';
import { isBitmap } from '../art-texture.js';

// ------------------------------------------------------------------ noise
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a, p) => ((a % p) + p) % p;

// Value noise on a lattice that wraps every px × py cells (seamless tiles)
export function pnoise(x, y, px, py, seed = 0) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = fade(x - i);
  const v = fade(y - j);
  const h = (a, b) => hash(mod(a, px) * 57.13 + mod(b, py) * 131.7 + seed * 17.31);
  const a = h(i, j);
  const b = h(i + 1, j);
  const c = h(i, j + 1);
  const d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal sum of tileable noise; (x, y) in 0..1 tile space
export function fbm(x, y, base, octaves, seed = 0, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise(x * f, y * f, f, f, seed + o * 7);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

export const rand = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

// ------------------------------------------------------------------ canvas helpers
export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A texture from a canvas, or from a pre-made file decoded to an ImageBitmap,
// or (source null) one whose image comes later through setSource()
export function toTexture(source, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.Texture();
  if (source) setSource(t, source);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// A bitmap is decoded already flipped (WebGL ignores UNPACK_FLIP_Y for
// bitmaps), so it lands the same way up as a canvas uploaded with flipY
export function setSource(t, source) {
  t.image = source;
  t.flipY = !isBitmap(source);
  t.needsUpdate = true;
  return t;
}

// Fill a canvas from a per-pixel function returning [r, g, b] (0..255)
function paint(size, fn, h = size) {
  const c = makeCanvas(size, h);
  const g = c.getContext('2d');
  const img = g.createImageData(size, h);
  const d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / h, out, x, y);
      const i = (y * size + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Tangent-space normal map from a wrapping height field (Float32Array, size²)
export function normalFromHeight(height, size, strength = 2, h = size) {
  const c = makeCanvas(size, h);
  const g = c.getContext('2d');
  const img = g.createImageData(size, h);
  const d = img.data;
  const at = (x, y) => height[mod(y, h) * size + mod(x, size)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = (-dx / len) * 127.5 + 127.5;
      d[i + 1] = (dy / len) * 127.5 + 127.5;
      d[i + 2] = (1 / len) * 127.5 + 127.5;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (out, a, b, t) => {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
};
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ oak
// Fine oak grain running along u: long growth lines, medullary flecks, pores.
// Greyscale-ish albedo, tinted by material.color. One tile ≈ 1 m × 0.25 m.
export function oakGrain(size = 512, { light = [236, 214, 178], dark = [176, 140, 98], seed = 1 } = {}) {
  const H = size / 2;
  const out = paint(
    size,
    (u, v, o, x, y) => {
      const warp = fbm(u, v, 2, 3, seed) * 0.08 + fbm(u, v, 1, 2, seed + 3) * 0.05;
      const t = (v + warp) * 34;
      const ring = t - Math.floor(t);
      const line = Math.pow(1 - Math.abs(ring - 0.5) * 2, 9);
      const band = fbm(u * 0.5, v + warp, 3, 3, seed + 9);
      const pore = hash(Math.floor(x / 2) * 7.3 + y * 311.7 + seed) < 0.05 ? 0.25 : 0;
      const fleck = pnoise(u * 60, v * 12, 60, 12, seed + 4) > 0.86 ? 0.12 : 0;
      const k = clamp01(0.62 + (band - 0.5) * 0.7 - line * 0.3 - pore + fleck);
      mix3(o, dark, light, k);
    },
    H,
  );
  return out;
}

// Wide oiled oak floorboards (20 cm × random lengths), staggered joints, bevelled
// edges. Returns { map, rough, normal } canvases; one tile = 2.4 m × 2.4 m.
export function oakFloor(size = 1024, { tone = [214, 188, 150], seed = 3 } = {}) {
  const planks = 12; // 20 cm wide over 2.4 m
  const ph = size / planks;
  const r = rand(seed);
  const rows = [];
  for (let p = 0; p < planks; p++) {
    // joints along u (0..1); each row continues into the next tile
    const js = [];
    let u = r() * 0.7;
    while (u < 1) {
      js.push(u);
      u += 0.45 + r() * 0.55;
    }
    const tones = js.map(() => 0.8 + r() * 0.35);
    tones.push(tones[0]);
    rows.push({ js, tones, shift: r() * 10 });
  }
  const height = new Float32Array(size * size);
  const rough = makeCanvas(size);
  const rg = rough.getContext('2d');
  const rimg = rg.createImageData(size, size);
  const light = tone.map((c) => Math.min(255, c * 1.08));
  const dark = tone.map((c) => c * 0.72);
  const map = paint(size, (u, v, o, x, y) => {
    const row = Math.floor(y / ph);
    const R = rows[row];
    const yy = (y - row * ph) / ph; // 0..1 across the plank
    let seg = 0;
    let edgeU = 1;
    for (const j of R.js) {
      if (u >= j) seg++;
      edgeU = Math.min(edgeU, Math.abs(u - j) * size);
    }
    if (seg === R.js.length) seg = 0; // wraps into the next tile's first board
    const edgeV = Math.min(yy, 1 - yy) * ph;
    const edge = Math.min(edgeU, edgeV);
    const bevel = clamp01(edge / 2.2);
    const s = R.shift + seg * 3.1;
    const warp = fbm(u, v, 3, 2, seed + row) * 0.04;
    const t = (yy + warp * 8 + Math.sin(u * 6.283 * 2 + s) * 0.08) * 7 + s;
    const ring = t - Math.floor(t);
    const line = Math.pow(1 - Math.abs(ring - 0.5) * 2, 10);
    const cath = fbm(u * 2 + s, yy * 0.3, 4, 3, seed + 11);
    const tint = R.tones[seg];
    const pore = hash(Math.floor(x / 2) * 3.7 + y * 97.1) < 0.04 ? 0.18 : 0;
    let k = clamp01(0.55 + (cath - 0.5) * 0.8 - line * 0.22 - pore);
    mix3(o, dark, light, k);
    o[0] *= tint;
    o[1] *= tint * 0.995;
    o[2] *= tint * 0.98;
    // darker, dusty seams
    const seam = 1 - (1 - bevel) * 0.55;
    o[0] *= seam;
    o[1] *= seam;
    o[2] *= seam;
    height[y * size + x] = bevel * 0.6 + line * 0.04 + cath * 0.05;
    const ri = (y * size + x) * 4;
    const rv = 150 + (cath - 0.5) * 60 + (1 - bevel) * 60 + line * 20;
    rimg.data[ri] = rimg.data[ri + 1] = rimg.data[ri + 2] = rv;
    rimg.data[ri + 3] = 255;
  });
  rg.putImageData(rimg, 0, 0);
  return { map, rough, normal: normalFromHeight(height, size, 3) };
}

// ------------------------------------------------------------------ textiles
// Woven linen / bouclé: a fine weave plus slubs. Returns { map, normal };
// the map is near-white (tinted by material.color). One tile ≈ 0.25 m.
export function fabric(size = 256, { boucle = false, seed = 5 } = {}) {
  const height = new Float32Array(size * size);
  const map = paint(size, (u, v, o, x, y) => {
    let h;
    if (boucle) {
      // nubbly loops
      const loops = fbm(u, v, 32, 3, seed);
      const fine = pnoise(u * 96, v * 96, 96, 96, seed + 2);
      h = loops * 0.75 + fine * 0.25;
    } else {
      const warpT = Math.sin((x / size) * Math.PI * 2 * 96) * 0.5 + 0.5;
      const weftT = Math.sin((y / size) * Math.PI * 2 * 96) * 0.5 + 0.5;
      const over = (Math.floor((x / size) * 96) + Math.floor((y / size) * 96)) % 2;
      const slub = fbm(u * 0.25, v, 8, 2, seed) * 0.6;
      h = (over ? warpT : weftT) * 0.6 + slub * 0.6;
    }
    height[y * size + x] = h;
    const k = 0.86 + (h - 0.5) * 0.22;
    o[0] = o[1] = o[2] = clamp01(k) * 255;
  });
  return { map, normal: normalFromHeight(height, size, boucle ? 5 : 3) };
}

// Thick wool rug: soft tufts and a faint border-free melange
export function wool(size = 256, seed = 8) {
  const height = new Float32Array(size * size);
  const map = paint(size, (u, v, o, x, y) => {
    const tuft = fbm(u, v, 48, 2, seed);
    const mel = fbm(u, v, 6, 3, seed + 3);
    height[y * size + x] = tuft;
    const k = 0.8 + (tuft - 0.5) * 0.25 + (mel - 0.5) * 0.12;
    o[0] = o[1] = o[2] = clamp01(k) * 255;
  });
  return { map, normal: normalFromHeight(height, size, 4) };
}

// Barely-there trowel marks for painted plaster walls (tinted by colour)
export function plaster(size = 256, seed = 12) {
  const height = new Float32Array(size * size);
  const map = paint(size, (u, v, o, x, y) => {
    const m = fbm(u, v, 3, 4, seed);
    const roller = pnoise(u * 12, v * 30, 12, 30, seed + 1);
    height[y * size + x] = m * 0.6 + roller * 0.05;
    const k = 0.975 + (m - 0.5) * 0.035;
    o[0] = o[1] = o[2] = clamp01(k) * 255;
  });
  return { map, normal: normalFromHeight(height, size, 0.8) };
}

// Painted frames: the wood grain barely shows through the paint
export function paintedGrain(W = 256, H = 128) {
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = 0.94 + (pnoise((x / W) * 4, (y / H) * 60, 4, 60, 2) - 0.5) * 0.06;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ------------------------------------------------------------------ garden
// A lawn seen from a few metres: blades, clover patches, mowing stripes.
export function lawn(size = 512, seed = 21) {
  const dark = [62, 92, 40];
  const mid = [96, 128, 56];
  const dry = [146, 150, 84];
  return paint(size, (u, v, o) => {
    const patch = fbm(u, v, 4, 4, seed);
    const blades = pnoise(u * 180, v * 90, 180, 90, seed + 1);
    const fine = pnoise(u * 256, v * 256, 256, 256, seed + 2);
    const k = clamp01(patch * 0.8 + blades * 0.25 + fine * 0.15 - 0.15);
    mix3(o, dark, mid, k);
    const dryness = clamp01((fbm(u, v, 2, 3, seed + 5) - 0.62) * 3);
    mix3(o, o.slice(), dry, dryness * 0.5);
  });
}

// Clipped beech hedge: small leaves over larger clumps. Returns { map, normal }.
export function hedge(S = 256) {
  const height = new Float32Array(S * S);
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const leaves = fbm(u, v, 24, 3, 41);
      const big = fbm(u, v, 4, 3, 42);
      const h = leaves * 0.7 + big * 0.3;
      height[y * S + x] = h;
      const k = Math.min(1, Math.max(0, h * 1.3 - 0.25));
      const i = (y * S + x) * 4;
      img.data[i] = 34 + k * 46;
      img.data[i + 1] = 52 + k * 60;
      img.data[i + 2] = 24 + k * 22;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { map: c, normal: normalFromHeight(height, S, 6) };
}

// One leaf on a transparent card (u = along the leaf). Shapes: 'olive' narrow
// lance, 'birch' small toothed oval, 'fig' broad.
export function leafSprite(kind = 'olive', size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const W = size;
  const H = size;
  g.translate(W / 2, H * 0.96);
  const len = H * 0.92;
  const wid = kind === 'olive' ? W * 0.13 : kind === 'birch' ? W * 0.36 : W * 0.46;
  const grad = g.createLinearGradient(-wid, 0, wid, 0);
  if (kind === 'olive') {
    grad.addColorStop(0, '#5f6b4c');
    grad.addColorStop(0.5, '#808b68');
    grad.addColorStop(1, '#6b7656');
  } else if (kind === 'birch') {
    grad.addColorStop(0, '#4f7a2e');
    grad.addColorStop(0.5, '#6f9a3c');
    grad.addColorStop(1, '#58832f');
  } else {
    grad.addColorStop(0, '#2f4f22');
    grad.addColorStop(0.5, '#4a6f30');
    grad.addColorStop(1, '#355a26');
  }
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 1.1, -len * 0.25, wid, -len * 0.7, 0, -len);
  g.bezierCurveTo(-wid, -len * 0.7, -wid * 1.1, -len * 0.25, 0, 0);
  g.fill();
  g.strokeStyle = 'rgba(230,240,200,0.35)';
  g.lineWidth = Math.max(1, W / 90);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(0, -len * 0.95);
  g.stroke();
  const t = toTexture(c, { repeat: false });
  // Alpha-tested leaves vanish in blurry mip levels: sample the full-size
  // sprite (the progressive render anti-aliases the edges)
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  return t;
}

// White birch bark with dark lenticels and knots (u around, v up)
export function birchBark(size = 256, seed = 31) {
  return paint(size, (u, v, o) => {
    const base = 0.9 + (fbm(u, v, 4, 3, seed) - 0.5) * 0.15;
    const lent = pnoise(u * 6, v * 70, 6, 70, seed + 1);
    const knot = fbm(u, v, 3, 3, seed + 2);
    let k = base;
    if (lent > 0.78) k *= 0.35;
    if (knot > 0.72) k *= 0.25;
    o[0] = clamp01(k) * 238;
    o[1] = clamp01(k) * 234;
    o[2] = clamp01(k) * 224;
  });
}

// Soft radial falloff for contact shadows and lamp glows
export function radialSprite(size = 128, { inner = 0, power = 2 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = r < inner ? 1 : Math.pow(1 - (r - inner) / (1 - inner), power);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false });
}

// Soft rectangular falloff (contact shadow of a box on the floor / a frame on the wall)
export function boxShadowSprite(size = 128, soft = 0.3) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const edge = (t) => {
    const d = Math.min(t, 1 - t) / soft;
    return d >= 1 ? 1 : d * d * (3 - 2 * d);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = edge((x + 0.5) / size) * edge((y + 0.5) / size);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: false, srgb: false });
}
