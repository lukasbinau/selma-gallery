// Lifts the outlined display type (SELMA, KUNST, ORIGINALE VÆRKER, PROCESSEN)
// out of Selma's Canva SVG export as small standalone SVGs with
// fill="currentColor", so the words stay pixel-true to her design.
//
//   node scripts/extract-wordmarks.mjs <path-to-Selma.svg> [--list]
//
// --list prints every cluster of same-coloured paths with its bounding box, so
// the WORDS table below can be adjusted after a new export.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [, , file, flag] = process.argv;
if (!file) throw new Error('usage: node scripts/extract-wordmarks.mjs Selma.svg [--list]');
const svg = readFileSync(file, 'utf8');

// Which cluster is which word: colour + the y-range it occupies on the 1024.5 × 4608 canvas
const WORDS = [
  { name: 'selma', fill: '#f767d3', y: [30, 200] },
  { name: 'kunst', fill: '#fcd23b', y: [560, 740] },
  { name: 'originale-vaerker', fill: '#fcd23b', y: [1180, 1300] },
  { name: 'processen', fill: '#5e17eb', y: [3570, 3650] },
];

// Walk every tag in order, keeping a stack of group translations
const tagRe = /<(g|path)\b([^>]*?)(\/?)>|<\/g>/g;
const stack = [];
const paths = [];
let m;
while ((m = tagRe.exec(svg))) {
  if (m[0] === '</g>') {
    stack.pop();
    continue;
  }
  const [, tag, attrs, selfClose] = m;
  if (tag === 'g') {
    const t = /transform="translate\(([-\d.]+),?\s*([-\d.]+)\)"/.exec(attrs);
    const off = t ? [+t[1], +t[2]] : [0, 0];
    // Canva puts the colour on a <g> around each glyph, not on the <path>
    const parent = stack[stack.length - 1] || { off: [0, 0], fill: null };
    const gfill = /fill="(#[0-9a-f]{6})"/i.exec(attrs)?.[1]?.toLowerCase();
    const abs = { off: [parent.off[0] + off[0], parent.off[1] + off[1]], fill: gfill || parent.fill };
    if (selfClose) continue;
    stack.push(abs);
    continue;
  }
  const top = stack[stack.length - 1] || { off: [0, 0], fill: null };
  const fill = (/fill="(#[0-9a-f]{6})"/i.exec(attrs)?.[1] || top.fill || '').toLowerCase();
  const d = /\sd="([^"]+)"/.exec(attrs)?.[1];
  if (!fill || !d) continue;
  const off = top.off;
  const nums = d.match(/-?\d+\.?\d*/g).map(Number);
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i] + off[0];
    const y = nums[i + 1] + off[1];
    if (x < minx) minx = x;
    if (x > maxx) maxx = x;
    if (y < miny) miny = y;
    if (y > maxy) maxy = y;
  }
  paths.push({ fill, d, off, minx, miny, maxx, maxy });
}

if (flag === '--list') {
  const byFill = {};
  for (const p of paths) (byFill[p.fill] ??= []).push(p);
  for (const [fill, ps] of Object.entries(byFill)) {
    ps.sort((a, b) => a.miny - b.miny);
    console.log(fill, ps.length, 'paths');
    for (const p of ps) console.log(`  y ${p.miny.toFixed(0)}–${p.maxy.toFixed(0)}  x ${p.minx.toFixed(0)}–${p.maxx.toFixed(0)}`);
  }
  process.exit(0);
}

mkdirSync('src/wordmarks', { recursive: true });
for (const w of WORDS) {
  const ps = paths.filter((p) => p.fill === w.fill && p.miny >= w.y[0] && p.maxy <= w.y[1] && p.maxx - p.minx < 400);
  if (!ps.length) {
    console.warn('no paths for', w.name);
    continue;
  }
  const minx = Math.min(...ps.map((p) => p.minx));
  const miny = Math.min(...ps.map((p) => p.miny));
  const maxx = Math.max(...ps.map((p) => p.maxx));
  const maxy = Math.max(...ps.map((p) => p.maxy));
  const W = (maxx - minx).toFixed(2);
  const H = (maxy - miny).toFixed(2);
  const body = ps
    .map((p) => `<path transform="translate(${(p.off[0] - minx).toFixed(3)} ${(p.off[1] - miny).toFixed(3)})" d="${p.d.trim()}"/>`)
    .join('');
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="currentColor" aria-hidden="true">${body}</svg>\n`;
  writeFileSync(`src/wordmarks/${w.name}.svg`, out);
  console.log(w.name, ps.length, 'paths', `${W} × ${H}`, `(canvas x ${minx.toFixed(0)}–${maxx.toFixed(0)}, y ${miny.toFixed(0)}–${maxy.toFixed(0)})`);
}
