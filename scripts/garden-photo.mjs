// Cuts the garden seen through the glazing in I din stue out of a panorama.
// Run: node scripts/garden-photo.mjs <panorama.jpg>
//
// The panorama is Poly Haven's "Noon Grass" (CC0), its tonemapped 8K JPEG:
//   https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/noon_grass.jpg
// (8192 × 4096, not kept in the repo). Out comes the sector garden.js projects:
// 160° across, centred on column CENTRE (the view straight out of the glazing),
// from 40° above the horizon to 45° below, in two sizes (desktop, phone) and
// two formats, and the sky's mask:
//   src/stue/photos/have-{3200,1600}.{avif,webp}, have-himmel.webp
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'src/stue/photos';
const CENTRE = 4796; // open lawn and a distant tree line straight out
const SECTOR = { az: 160, top: 40, bottom: -45 }; // keep in step with garden.js
const SIZES = { 3200: { avif: 55, webp: 78 }, 1600: { avif: 55, webp: 78 } };

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/garden-photo.mjs <panorama.jpg>');
const { data, info } = await sharp(src, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const half = Math.round((SECTOR.az / 2 / 360) * W);
const top = Math.round((0.5 - SECTOR.top / 180) * H);
const height = Math.round((0.5 - SECTOR.bottom / 180) * H) - top;
const width = 2 * half;

// the sector may run across the panorama's seam: cut it in one or two pieces
const x0 = (((CENTRE - half) % W) + W) % W;
const pieces = x0 + width <= W ? [{ left: x0, width, at: 0 }] : [{ left: x0, width: W - x0, at: 0 }, { left: 0, width: width - (W - x0), at: W - x0 }];
const raw = () => sharp(data, { raw: info, limitInputPixels: false });
const parts = await Promise.all(pieces.map(async (p) => ({ input: await raw().extract({ left: p.left, top, width: p.width, height }).png().toBuffer(), left: p.at, top: 0 })));
const sector = await sharp({ create: { width, height, channels: 3, background: '#000' }, limitInputPixels: false }).composite(parts).png().toBuffer();

mkdirSync(OUT, { recursive: true });
for (const [w, q] of Object.entries(SIZES)) {
  const img = sharp(sector, { limitInputPixels: false }).resize(+w);
  const [a, b] = await Promise.all([
    img.clone().avif({ quality: q.avif, effort: 6 }).toFile(`${OUT}/have-${w}.avif`),
    img.clone().webp({ quality: q.webp }).toFile(`${OUT}/have-${w}.webp`),
  ]);
  console.log(`have-${w}: ${a.width}×${a.height}, avif ${Math.round(a.size / 1024)} KB, webp ${Math.round(b.size / 1024)} KB`);
}

// The sky mask (white = sky), for where garden.js lets the procedural sky show
// through: the evening's glow and the stars at night. The sky in this photo is
// clear, so it is the pixels clearly bluer than they are red or green, above
// the horizon (pale near the horizon, deep blue overhead), softened a little.
{
  const w = 1600;
  const { data: px, info: m } = await sharp(sector, { limitInputPixels: false }).resize(w).raw().toBuffer({ resolveWithObject: true });
  const horizon = Math.round((SECTOR.top / (SECTOR.top - SECTOR.bottom)) * m.height);
  const mask = Buffer.alloc(m.width * m.height);
  for (let y = 0; y < horizon; y++) {
    for (let x = 0; x < m.width; x++) {
      const i = (y * m.width + x) * m.channels;
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      if (b > 150 && b - r > 40 && b - g > 25) mask[y * m.width + x] = 255;
    }
  }
  const out = await sharp(mask, { raw: { width: m.width, height: m.height, channels: 1 } })
    .blur(1)
    .webp({ quality: 90 })
    .toFile(`${OUT}/have-himmel.webp`);
  console.log(`have-himmel: ${out.width}×${out.height}, webp ${Math.round(out.size / 1024)} KB`);
}
