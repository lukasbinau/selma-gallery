// Which photo format to fetch for textures and flying ghosts. Every work is in
// public/art as <id>-<size>.{avif,webp,jpg} (npm run images); the front page's
// <picture> elements let the browser choose, but code that fetches a URL
// itself (the gallery's textures) asks here. The choice is made once per
// session by decoding a tiny inline image of each kind: AVIF, then WebP, then
// JPEG, which every browser reads.
const PROBES = {
  avif: 'data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAACIAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAqbWRhdBIACgc4ADaQENBpMhUZQmMEwAA0AACQQMkcYUjpfnBMqfE=',
  webp: 'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoCAAIAAsBMJaACdAFAAAD+7L2IwmknR/89M/9gf/JHwsAA',
};
const FORMATS = ['avif', 'webp', 'jpg'];
const KEY = 'selma:art-format';
const BASE = import.meta.env.BASE_URL;

let known = null; // the answer, once there is one
let pending = null;

function decodes(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 2000);
    img.onload = () => done(img.naturalWidth === 2);
    img.onerror = () => done(false);
    img.src = src;
  });
}

/** Resolves to 'avif', 'webp' or 'jpg'. Cheap after the first call. */
export function artFormat() {
  if (known) return Promise.resolve(known);
  return (pending ??= (async () => {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (FORMATS.includes(saved)) return (known = saved);
    } catch {
      // storage blocked: just test again
    }
    let fmt = 'jpg';
    for (const f of ['avif', 'webp']) {
      if (await decodes(PROBES[f])) {
        fmt = f;
        break;
      }
    }
    try {
      sessionStorage.setItem(KEY, fmt);
    } catch {
      // fine
    }
    return (known = fmt);
  })());
}

/** The format if it is already known (else JPEG, which always works). */
export const knownArtFormat = () => known || 'jpg';

/** URL of one work's photo: size 640 | 1024 | 2048. */
export const artUrl = (id, size, fmt = knownArtFormat()) => `${BASE}art/${id}-${size}.${fmt}`;
