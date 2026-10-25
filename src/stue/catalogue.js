// Physical sizes and frame offers. Pure functions, no three.js: what size a work
// really is (from the `maal` text in vaerker.json), what it is painted on, and
// which frames from frames.json come in a size that fits it.
import catalogue from './frames.json';
import { hasPris, formatPris } from '../pris.js';

// ISO A sizes, portrait (cm)
const A_SIZES = { 0: [84.1, 118.9], 1: [59.4, 84.1], 2: [42, 59.4], 3: [29.7, 42], 4: [21, 29.7], 5: [14.8, 21], 6: [10.5, 14.8] };

const num = (s) => parseFloat(String(s).replace(',', '.'));

/**
 * "50 × 70 cm", "A4 (21 × 29,7 cm)", "21x29.7", "350 x 500 mm", "A3" → { w, h } in cm
 * (width × height, as written), or null when the text has no usable size.
 */
export function parseMaal(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ');
  const m = /(\d+(?:[.,]\d+)?)\s*(?:cm|mm)?\s*[×xX*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/.exec(t);
  if (m) {
    const k = m[3] === 'mm' ? 0.1 : m[3] === 'm' ? 100 : 1;
    const w = num(m[1]) * k;
    const h = num(m[2]) * k;
    if (w > 0 && h > 0) return { w, h };
  }
  const a = /\bA([0-6])\b/i.exec(t);
  if (a) {
    const [w, h] = A_SIZES[a[1]];
    return { w, h };
  }
  return null;
}

// paper | canvas | board, from the frame style and the technique text
export function mediumOf(work) {
  const t = `${work?.teknik || ''} ${work?.om || ''}`.toLowerCase();
  if (/papir|akvarel|tegning/.test(t) || work?.ramme === 'mat') return 'paper';
  if (/lærred/.test(t)) return 'canvas';
  if (/plade|træ|masonit/.test(t) || work?.ramme === 'float') return 'board';
  return 'canvas';
}

// Works without dimensions get a plausible size from what they are painted on
const DEFAULT_LONG_SIDE = { paper: 42, canvas: 60, board: 60 };

/**
 * The work's physical size in cm. The photo decides the orientation (and the
 * aspect when no size is given); `estimated` marks a guessed size.
 */
export function workSize(work, meta) {
  const photoAspect = meta && meta.w > 0 && meta.h > 0 ? meta.w / meta.h : 0.8;
  const parsed = parseMaal(work?.maal);
  if (parsed) {
    let { w, h } = parsed;
    // Trust the photo for which side is the long one
    if ((w > h) !== (photoAspect > 1) && Math.abs(w - h) > 0.5) [w, h] = [h, w];
    return { w, h, estimated: false };
  }
  const long = DEFAULT_LONG_SIDE[mediumOf(work)];
  return photoAspect >= 1
    ? { w: long, h: long / photoAspect, estimated: true }
    : { w: long * photoAspect, h: long, estimated: true };
}

// ------------------------------------------------------------------ frames
export const FRAMES = (catalogue.frames || []).filter((f) => f && f.id);
export const NONE = FRAMES.find((f) => f.none) || { id: 'ingen', name: 'Ingen ramme', none: true };

const EXACT = 1.6; // cm of slack a frame without passepartout may have
const MAT_MIN = 3.5; // a passepartout shows at least this much on each side (cm)…
const MAT_MAX = 15; // …and at most this much

/**
 * The frames that come in a size fitting `work`, each resolved to one size:
 *   { frame, size, price, mat: null | { w, h } (opening of the passepartout, cm),
 *     inner: { w, h } (frame opening, cm), label }
 * "Ingen ramme" is always first. `frame.passepartout` means the frame is sold
 * with a white passepartout: it then only fits paper smaller than its opening. Works whose photo already shows the artist's
 * own frame only get "Ingen ramme".
 */
export function offersFor(work, meta) {
  const size = workSize(work, meta);
  const medium = mediumOf(work);
  const offers = [{ frame: NONE, size: null, price: 0, mat: null, inner: null, label: NONE.name }];
  if (/egen ramme/i.test(work?.teknik || '')) return offers;

  for (const frame of FRAMES) {
    if (frame.none) continue;
    const style = frame.style || 'plakat';
    // Floater frames are for canvas and board only; other frames take any work of the right size
    if (style === 'svaever' && medium === 'paper') continue;
    const pick = bestSize(frame, size, medium, style);
    if (pick) offers.push({ frame, ...pick, label: frame.name });
  }
  return offers;
}

function bestSize(frame, size, medium, style) {
  const landscape = size.w > size.h;
  let best = null;
  for (const s of frame.sizes || []) {
    if (!s || s.available === false || !(s.innerWcm > 0) || !(s.innerHcm > 0)) continue;
    // Frames turn: match the work's orientation
    const a = Math.min(s.innerWcm, s.innerHcm);
    const b = Math.max(s.innerWcm, s.innerHcm);
    const inner = landscape ? { w: b, h: a } : { w: a, h: b };
    const dw = inner.w - size.w;
    const dh = inner.h - size.h;
    let fit = null;
    // A frame sold with a passepartout only takes paper with a border around it
    if (!frame.passepartout && dw >= -0.6 && dh >= -0.6 && dw <= EXACT && dh <= EXACT) {
      fit = { mat: null, score: dw + dh };
    } else if (
      style === 'plakat' &&
      frame.passepartout &&
      medium === 'paper' &&
      dw >= MAT_MIN * 2 &&
      dh >= MAT_MIN * 2 &&
      dw <= MAT_MAX * 2 &&
      dh <= MAT_MAX * 2 &&
      Math.max(dw, dh) / Math.min(dw, dh) <= 2 // no lopsided borders
    ) {
      // The passepartout's window overlaps the paper by 3 mm on every side
      fit = { mat: { w: size.w - 0.6, h: size.h - 0.6 }, score: 100 + dw + dh };
    }
    if (fit && (!best || fit.score < best.score)) best = { ...fit, inner, price: Number(s.priceDkk) || 0, size: s };
  }
  if (!best) return null;
  return { size: best.size, inner: best.inner, mat: best.mat, price: best.price };
}

// ------------------------------------------------------------------ money
export const formatKr = formatPris;
export const priceOf = (work) => (hasPris(work?.pris) ? Math.round(Number(work.pris)) : null);
export const sizeLabel = (s) => `${fmtCm(s.w)} × ${fmtCm(s.h)} cm`;
const fmtCm = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
