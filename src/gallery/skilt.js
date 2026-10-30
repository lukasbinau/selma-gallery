// Plaque colours. Every plaque is one flat colour from the front page's
// palette ("bund") with lettering in a colour taken from its own painting
// ("tekst"), both set per work in vaerker.json as "skilt". Its two keys,
// KØB & KONTAKT and I DIN STUE, take two different palette colours that stand
// out against that bund.

// The front page's palette (src/front.css), plus a pale pink and a blue
export const PALETTE = {
  pink: '#f767d3',
  lyseroed: '#ffd6f0', // the pale pink of the bio's outline
  violet: '#5e17eb',
  gul: '#fcd23b',
  roed: '#ff2234',
  blaa: '#2448e8',
};
const INK_DARK = '#1a0650'; // labels on the light keys: the room's deep violet, a shade darker

// A work without "skilt" (or with a broken one): pale pink with violet letters
const FALLBACK = { bund: PALETTE.lyseroed, tekst: PALETTE.violet };
// Works that may arrive before their "skilt" is filled in
const KNOWN = {
  fuglene: { bund: PALETTE.lyseroed, tekst: '#123590' }, // the birds' blue
};

// The keys, in the order they are tried; blue and violet count as one family,
// so a plaque never gets those two side by side when anything else stands out.
const KEYS = [
  { colour: PALETTE.violet, family: 'cool' },
  { colour: PALETTE.blaa, family: 'cool' },
  { colour: PALETTE.gul, family: 'warm-light' },
  { colour: PALETTE.pink, family: 'warm-pink' },
  { colour: PALETTE.roed, family: 'warm-red' },
];

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function mix(hex, target, t) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const d = [1, 3, 5].map((i) => parseInt(target.slice(i, i + 2), 16));
  return '#' + c.map((v, i) => Math.round(v + (d[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// Small text wants 4.5:1. If a chosen colour falls short, it is walked towards
// black or white (whichever the bund is further from) until it reads.
function readable(tekst, bund) {
  if (contrast(tekst, bund) >= 4.5) return tekst;
  const to = luminance(bund) > 0.18 ? '#000000' : '#ffffff';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(tekst, to, t);
    if (contrast(c, bund) >= 4.5) return c;
  }
  return to;
}

function inkOn(colour) {
  return contrast(colour, '#ffffff') >= contrast(colour, INK_DARK) ? '#ffffff' : INK_DARK;
}

// Two different key colours for this bund: the one that stands out most, then
// the best of another family that still stands out (2.4:1), else the next best.
function keysFor(bund) {
  const ranked = KEYS.filter((k) => k.colour.toLowerCase() !== bund.toLowerCase())
    .map((k) => ({ ...k, c: contrast(k.colour, bund) }))
    .sort((a, b) => b.c - a.c);
  const first = ranked[0];
  const second = ranked.find((k) => k !== first && k.family !== first.family && k.c >= 2.4) ?? ranked[1];
  return [first, second].map((k) => ({ bg: k.colour, ink: inkOn(k.colour) }));
}

// { bund, tekst, keys: [{ bg, ink }, { bg, ink }] } for one work
export function skiltFor(work) {
  const given = work?.skilt ?? KNOWN[work?.id] ?? FALLBACK;
  const bund = HEX.test(given?.bund ?? '') ? given.bund : FALLBACK.bund;
  const tekst = readable(HEX.test(given?.tekst ?? '') ? given.tekst : FALLBACK.tekst, bund);
  return { bund, tekst, keys: keysFor(bund) };
}
