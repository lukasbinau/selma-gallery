// Makes the garden seen through the glazing in I din stue from two backplates.
// Run: node scripts/garden-photo.mjs <DSC08786.jpg> <DSC08774.jpg>
//
// The photos are backplates from Poly Haven's "Lythwood Field" (CC0), shot
// with a 24 mm lens on full frame (7360 × 4912), the "jpg_pretty" versions:
//   https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Backplates/lythwood_field/jpg_pretty/DSC08786.jpg
//   https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Backplates/lythwood_field/jpg_pretty/DSC08774.jpg
// (25 MB each, not kept in the repo). One photo per room: the stue looks out
// one way along the glazing, the spisestue the other (see garden.js VIEWS).
//
// Out, for each room, in src/stue/photos/:
//   have-<room>-{768,1600,3072,5120}.avif   first picture, phone, desktop, desktop 2×
//   have-<room>-{768,1600,3072}.webp         for browsers without AVIF
//   have-<room>-himmel.webp                  the sky's mask (white = sky)
// Widths follow texel density: 5120 px across the 74° frame is ~60 px/deg,
// about what a 1440-wide screen at DPR 2 shows through the glass; 3072 covers
// DPR 1, and 1600 a phone (it renders at 1.5×, ~12 px/deg).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'src/stue/photos';
const ROOMS = ['stue', 'spise'];
const WIDTHS = { 768: { avif: 50, webp: 72 }, 1600: { avif: 52, webp: 76 }, 3072: { avif: 52, webp: 76 }, 5120: { avif: 50 } };

const srcs = process.argv.slice(2);
if (srcs.length !== 2) throw new Error('usage: node scripts/garden-photo.mjs <stue photo> <spise photo>');
mkdirSync(OUT, { recursive: true });

for (const [k, room] of ROOMS.entries()) {
  const src = sharp(srcs[k], { limitInputPixels: false });
  for (const [w, q] of Object.entries(WIDTHS)) {
    const img = src.clone().resize(+w);
    const sizes = [];
    const a = await img.clone().avif({ quality: q.avif, effort: 6 }).toFile(`${OUT}/have-${room}-${w}.avif`);
    sizes.push(`avif ${Math.round(a.size / 1024)} KB`);
    if (q.webp) {
      const b = await img.clone().webp({ quality: q.webp }).toFile(`${OUT}/have-${room}-${w}.webp`);
      sizes.push(`webp ${Math.round(b.size / 1024)} KB`);
    }
    console.log(`have-${room}-${w}: ${a.width}×${a.height}, ${sizes.join(', ')}`);
  }

  // The sky: overcast, so bright and grey. Pixels like that joined to the top
  // edge through others like them, so the white gazebo and house stay garden.
  const { data: px, info: m } = await src.clone().resize(1024).raw().toBuffer({ resolveWithObject: true });
  const W = m.width;
  const H = m.height;
  const skyish = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = px[i * m.channels];
    const g = px[i * m.channels + 1];
    const b = px[i * m.channels + 2];
    const hi = Math.max(r, g, b);
    if (hi > 175 && hi - Math.min(r, g, b) < 34) skyish[i] = 1;
  }
  const mask = Buffer.alloc(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) if (skyish[x]) stack.push(x);
  while (stack.length) {
    const i = stack.pop();
    if (mask[i]) continue;
    mask[i] = 255;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (skyish[j] && !mask[j]) stack.push(j);
    }
  }
  const out = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).webp({ quality: 90 }).toFile(`${OUT}/have-${room}-himmel.webp`);
  // the sky's average colour, for above the top of the frame (garden.js VIEWS)
  let n = 0;
  const sum = [0, 0, 0];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    n++;
    for (let c = 0; c < 3; c++) sum[c] += px[i * m.channels + c];
  }
  const hex = '#' + sum.map((s) => Math.round(s / Math.max(1, n)).toString(16).padStart(2, '0')).join('');
  console.log(`have-${room}-himmel: ${out.width}×${out.height}, webp ${Math.round(out.size / 1024)} KB, sky ${hex}`);
}
