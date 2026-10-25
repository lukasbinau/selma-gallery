// Painting photos as WebGL textures, shared by the gallery and "I din stue".
//
// The files come in the best format the browser decodes (art-format.js) and
// are decoded off the main thread: fetch → createImageBitmap, already flipped
// for WebGL. A browser whose createImageBitmap ignores its options (older
// Safari) gets THREE.TextureLoader and <img> decoding instead. Every texture
// carries a blurred mipmap chain (softMipmaps) and its URL (userData.url, for
// a ghost that flies off the wall).
//
//   const art = createArtLoader({ anisotropy: 8, name: 'stue' });
//   const tex = await art.load('markvej', 1024, signal);
//   freeTexture(tex);   // GPU copy and every bitmap
import * as THREE from 'three';
import { artFormat, artUrl } from './art-format.js';

// Whether the options work is checked once: a 1 × 2 image, red above blue,
// must come out blue on top.
export const BITMAP_OPTIONS = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
export const isBitmap = (x) => typeof ImageBitmap !== 'undefined' && x instanceof ImageBitmap;
let bitmapCheck = null;
export function bitmapsWork() {
  return (bitmapCheck ??= (async () => {
    if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return false;
    try {
      const pixels = new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 1, 2);
      const bitmap = await createImageBitmap(pixels, BITMAP_OPTIONS);
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 2;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const [r, , b] = ctx.getImageData(0, 0, 1, 1).data;
      return b > 128 && r < 128;
    } catch {
      return false;
    }
  })());
}

// GPU memory and the decoded pixels both go: dispose() frees the GPU copy,
// close() the bitmaps (the base image and every mipmap level)
export function freeTexture(tex) {
  if (!tex) return;
  tex.dispose();
  for (const level of new Set([tex.image, ...(tex.mipmaps || [])])) level?.close?.();
  tex.mipmaps = [];
}

// The GPU builds mipmaps by plain 2 × 2 averaging. A painting with a fine,
// regular texture (Lilla skyer's coarse weave board) then turns into bands
// of moiré as soon as it is seen from a step back, while leaning in (level 0)
// stays sharp. Build the chain here instead, with a slight blur before each
// halving, which keeps the weave from folding into stripes. Browsers without
// canvas filters (Safari) get the same plain halving the GPU would do. It
// runs as a texture arrives, so the frame that swaps it in only uploads.
const canBlur = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
export async function softMipmaps(tex) {
  const image = tex.image;
  if (!image?.width || tex.mipmaps?.length) return;
  const levels = [image];
  let src = image;
  let w = image.width;
  let h = image.height;
  while (w > 1 || h > 1) {
    let from = src;
    if (canBlur && Math.min(w, h) > 4) {
      const blur = document.createElement('canvas');
      blur.width = w;
      blur.height = h;
      const b = blur.getContext('2d');
      b.filter = 'blur(0.8px)';
      b.drawImage(src, 0, 0, w, h);
      from = blur;
    }
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, w, h);
    if (from !== src && from !== image) from.width = from.height = 0;
    levels.push(c);
    src = c;
  }
  // three sets the unpack flags (flipY…) only when the base image is not a
  // bitmap, so a bitmap texture needs bitmap levels too, or they would land
  // upside down. The levels were drawn from the flipped bitmap: no flip.
  if (isBitmap(image)) {
    const canvases = levels.slice(1);
    const made = await Promise.allSettled(canvases.map((c) => createImageBitmap(c)));
    canvases.forEach((c) => (c.width = c.height = 0));
    const failed = made.find((r) => r.status === 'rejected');
    if (failed) {
      made.forEach((r) => r.value?.close());
      throw failed.reason;
    }
    levels.splice(1, Infinity, ...made.map((r) => r.value));
  }
  tex.mipmaps = levels;
  tex.generateMipmaps = false;
}

/**
 * A loader for one view. `load(id, size, signal)` resolves to a texture of
 * the photo <id>-<size> (640 | 1024 | 2048) in the best format; a file that
 * fetched fine but would not decode switches this loader to JPEG for good.
 * Errors carry `unusable: true` when the file itself is the problem.
 */
export function createArtLoader({ anisotropy = 1, name = 'galleri' } = {}) {
  const texLoader = new THREE.TextureLoader();
  let format = 'jpg';
  let bitmaps = false;
  let ready = null;
  const setup = () =>
    (ready ??= Promise.all([artFormat(), bitmapsWork()]).then(([f, b]) => {
      format = f;
      bitmaps = b;
    }));

  async function loadUrl(url, signal) {
    await setup();
    let tex;
    if (bitmaps) {
      const res = await fetch(url, { signal, credentials: 'same-origin' });
      if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { unusable: res.status === 404 });
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob, BITMAP_OPTIONS).catch((err) => {
        throw Object.assign(err, { unusable: true }); // fetched fine, but would not decode
      });
      tex = new THREE.Texture(bitmap);
      tex.flipY = false; // flipped while decoding: WebGL ignores UNPACK_FLIP_Y for bitmaps
    } else {
      // an <img> error does not say why: treat it as a file this browser cannot use
      tex = await texLoader.loadAsync(url).catch((err) => {
        throw Object.assign(new Error(`${url} kunne ikke indlæses`), { cause: err, unusable: true });
      });
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.userData.url = url;
    try {
      await softMipmaps(tex);
    } catch (err) {
      freeTexture(tex);
      throw err;
    }
    tex.needsUpdate = true;
    return tex;
  }

  async function load(id, size, signal) {
    await setup();
    try {
      return await loadUrl(artUrl(id, size, format), signal);
    } catch (err) {
      if (!err?.unusable || format === 'jpg') throw err; // a network hiccup is not the format's fault
      console.warn(`${name}: ${format} virker ikke her, skifter til jpg`, err);
      format = 'jpg';
      return loadUrl(artUrl(id, size, 'jpg'), signal);
    }
  }

  return {
    setup,
    load,
    loadUrl,
    /** The format files are fetched in now ('avif' | 'webp' | 'jpg'). */
    get format() {
      return format;
    },
    /** Whether textures are ImageBitmaps (decoded off the main thread). */
    get bitmaps() {
      return bitmaps;
    },
  };
}
