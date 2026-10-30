// Turns the source photos into the images the site uses. Run: npm run images
//
//   source/originals/*.jpg   photos of the works (uncropped)
//   source/canva/*           the bitmaps embedded in Selma's Canva design
//   public/art/<id>-{2048,1024,640}.{avif,webp,jpg}   every work, straight-on, three sizes
//   public/studio/*.{avif,webp,jpg}                   atelier photos for OM MIG
//   public/pattern/*.webp    the sidebar tiles (see TILES below)
//   public/hero-banner{,-1200}.{avif,webp,jpg}         the strip under KUNST
//   src/art-meta.json        pixel size of every work (for aspect-ratio / no layout shift)
//
// Every photo is written in three formats. Browsers pick AVIF (most of them,
// and by far the smallest), else WebP, else JPEG: the front page through
// <picture>, the gallery through src/art-format.js. See ENCODE for the settings.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { rectify } from './rectify.mjs';

const ORIG = 'source/originals';
const CANVA = 'source/canva';
const SIZES = [2048, 1024, 640];

// Encoder settings per output. The JPEGs keep the settings they always had.
// AVIF and WebP were tuned against them so the paintings look the same:
// crops of the finest detail (Lilla skyer's canvas weave, the pencil lines in
// Ansigt) compared side by side at 2×, and SSIM against the uncompressed
// image no lower than the JPEG's. AVIF keeps full colour resolution (4:4:4):
// at 4:2:0 thin lines of saturated paint go soft.
const ENCODE = {
  art: {
    640: { jpg: 80, webp: 78, avif: 58 },
    1024: { jpg: 84, webp: 82, avif: 64 },
    2048: { jpg: 84, webp: 82, avif: 64 },
  },
  photo: { jpg: 82, webp: 80, avif: 56 }, // atelier photos and the banner
};

// One image, three files: <base>.jpg, <base>.webp, <base>.avif
async function writeFormats(img, base, q) {
  const [info] = await Promise.all([
    img.clone().jpeg({ quality: q.jpg, mozjpeg: true }).toFile(`${base}.jpg`),
    img.clone().webp({ quality: q.webp, effort: 6, smartSubsample: true }).toFile(`${base}.webp`),
    img.clone().avif({ quality: q.avif, effort: 6, chromaSubsampling: '4:4:4' }).toFile(`${base}.avif`),
  ]);
  return info;
}

