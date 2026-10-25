// Pre-made textures for the room. Everything the room draws pixel by pixel
// (floorboards, oak grain, fabrics, plaster, lawn, hedge, birch bark, the
// wallpapers and their swatches) is drawn once at build time by this same
// code, in a headless browser, and saved as small files in public/stue/
// (npm run stue-textures → scripts/stue-textures.mjs; run it again after
// changing textures.js or wallpapers.js). At runtime the files are fetched
// and decoded off the main thread; if one fails, its texture is drawn here
// instead, so the room looks the same either way. Cheap drawings (leaf
// sprites, lantern paper, fluting, the tree line) are still made at runtime.
import { oakFloor, oakGrain, fabric, wool, plaster, lawn, birchBark, paintedGrain, hedge } from './textures.js';
import { WALLS, wallpaperCanvases, wallpaperSwatchCanvas } from './wallpapers.js';
import { BITMAP_OPTIONS, bitmapsWork } from '../art-texture.js';
import { artFormat } from '../art-format.js';
import manifest from './texture-files.json';

const BASE = import.meta.env.BASE_URL;
export const SWATCH_PX = 128;

// stem → { parts, draw() → { part: canvas } }. The part 'map' is colour
// (sRGB); 'rough' and 'normal' are data.
const MRN = ['map', 'rough', 'normal'];
const MN = ['map', 'normal'];
export const RECIPES = {
  'floor-1024': { parts: MRN, draw: () => oakFloor(1024) },
  'floor-512': { parts: MRN, draw: () => oakFloor(512) },
  oak: { parts: ['map'], draw: () => ({ map: oakGrain(512) }) },
  'oak-dark': { parts: ['map'], draw: () => ({ map: oakGrain(512, { light: [150, 112, 80], dark: [92, 64, 44], seed: 4 }) }) },
  boucle: { parts: MN, draw: () => fabric(256, { boucle: true }) },
  linen: { parts: MN, draw: () => fabric(256, { boucle: false, seed: 9 }) },
  weave: { parts: ['normal'], draw: () => ({ normal: fabric(128, { seed: 3 }).normal }) },
  wool: { parts: MN, draw: () => wool(256) },
  plaster: { parts: MN, draw: () => plaster(256) },
  'painted-grain': { parts: ['map'], draw: () => ({ map: paintedGrain(256, 128) }) },
  lawn: { parts: ['map'], draw: () => ({ map: lawn(512) }) },
  deck: { parts: MN, draw: () => oakFloor(512, { tone: [128, 110, 92], seed: 9 }) },
  hedge: { parts: MN, draw: () => hedge(256) },
  'birch-bark': { parts: ['map'], draw: () => ({ map: birchBark(256) }) },
};
const PAPERS = WALLS.filter((w) => w.kind === 'paper');
for (const w of PAPERS) {
  for (const px of [1024, 512]) RECIPES[`wp-${w.id}-${px}`] = { parts: MRN, draw: () => wallpaperCanvases(w, px) };
}
// Swatches for the Væg rail: shown as CSS backgrounds, never as textures
export const SWATCHES = Object.fromEntries(PAPERS.map((w) => [`swatch-${w.id}`, () => wallpaperSwatchCanvas(w, SWATCH_PX)]));

export const fileUrl = (stem, part, ext) => `${BASE}stue/${stem}${part ? `-${part}` : ''}.${ext}`;
/** The swatch file of a wallpaper (WebP: a CSS background has no format fallback). */
export const swatchUrl = (wall) => fileUrl(`swatch-${wall.id}`, '', 'webp');

// Every texture has a WebP; those listed in texture-files.json also an AVIF,
// where it is the smaller file. A browser takes AVIF where it decodes it
// (art-format.js), else WebP; none if createImageBitmap ignores its options
// (then the textures are drawn: canvases upload the right way up anyway).
const AVIF = new Set(manifest.avif);
let formats = null;
function canFetch() {
  return (formats ??= Promise.all([artFormat(), bitmapsWork()]).then(([f, ok]) => (ok && f !== 'jpg' ? f : null)));
}
const extFor = (name, fmt) => (fmt === 'avif' && AVIF.has(name) ? 'avif' : 'webp');

async function fetchBitmap(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return createImageBitmap(await res.blob(), BITMAP_OPTIONS);
}

const cache = new Map();
/**
 * The images of one texture, { part: ImageBitmap | canvas }: the decoded
 * files, or (if any of them fails) the canvases drawn here. Never rejects.
 * Asking again for the same stem returns the same promise (a prefetch on
 * hover and the click that follows share one download).
 */
export function loadSources(stem) {
  if (!cache.has(stem)) cache.set(stem, load(stem));
  return cache.get(stem);
}
async function load(stem) {
  const r = RECIPES[stem];
  const fmt = await canFetch();
  if (fmt) {
    const got = await Promise.allSettled(r.parts.map((p) => fetchBitmap(fileUrl(stem, p, extFor(`${stem}-${p}`, fmt)))));
    if (got.every((g) => g.status === 'fulfilled')) return Object.fromEntries(r.parts.map((p, i) => [p, got[i].value]));
    got.forEach((g) => g.value?.close());
    console.warn(`stue: ${stem} tegnes i stedet for at hentes`, got.find((g) => g.status === 'rejected')?.reason);
  }
  return r.draw();
}
