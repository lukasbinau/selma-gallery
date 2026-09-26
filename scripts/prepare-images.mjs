// Crops Selma's source photos down to just the artwork and writes
// web-sized copies to public/art. Run with: npm run images
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'public/art';
const MAX_EDGE = 2048;

// crop is [left, top, right, bottom] as fractions of the source image.
// Omit it when the file is already just the artwork.
const sources = [
  { out: 'portrait-orange.jpg', src: '8cac5728-749c-484a-9fb0-06f8b1b3c64c.jpg' },
  { out: 'red-blue-canyon.jpg', src: 'b788a75c-feed-4c97-8d28-927b8ceffcbb.jpg', crop: [0.172, 0.224, 0.818, 0.828], turn: 180 },
  { out: 'blue-house.jpg', src: 'c8293f1b-18c0-4c3d-8ac8-44a9998fcb56.jpg' },
  { out: 'fields.jpg', src: 'd0b86156-b143-45a8-b40c-73b194be22ed.jpg' },
  { out: 'fields-vertical.jpg', src: 'd3aa46a0-aa8d-438c-855a-76e8cc5777e0.jpg' },
  { out: 'green-glass.jpg', src: 'f7a312a5-5ce7-4258-ad72-439b44930927.jpg', crop: [0.222, 0.114, 0.75, 0.902] },
];

mkdirSync(OUT, { recursive: true });

for (const { out, src, crop, turn } of sources) {
  let img = sharp(src).rotate();
  const { width, height } = await img.metadata();
  if (crop) {
    const [l, t, r, b] = crop;
    img = img.extract({
      left: Math.round(l * width),
      top: Math.round(t * height),
      width: Math.round((r - l) * width),
      height: Math.round((b - t) * height),
    });
  }
  // sharp applies one rotate per pipeline, so turning happens in a second pass
  if (turn) img = sharp(await img.toBuffer()).rotate(turn);
  const info = await img
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(`${OUT}/${out}`);
  console.log(out, info.width, info.height);
}

// Link-preview image (shown when the URL is shared in a chat app)
const OG_W = 1200;
const OG_H = 630;
const picks = ['portrait-orange.jpg', 'red-blue-canyon.jpg', 'fields.jpg', 'blue-house.jpg'];
const tileH = 400;
const tiles = await Promise.all(
  picks.map((f) => sharp(`${OUT}/${f}`).resize({ height: tileH }).toBuffer({ resolveWithObject: true })),
);
const gap = 36;
const rowW = tiles.reduce((s, t) => s + t.info.width, 0) + gap * (tiles.length - 1);
let x = Math.round((OG_W - rowW) / 2);
const composites = tiles.map((t) => {
  const c = { input: t.data, left: x, top: Math.round((OG_H - tileH) / 2) };
  x += t.info.width + gap;
  return c;
});
await sharp({ create: { width: OG_W, height: OG_H, channels: 3, background: '#1b1814' } })
  .composite(composites)
  .jpeg({ quality: 85, mozjpeg: true })
  .toFile('public/og.jpg');
console.log('og.jpg', OG_W, OG_H);