// One entry per work, keyed by the id used in src/vaerker.json.
//   file:    source photo
//   crop:    [left, top, right, bottom] as fractions, for photos that are already straight
//   corners: four corner points (px, clockwise from top-left) for photos taken at an angle
//   edges:   with corners: extra points along edges that bow (curled paper), see rectify.mjs
//   aspect:  with corners: the real width / height, when it is known
//   inset:   with corners: share cut from every side, so no background shows at the edge
//   trim:    the Canva cutouts have transparent surroundings; trim them, then inset a little
//   turn:    rotate the result (degrees)
const works = {
  fuglene: { file: `${ORIG}/fuglene.jpg` }, // Selmas foto, taget lige forfra
  'orange-mand': { file: `${ORIG}/8cac5728-749c-484a-9fb0-06f8b1b3c64c.jpg` },
  'lille-stjerne': {
    file: `${ORIG}/b788a75c-feed-4c97-8d28-927b8ceffcbb.jpg`,
    crop: [0.172, 0.224, 0.818, 0.828],
    turn: 180,
  },
  'blaa-time': { file: `${ORIG}/c8293f1b-18c0-4c3d-8ac8-44a9998fcb56.jpg` },
  rapsmarker: { file: `${ORIG}/d0b86156-b143-45a8-b40c-73b194be22ed.jpg` },
  'groent-glas': { file: `${ORIG}/f7a312a5-5ce7-4258-ad72-439b44930927.jpg`, crop: [0.222, 0.114, 0.75, 0.902] },
  // A4 on a tablecloth; the paper curls, so its top and bottom edges sag. The
  // edge points were found by scanning for the blue paper against the cloth.
  'blaa-fliser': {
    file: `${ORIG}/blaat-moenster-paa-dug.jpg`,
    corners: [
      [165, 209],
      [917, 184],
      [924, 1231],
      [145, 1232],
    ],
    edges: {
      top: [[244, 209], [318, 214], [392, 221], [466, 227], [540, 226], [614, 222], [688, 212], [762, 200], [836, 191]],
      bottom: [[244, 1227], [318, 1224], [392, 1221], [466, 1217], [540, 1213], [614, 1209], [688, 1208], [762, 1210], [836, 1216]],
      left: [[161, 325], [160, 435], [159, 545], [158, 710], [157, 820], [156, 930], [156, 1040], [151, 1150]],
      right: [[918, 325], [918, 435], [918, 545], [919, 710], [921, 820], [922, 930], [923, 1040], [924, 1150]],
    },
    aspect: 21 / 29.7,
    inset: 0.006,
  },
  // From the Canva file (corner points measured on the photos)
  'moenster-lyseroed': {
    file: `${CANVA}/img05.jpg`,
    corners: [
      [252, 63],
      [1577, 63],
      [1508, 1776],
      [331, 1788],
    ],
    inset: 0.004,
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
  portraet: { file: `${ORIG}/portraet-blaat-haar.jpg` },
  ansigt: { file: `${CANVA}/img12.png`, trim: true },
  figur: { file: `${CANVA}/img13.png`, trim: true },
};

// The sidebar tiles: square crops centred on one motif. To use another
// pattern, point `from` at a work id (its straightened image, crop in
// fractions of it) or at a file (crop in pixels), and adjust the crop.
//   mirror: the right half is the left half flipped, for a motif whose right
//           side touches its neighbour in the painting
const TILES = {
  // One blue quatrefoil from "Lyserødt mønster", pink around it, a hint of the green band below
  firkloever: { from: 'moenster-lyseroed', crop: [0.0786, 0.4873, 0.4466, 0.7549], mirror: true },
  // The sun from the earlier, yellow state of "Sol og figur", centred on its dark blue sky
  sol: { from: `${CANVA}/img07.jpg`, crop: [704, 580, 1024, 900] },
};

const studio = {
  'atelier-staffeli': `${CANVA}/img16.jpg`,
  'atelier-reol': `${CANVA}/img17.jpg`,
  'atelier-palet': `${CANVA}/img18.jpg`,
};

for (const d of ['public/art', 'public/studio', 'public/pattern']) mkdirSync(d, { recursive: true });

// Straight, full-resolution version of one work
async function straight(spec) {
  if (spec.corners) return rectify(spec.file, spec.corners, 2400, spec);
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
    const img = sharp(buf).resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true });
    const info = await writeFormats(img, `public/art/${id}-${size}`, ENCODE.art[size]);
    if (size === 2048) meta[id] = { w: info.width, h: info.height };
  }
  console.log(id.padEnd(18), meta[id].w, '×', meta[id].h);
}
writeFileSync('src/art-meta.json', JSON.stringify(meta, null, 2) + '\n');

for (const [name, file] of Object.entries(studio)) {
  for (const size of [1600, 800]) {
    await writeFormats(sharp(file).rotate().resize({ width: size }), `public/studio/${name}-${size}`, ENCODE.photo);
  }
  console.log(name);
}

for (const [name, { from, crop, mirror }] of Object.entries(TILES)) {
  const input = master[from] || from;
  const { width, height } = await sharp(input).metadata();
  const px = master[from] ? [crop[0] * width, crop[1] * height, crop[2] * width, crop[3] * height] : crop;
  const [l, t, r, b] = px.map(Math.round);
  let tile = await sharp(input)
    .extract({ left: l, top: t, width: r - l, height: b - t })
    .resize({ width: 240, height: 240, fit: 'cover' })
    .toBuffer();
  if (mirror) {
    const half = await sharp(tile).extract({ left: 0, top: 0, width: 120, height: 240 }).flop().toBuffer();
    tile = await sharp(tile).composite([{ input: half, left: 120, top: 0 }]).toBuffer();
  }
  await sharp(tile).webp({ quality: 82 }).toFile(`public/pattern/${name}.webp`);
  console.log('tile', name);
}

// Banner under KUNST: the upper part of the pattern painting, wide
{
  const { width, height } = await sharp(master['moenster-lyseroed']).metadata();
  const bh = Math.round(width / 1.92);
  const banner = await sharp(master['moenster-lyseroed'])
    .extract({ left: 0, top: Math.round(height * 0.02), width, height: bh })
    .png() // lossless in between
    .toBuffer();
  await writeFormats(sharp(banner).resize({ width: 2000 }), 'public/hero-banner', ENCODE.photo);
  await writeFormats(sharp(banner).resize({ width: 1200 }), 'public/hero-banner-1200', ENCODE.photo); // phones
  console.log('hero-banner');
}
