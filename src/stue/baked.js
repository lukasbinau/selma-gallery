// The room's procedural textures, baked to image files so the visitor's browser
// decodes them (off the main thread) instead of drawing them pixel by pixel:
// the oak floor alone took over 3 s to draw on a fast laptop, each wallpaper
// 1.4 s. scripts/bake-textures.mjs runs every RECIPE in a headless browser and
// writes public/stue-tex/<key>.<part>.webp; re-run it after changing a texture.
//
//   await loadBaked(keys)   fetch + decode the files (missing files are skipped)
//   make(key)               the baked canvases if loaded, else drawn as before
import { oakFloor, oakGrain, fabric, wool, plaster } from './textures.js';
import { WALLS, wallpaperCanvases } from './wallpapers.js';
// Which parts each key has on disk, written by the bake script
import manifest from './baked.json';

// key → () => canvas | { part: canvas, … }
export const RECIPES = {
  'floor-1024': () => oakFloor(1024),
  'floor-512': () => oakFloor(512),
  oak: () => oakGrain(512),
  'oak-dark': () => oakGrain(512, { light: [150, 112, 80], dark: [92, 64, 44], seed: 4 }),
  boucle: () => fabric(256, { boucle: true }),
  linen: () => fabric(256, { boucle: false, seed: 9 }),
  wool: () => wool(256),
  plaster: () => plaster(256),
  weave: () => fabric(128, { seed: 3 }),
};
for (const wall of WALLS.filter((w) => w.kind === 'paper')) {
  for (const px of [512, 1024]) RECIPES[wallKey(wall, px)] = () => wallpaperCanvases(wall, px);
}

export function wallKey(wall, px) {
  return `wall-${wall.id}-${px}`;
}
// What the room needs before it can draw its first picture
export const startKeys = (px) => [`floor-${px}`, 'oak', 'oak-dark', 'boucle', 'linen', 'wool', 'plaster', 'weave'];

const isCanvas = (v) => typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement;
/** The parts of a recipe's result that are images: '' for a lone canvas. */
export function partsOf(result) {
  if (isCanvas(result)) return { '': result };
  return Object.fromEntries(Object.entries(result).filter(([, v]) => isCanvas(v)));
}

const BASE = `${import.meta.env.BASE_URL}stue-tex/`;
const cache = new Map(); // key → { part: canvas }
const loading = new Map(); // key → Promise

async function decode(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob());
  // Back on a canvas, so the textures behave exactly like the drawn ones
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  c.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return c;
}

export function loadBaked(keys) {
  return Promise.all(
    keys.map((key) => {
      if (cache.has(key) || !manifest[key]) return null;
      if (!loading.has(key)) {
        const p = Promise.all(manifest[key].map(async (part) => [part, await decode(`${BASE}${key}${part ? `.${part}` : ''}.webp`)]))
          .then((parts) => cache.set(key, Object.fromEntries(parts)))
          .catch((err) => console.warn('stue: baked texture missing, drawing it instead', key, err));
        loading.set(key, p);
      }
      return loading.get(key);
    }),
  );
}

export function make(key) {
  const parts = cache.get(key);
  if (!parts) return RECIPES[key]();
  return '' in parts ? parts[''] : { ...parts };
}
