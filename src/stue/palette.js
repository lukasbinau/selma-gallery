// Accent colours sampled from the painting, for the room's soft furnishings
// (cushions, throw, vase, book spines). Colours are bucketed by hue, weighted
// by how much of the picture they cover and how saturated they are, then
// softened into tones a stylist would pick: never neon, never muddy.
import * as THREE from 'three';

const DEFAULT = ['#c98f6b', '#7f8f74', '#d8c6a5', '#5b6a7d'];

export function samplePalette(img) {
  try {
    const S = 48;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data;
    const buckets = new Map();
    const col = new THREE.Color();
    const hsl = {};
    for (let i = 0; i < d.length; i += 4) {
      col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
      col.getHSL(hsl, THREE.SRGBColorSpace);
      if (hsl.l < 0.12 || hsl.l > 0.92) continue;
      const key = hsl.s < 0.15 ? 'n' : String(Math.round(hsl.h * 12) % 12);
      const b = buckets.get(key) || { w: 0, h: 0, s: 0, l: 0, n: 0, hx: 0, hy: 0 };
      const w = 0.3 + hsl.s;
      b.w += w;
      b.hx += Math.cos(hsl.h * Math.PI * 2) * w;
      b.hy += Math.sin(hsl.h * Math.PI * 2) * w;
      b.s += hsl.s * w;
      b.l += hsl.l * w;
      b.n += w;
      buckets.set(key, b);
    }
    const ranked = [...buckets.entries()]
      .filter(([k]) => k !== 'n')
      .map(([, b]) => {
        let h = Math.atan2(b.hy, b.hx) / (Math.PI * 2);
        if (h < 0) h += 1;
        return { w: b.w, h, s: b.s / b.n, l: b.l / b.n };
      })
      .sort((a, b) => b.w - a.w);
    if (!ranked.length) return DEFAULT.slice();
    const out = [];
    for (const r of ranked) {
      if (out.length >= 3) break;
      if (out.some((o) => Math.min(Math.abs(o.h - r.h), 1 - Math.abs(o.h - r.h)) < 0.07)) continue;
      out.push(r);
    }
    const tones = out.map(({ h, s, l }, i) => {
      // textiles: muted and mid-light; the third pick goes deeper for contrast
      const ss = Math.min(0.55, s * 0.75);
      const ll = i === 2 ? Math.min(0.42, Math.max(0.28, l * 0.7)) : Math.min(0.68, Math.max(0.42, l));
      return '#' + new THREE.Color().setHSL(h, ss, ll, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
    });
    while (tones.length < 4) tones.push(DEFAULT[tones.length]);
    return tones;
  } catch {
    return DEFAULT.slice();
  }
}
