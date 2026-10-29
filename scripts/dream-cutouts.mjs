// Cuts the cast of the journey behind Lille stjerne (src/gallery/dream.js)
// out of Selma's photos: run `node scripts/dream-cutouts.mjs` after a photo
// changes. Writes public/art/dream/<name>.webp (with transparency) and
// src/gallery/dream-cast.json (their sizes).
//
// Each cutout is traced by colour from a seed point (a flood fill), tidied
// (gaps closed, holes filled, an outline grown back on) and feathered; faces
// whose edges are not one clean colour get a soft oval cameo instead, and
// Cirkler's circles a disc each. Points are fractions of the photo: x from
// the left, y from the top.
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = (id) => `public/art/${id}-1024.jpg`;
const OUT = 'public/art/dream';
const MAX = 768;

// Colour tests on [r, g, b]
const isRed = ([r, g, b]) => r > 140 && r > g + 70 && r > b + 50;
const isPink = ([r, g, b]) => r > 190 && g > 110 && g < 205 && b > 140 && r > g + 25;
const isPale = ([r, g, b]) => b > 195 && g > 145 && r > 105; // the pale lavender-blue of the flower
const isViolet = ([r, g, b]) => b > 120 && b > r + 25 && b > g + 35;
const isGreen = ([r, g, b]) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return g >= r - 12 && g > b + 4 && max - min > 22 && !(b > r + 40);
};

const CAST = [
  // Sol og figur: the red figure lying on her front, one leg in the air. The
  // painting has left the site (to be repainted), so its photo is gone and the
  // cutout already made is kept as it is (see below)
  { name: 'figur-sol', id: 'sol-og-figur', kind: 'flood', seed: [0.475, 0.656], test: isRed, close: 3, grow: 9 },
  // Vådt hår: the pink figure with one blue eye
  { name: 'vaadt-haar', id: 'figur', kind: 'flood', seed: [0.47, 0.36], test: isPink, close: 4, grow: 7 },
  // Portræt: everything that is not the red ground, round the face
  { name: 'portraet', id: 'portraet', kind: 'flood', seed: [0.5, 0.44], test: (c) => !isRed(c), close: 3, grow: 3 },
  // Blå øjne and Orange mand: soft oval cameos
  { name: 'blaa-oejne', id: 'ansigt', kind: 'oval', centre: [0.514, 0.47], radius: [0.27, 0.27] },
  { name: 'orange-mand', id: 'orange-mand', kind: 'oval', centre: [0.484, 0.42], radius: [0.35, 0.32] },
  // Grønt glas: the jug and the glass, each from its own corner of the sheet
  { name: 'kande', id: 'groent-glas', kind: 'region', test: isGreen, box: [0.1, 0.21, 0.48, 0.8], close: 7, grow: 3 },
  { name: 'glas', id: 'groent-glas', kind: 'region', test: isGreen, box: [0.55, 0.56, 0.86, 0.92], close: 7, grow: 3 },
  // Lyserødt mønster: the big pale flower
  { name: 'blomst', id: 'moenster-lyseroed', kind: 'region', box: [0.5, 0.5, 0.92, 0.97], test: isPale, close: 6, grow: 2 },
  // Lilla skyer: the violet cloud bank
  { name: 'sky', id: 'lilla-skyer', kind: 'flood', seed: [0.4, 0.3], test: isViolet, above: 0.452, close: 4, grow: 2 },
  // Cirkler: the four circles
  { name: 'cirkel-1', id: 'cirkler', kind: 'disc', centre: [0.297, 0.338], radius: 0.142 },
  { name: 'cirkel-2', id: 'cirkler', kind: 'disc', centre: [0.648, 0.338], radius: 0.142 },
  { name: 'cirkel-3', id: 'cirkler', kind: 'disc', centre: [0.32, 0.66], radius: 0.142 },
  { name: 'cirkel-4', id: 'cirkler', kind: 'disc', centre: [0.656, 0.675], radius: 0.142 },
];

// ---------------------------------------------------------------- mask tools
// `rows` limits the fill to rows above that one (a horizon it must not cross)
function flood(px, w, h, sx, sy, test, rows = h) {
  const m = new Uint8Array(w * h);
  const at = (k) => [px[k * 3], px[k * 3 + 1], px[k * 3 + 2]];
  const start = sy * w + sx;
  if (!test(at(start))) throw new Error(`seed (${sx}, ${sy}) is not the colour it should be: ${at(start)}`);
  const stack = [start];
  m[start] = 1;
  while (stack.length) {
    const k = stack.pop();
    const x = k % w;
    const y = (k / w) | 0;
    for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
      if (n >= 0 && !m[n] && n < rows * w && test(at(n))) {
        m[n] = 1;
        stack.push(n);
      }
    }
  }
  return m;
}

