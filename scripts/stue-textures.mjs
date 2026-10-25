// Draws the room's procedural textures once, into files. Run: npm run stue-textures
//
//   public/stue/<stem>-<part>.{avif,webp}   every texture in src/stue/texture-files.js
//   public/stue/swatch-<wall>.webp          the wallpaper swatches of the Væg rail
//   src/stue/texture-files.json             which format to fetch each texture in
//   src/stue/palettes.json                  each work's furnishing colours and canvas edge
//
// The textures are drawn by the room's own code (src/stue/textures.js and
// wallpapers.js), in headless Chromium through Playwright, against the Vite
// dev server; sharp compresses them. Run it again after changing the
// drawing code: the room draws a texture itself only when its file fails.
// The room takes the colours of its cushions, vase and books from the
// painting (palette.js). They are sampled here, from the 1024 px JPEG as an
// <img>, so they do not shift with the format or decoder a browser uses; a
// work missing from palettes.json is sampled at runtime. Run it again after
// adding a work (after npm run images).
//   --png <dir>    also keep the lossless drawings (to compare encodings)
//   --palettes     only the palettes
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'public/stue';
const MANIFEST = 'src/stue/texture-files.json';
const PALETTES = 'src/stue/palettes.json';
const onlyPalettes = process.argv.includes('--palettes');
const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null;

// Encoder settings. Every file is the smallest of a ladder of encodings that
// stays within TARGET (PSNR against the drawing, dB). Colour maps keep full
// colour resolution (4:4:4 AVIF, sharp YUV for WebP): the wallpapers' fine
// lines go soft at 4:2:0. Normal maps are data, x/y in red and green, and
// the fabrics' weaves are only 2–3 px wide: lossy WebP smears them, WebP's
// near-lossless mode keeps them (and is small for a regular weave), AVIF at
// 4:4:4 handles the noisy ones best. Roughness is smooth. The targets were
// checked on renders of the room against the drawn textures.
//
// Every texture has a WebP (any browser that takes WebP); an AVIF is kept
// only where it is smaller, and the manifest tells AVIF browsers which to
// fetch (for a fine weave near-lossless WebP beats AVIF by far).
const TARGET = { map: 40, normal: 34, rough: 38, swatch: 40 };
// Each ladder climbs in quality, so in size: the first rung within the target wins
const LADDERS = {
  avif: [[50, 58, 64, 70, 76, 82, 88, 92].map((quality) => ['avif', { quality, chromaSubsampling: '4:4:4', effort: 6 }])],
  webp: [
    [70, 80, 90].map((quality) => ['webp', { quality, smartSubsample: true, effort: 6 }]),
    [40, 60, 80].map((quality) => ['webp', { nearLossless: true, quality, effort: 6 }]),
  ],
};
const FORMATS = { map: ['webp', 'avif'], normal: ['webp', 'avif'], rough: ['webp', 'avif'], swatch: ['webp'] };

function psnr(a, b) {
  let se = 0;
  for (let i = 0; i < a.length; i++) se += (a[i] - b[i]) ** 2;
  return se ? 10 * Math.log10((255 * 255 * a.length) / se) : 99;
}

// The smallest encoding within the target, else the closest one
async function encode(img, ref, fmt, target) {
  let best = null;
  for (const ladder of LADDERS[fmt]) {
    for (const [f, opts] of ladder) {
      const buf = await img.clone()[f](opts).toBuffer();
      const q = psnr(ref, await sharp(buf).removeAlpha().raw().toBuffer());
      const ok = q >= target;
      const better = !best || (ok ? !best.ok || buf.length < best.buf.length : !best.ok && q > best.q);
      if (better) best = { buf, q, ok, opts };
      if (ok) break;
    }
  }
  return best;
}

const server = await createServer({ logLevel: 'error', server: { port: 5390, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
let total = 0;
const avif = {}; // name → true where AVIF browsers fetch the AVIF
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page:', e.message));
  // any page of the dev server will do: the drawing code is imported below
  await page.goto(`${base}src/stue/texture-files.js`);
  const palettes = await page.evaluate(async () => {
    const { samplePalette, edgeColour } = await import('/src/stue/palette.js');
    const { default: data } = await import('/src/vaerker.json');
    const out = {};
    for (const { id } of data.vaerker) {
      const img = new Image();
      img.src = `/art/${id}-1024.jpg`;
      await img.decode();
      out[id] = { palette: samplePalette(img), edge: edgeColour(img) };
    }
    return out;
  });
  writeFileSync(PALETTES, `${JSON.stringify(palettes, null, 2)}\n`);
  console.log(`${Object.keys(palettes).length} palettes in ${PALETTES}`);
  const stems = onlyPalettes ? [] : await page.evaluate(async () => {
    const m = await import('/src/stue/texture-files.js');
    return [...Object.keys(m.RECIPES), ...Object.keys(m.SWATCHES)];
  });
  mkdirSync(OUT, { recursive: true });
  if (pngDir) mkdirSync(pngDir, { recursive: true });
  for (const stem of stems) {
    // one texture at a time: the big drawings take a few seconds each
    const parts = await page.evaluate(async (stem) => {
      const m = await import('/src/stue/texture-files.js');
      const swatch = m.SWATCHES[stem];
      const r = m.RECIPES[stem];
      const drawn = swatch ? { swatch: swatch() } : r.draw();
      const keep = swatch ? ['swatch'] : r.parts;
      return keep.map((p) => [p, drawn[p].toDataURL('image/png')]);
    }, stem);
    for (const [part, url] of parts) {
      const png = Buffer.from(url.split(',')[1], 'base64');
      const name = part === 'swatch' ? stem : `${stem}-${part}`;
      if (pngDir) writeFileSync(join(pngDir, `${name}.png`), png);
      const img = sharp(png).removeAlpha();
      const ref = await img.clone().raw().toBuffer();
      const sizes = [];
      const got = {};
      for (const fmt of FORMATS[part]) {
        const { buf, q, opts } = await encode(img, ref, fmt, TARGET[part]);
        got[fmt] = buf;
        const how = opts.nearLossless ? `nl${opts.quality}` : `q${opts.quality}`;
        sizes.push(`${fmt} ${(buf.length / 1024).toFixed(1).padStart(5)} KB ${how.padEnd(4)} ${q.toFixed(1)} dB`);
      }
      rmSync(join(OUT, `${name}.avif`), { force: true });
      for (const [fmt, buf] of Object.entries(got)) {
        if (fmt === 'avif' && buf.length >= got.webp.length) continue;
        if (fmt === 'avif') avif[name] = true;
        writeFileSync(join(OUT, `${name}.${fmt}`), buf);
        total += buf.length / 1024;
      }
      console.log(name.padEnd(30), sizes.join('   '), avif[name] ? '' : '(webp for all)');
    }
  }
  if (!onlyPalettes) writeFileSync(MANIFEST, `${JSON.stringify({ avif: Object.keys(avif).sort() }, null, 2)}\n`);
  if (!onlyPalettes) console.log(`total ${(total / 1024).toFixed(2)} MB in ${OUT}/, ${MANIFEST}`);
} finally {
  await browser.close();
  await server.close();
}
