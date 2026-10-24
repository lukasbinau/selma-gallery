// Turns the source photos into the images the site uses. Run: npm run images
//
//   source/originals/*.jpg   Lukas's first photos (uncropped)
//   source/canva/*           the bitmaps embedded in Selma's Canva design
//   public/art/<id>-{2048,1024,640}.jpg   every work, straight-on, three sizes
//   public/studio/*.jpg      atelier photos for PROCESSEN
//   public/pattern/*.webp    the sidebar tiles (crops of two paintings)
//   public/hero-banner.jpg   the strip under KUNST
//   src/art-meta.json        pixel size of every work (for aspect-ratio / no layout shift)
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { rectify } from './rectify.mjs';

const ORIG = 'source/originals';
const CANVA = 'source/canva';
const SIZES = [2048, 1024, 640];

// One entry per work, keyed by the id used in src/vaerker.json.
//   file:    source photo
//   crop:    [left, top, right, bottom] as fractions, for photos that are already straight
//   corners: four corner points (px, clockwise from top-left) for photos taken at an angle
//   trim:    the Canva cutouts have transparent surroundings; trim them, then inset a little
//   turn:    rotate the result (degrees)
const works = {
  'orange-mand': { file: `${ORIG}/8cac5728-749c-484a-9fb0-06f8b1b3c64c.jpg` },
  'lille-stjerne': {
    file: `${ORIG}/b788a75c-feed-4c97-8d28-927b8ceffcbb.jpg`,
    crop: [0.172, 0.224, 0.818, 0.828],
    turn: 180,
  },
  'blaa-time': { file: `${ORIG}/c8293f1b-18c0-4c3d-8ac8-44a9998fcb56.jpg` },
  rapsmarker: { file: `${ORIG}/d0b86156-b143-45a8-b40c-73b194be22ed.jpg` },
  markvej: { file: `${ORIG}/d3aa46a0-aa8d-438c-855a-76e8cc5777e0.jpg` },
  'groent-glas': { file: `${ORIG}/f7a312a5-5ce7-4258-ad72-439b44930927.jpg`, crop: [0.222, 0.114, 0.75, 0.902] },
  // From the Canva file (corner points measured on the photos)
  'moenster-lyseroed': {
    file: `${CANVA}/img05.jpg`,
    corners: [
      [260, 69],
      [1575, 59],
      [1537, 1800],
      [332, 1810],
    ],
  },
  'sol-og-figur': {
    file: `${CANVA}/img07.jpg`,
    corners: [
      [430, 458],
      [1565, 437],
      [1544, 1621],
      [426, 1613],
    ],
  },
  'lilla-skyer': {
    file: `${CANVA}/img08.jpg`,
    corners: [
      [300, 262],
      [1800, 248],
      [1970, 2436],
      [252, 2453],
    ],
  },
  cirkler: {
    file: `${CANVA}/img10.jpg`,
    corners: [
      [212, 450],
      [1562, 472],
      [1584, 1800],
      [198, 1782],
    ],
  },
  ansigt: { file: `${CANVA}/img12.png`, trim: true },
  figur: { file: `${CANVA}/img13.png`, trim: true },
  'blaa-fliser': {
    file: `${CANVA}/img15.png`,
    corners: [
      [37, 164],
      [473, 175],
      [454, 682],
      [75, 696],
    ],
  },
  'roedt-moenster': {
    file: `${CANVA}/img15.png`,
    corners: [
      [478, 252],
      [888, 266],
      [846, 742],
      [472, 729],
    ],
  },
};

const studio = {
  'atelier-staffeli': `${CANVA}/img16.jpg`,
  'atelier-reol': `${CANVA}/img17.jpg`,
  'atelier-palet': `${CANVA}/img18.jpg`,
};

for (const d of ['public/art', 'public/studio', 'public/pattern']) mkdirSync(d, { recursive: true });

// Straight, full-resolution version of one work
async function straight(spec) {
  if (spec.corners) return rectify(spec.file, spec.corners, 2400);
  let img = sharp(spec.file).rotate();
  if (spec.trim) {
    const buf = await img.trim({ threshold: 10 }).flatten({ background: '#ffffff' }).toBuffer();
    const { width, height } = await sharp(buf).metadata();
    const inset = Math.round(Math.min(width, height) * 0.015); // hide the cutout's soft edge
    img = sharp(buf).extract({ left: inset, top: inset, width: width - inset * 2, height: height - inset * 2 });
  } else if (spec.crop) {
    const { width, height } = await img.metadata();
    const [l, t, r, b] = spec.crop;
    img = img.extract({
      left: Math.round(l * width),
      top: Math.round(t * height),
      width: Math.round((r - l) * width),
      height: Math.round((b - t) * height),
    });
  }
  if (spec.turn) img = sharp(await img.toBuffer()).rotate(spec.turn);
  return img;
}

const meta = {};
const master = {}; // full-res buffers, reused for the tiles and the banner
for (const [id, spec] of Object.entries(works)) {
  const buf = await (await straight(spec)).jpeg({ quality: 95 }).toBuffer();
  master[id] = buf;
  for (const size of SIZES) {
    const info = await sharp(buf)
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: size === 640 ? 80 : 84, mozjpeg: true })
      .toFile(`public/art/${id}-${size}.jpg`);
    if (size === 2048) meta[id] = { w: info.width, h: info.height };
  }
  console.log(id.padEnd(18), meta[id].w, '×', meta[id].h);
}
writeFileSync('src/art-meta.json', JSON.stringify(meta, null, 2) + '\n');

for (const [name, file] of Object.entries(studio)) {
  for (const size of [1600, 800]) {
    await sharp(file).rotate().resize({ width: size }).jpeg({ quality: 82, mozjpeg: true }).toFile(`public/studio/${name}-${size}.jpg`);
  }
  console.log(name);
}

// Sidebar tiles: the quatrefoil from "Mønster lyserød", the sun from "Sol og figur".
// Fractions of the straightened painting; tiles are square-ish like in the design.
async function tile(id, [l, t, r, b], out) {
  const { width, height } = await sharp(master[id]).metadata();
  await sharp(master[id])
    .extract({
      left: Math.round(l * width),
      top: Math.round(t * height),
      width: Math.round((r - l) * width),
      height: Math.round((b - t) * height),
    })
    .resize({ width: 240, height: 240, fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(`public/pattern/${out}.webp`);
}
await tile('moenster-lyseroed', [0.22, 0.49, 0.66, 0.76], 'firkloever');
await tile('sol-og-figur', [0.28, 0.08, 0.58, 0.38], 'sol');

// Banner under KUNST: the upper part of the pattern painting, wide
{
  const { width, height } = await sharp(master['moenster-lyseroed']).metadata();
  const bh = Math.round(width / 1.92);
  await sharp(master['moenster-lyseroed'])
    .extract({ left: 0, top: Math.round(height * 0.02), width, height: bh })
    .resize({ width: 2000 })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile('public/hero-banner.jpg');
  console.log('hero-banner');
}