// Max (grow) or min (shrink) over a square of radius r, separably
function morph(m, w, h, r, grow) {
  if (r <= 0) return m;
  const pass = (src, horizontal) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          const inside = xx >= 0 && yy >= 0 && xx < w && yy < h;
          const s = inside ? src[yy * w + xx] : 0;
          if (grow ? s : !s) {
            v = grow ? 1 : 0;
            break;
          }
        }
        out[y * w + x] = v;
      }
    }
    return out;
  };
  return pass(pass(m, true), false);
}

// Holes: background that cannot reach the border
function fillHoles(m, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  for (const k of stack) if (!m[k]) outside[k] = 1;
  while (stack.length) {
    const k = stack.pop();
    if (m[k]) continue;
    const x = k % w;
    const y = (k / w) | 0;
    for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
      if (n >= 0 && !m[n] && !outside[n]) {
        outside[n] = 1;
        stack.push(n);
      }
    }
  }
  const out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = outside[k] ? 0 : 1;
  return out;
}

// Keep only the biggest connected piece
function largest(m, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  let best = -1;
  let bestSize = 0;
  let id = 0;
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || label[s] >= 0) continue;
    let size = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const k = stack.pop();
      size++;
      const x = k % w;
      const y = (k / w) | 0;
      for (const n of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) {
        if (n >= 0 && m[n] && label[n] < 0) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) (bestSize = size), (best = id);
    id++;
  }
  const out = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) out[k] = label[k] === best ? 1 : 0;
  return out;
}

// ---------------------------------------------------------------- one cutout
async function cut(c) {
  const { data, info } = await sharp(SRC(c.id)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let m;
  let soft = 1.2; // feather (px)

  if (c.kind === 'flood') {
    m = flood(data, w, h, Math.round(c.seed[0] * w), Math.round(c.seed[1] * h), c.test, c.above ? Math.round(c.above * h) : h);
  } else if (c.kind === 'region') {
    m = new Uint8Array(w * h);
    const [x0, y0, x1, y1] = c.box.map((v, i) => Math.round(v * (i % 2 ? h : w)));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const k = y * w + x;
        m[k] = c.test([data[k * 3], data[k * 3 + 1], data[k * 3 + 2]]) ? 1 : 0;
      }
    }
  } else if (c.kind === 'oval' || c.kind === 'disc') {
    m = new Uint8Array(w * h);
    const cx = c.centre[0] * w;
    const cy = c.centre[1] * h;
    const rx = (c.kind === 'disc' ? c.radius : c.radius[0]) * w;
    const ry = c.kind === 'disc' ? rx : c.radius[1] * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 ? 1 : 0;
    soft = c.kind === 'oval' ? 14 : 2;
  }

  if (c.close) m = morph(morph(m, w, h, c.close, true), w, h, c.close, false);
  if (c.kind !== 'oval' && c.kind !== 'disc') m = largest(fillHoles(m, w, h), w, h);
  if (c.grow) m = morph(m, w, h, c.grow, true);

  // Bounding box with a margin for the feather
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const pad = Math.ceil(soft * 2) + 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;

  const alpha = Buffer.alloc(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) alpha[y * cw + x] = m[(y + y0) * w + x + x0] ? 255 : 0;
  const alphaImg = await sharp(alpha, { raw: { width: cw, height: ch, channels: 1 } })
    .blur(soft)
    .extractChannel(0) // blur hands back three channels
    .raw()
    .toBuffer();

  const rgb = await sharp(SRC(c.id)).removeAlpha().extract({ left: x0, top: y0, width: cw, height: ch }).raw().toBuffer();
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let k = 0; k < cw * ch; k++) {
    rgba[k * 4] = rgb[k * 3];
    rgba[k * 4 + 1] = rgb[k * 3 + 1];
    rgba[k * 4 + 2] = rgb[k * 3 + 2];
    rgba[k * 4 + 3] = alphaImg[k];
  }
  const scale = Math.min(1, MAX / Math.max(cw, ch));
  const ow = Math.round(cw * scale);
  const oh = Math.round(ch * scale);
  await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(ow, oh)
    .webp({ quality: 84, alphaQuality: 90 })
    .toFile(`${OUT}/${c.name}.webp`);
  // Where the cutout sat in the photo (fractions), for placing it back on the painting
  return { w: ow, h: oh, from: c.id, box: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h].map((v) => +v.toFixed(4)) };
}

mkdirSync(OUT, { recursive: true });
const before = existsSync('src/gallery/dream-cast.json') ? JSON.parse(readFileSync('src/gallery/dream-cast.json', 'utf8')) : {};
const meta = {};
for (const c of CAST) {
  if (!existsSync(SRC(c.id)) && before[c.name]) {
    meta[c.name] = before[c.name];
    console.log(c.name.padEnd(12), 'kept (no photo of', c.id + ')');
    continue;
  }
  meta[c.name] = await cut(c);
  console.log(c.name.padEnd(12), meta[c.name].w, '×', meta[c.name].h);
}
writeFileSync('src/gallery/dream-cast.json', JSON.stringify(meta, null, 2) + '\n');
