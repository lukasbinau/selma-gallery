// Sets new words from the glyphs of Selma's Canva wordmarks, for words the
// design never had: the menu bar's SELMA BINAU KUNST and the OM MIG heading.
// Run after extract-wordmarks.mjs:
//
//   node scripts/compose-wordmarks.mjs
//
// The Canva export only contains the letters of SELMA, KUNST (heavy) and
// ORIGINALE VÆRKER, PROCESSEN (medium). The few missing letters are below:
// the heavy B and I are drawn to the measurements of the heavy set (stem
// 67.8, bars ~40, slit counters), the medium M is Archivo (SIL OFL) at
// width 125 / weight 720, which matches the medium set's stems.
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'src/wordmarks';

// Each glyph: { d, x0, x1 } with the path already placed on the baseline (y 0 = baseline)
function glyphsOf(name, letters) {
  const svg = readFileSync(`${DIR}/${name}.svg`, 'utf8');
  const re = /<path transform="translate\(([-\d.]+) ([-\d.]+)\)" d="([^"]+)"\/>/g;
  const out = {};
  let m;
  let i = 0;
  while ((m = re.exec(svg))) {
    const letter = letters[i++];
    if (!letter || out[letter]) continue;
    const tx = +m[1];
    const xs = m[3].match(/-?\d+\.?\d*/g).map(Number).filter((_, k) => k % 2 === 0);
    // Canva's glyph paths sit on y 0 with their own x offset: keep both, store the ink extent
    out[letter] = { d: m[3], dx: 0, x0: Math.min(...xs), x1: Math.max(...xs), tx };
  }
  return out;
}

const heavy = { ...glyphsOf('selma', 'SELMA'), ...glyphsOf('kunst', 'KUNST') };
const medium = { ...glyphsOf('originale-vaerker', 'ORIGINALEVÆRKER'), ...glyphsOf('processen', 'PROCESSEN') };

// Drawn to the heavy set: same stem as L (67.8), bars as E, a bigger lower bowl
heavy.B = {
  d:
    'M 0 0 L 0 -143.078 L 106 -143.078 C 150 -143.078 171 -127 171 -105 C 171 -89.5 161 -79 143 -74.5 ' +
    'C 166 -70.5 181 -57 181 -38.5 C 181 -12.5 160 0 113 0 Z ' +
    'M 67.8 -103 L 99 -103 C 106 -103 109.5 -100 109.5 -95.75 C 109.5 -91.5 106 -88.5 99 -88.5 L 67.8 -88.5 Z ' +
    'M 67.8 -56.5 L 105 -56.5 C 112.5 -56.5 117 -53 117 -48.5 C 117 -44 112.5 -40.6 105 -40.6 L 67.8 -40.6 Z',
  x0: 0,
  x1: 181,
  evenodd: true,
};
heavy.I = { d: 'M 0 0 L 0 -143.078 L 67.8 -143.078 L 67.8 0 Z', x0: 0, x1: 67.8 };

// Archivo M (width 125, weight 720), scaled to the medium set's cap height 44.5625
medium.M = {
  d: 'M 0 0 L 0 -44.692 L 18.189 -44.692 L 27.023 -23.58 Q 27.478 -22.411 28.16 -20.592 Q 28.842 -18.773 29.589 -16.825 Q 30.336 -14.876 30.856 -13.252 L 31.311 -13.252 Q 31.83 -14.681 32.545 -16.565 Q 33.259 -18.449 33.942 -20.3 Q 34.624 -22.151 35.208 -23.515 L 44.043 -44.692 L 61.712 -44.692 L 61.712 0 L 50.084 0 L 50.084 -25.075 Q 50.084 -26.309 50.149 -27.835 Q 50.214 -29.362 50.246 -30.856 Q 50.279 -32.35 50.344 -33.454 L 49.824 -33.454 Q 49.499 -32.285 48.915 -30.759 Q 48.33 -29.232 47.81 -27.738 Q 47.291 -26.244 46.771 -25.075 L 36.118 0 L 25.204 0 L 14.486 -25.075 Q 13.836 -26.569 13.252 -28.16 Q 12.667 -29.752 12.212 -31.148 Q 11.758 -32.545 11.433 -33.454 L 10.913 -33.454 Q 10.978 -32.61 11.011 -31.213 Q 11.043 -29.817 11.076 -28.258 Q 11.108 -26.699 11.108 -25.075 L 11.108 0 Z',
  x0: 0,
  x1: 61.712,
  scaleY: 44.5625 / 44.692,
};

// Lays out lines of words. Returns the SVG body and its size.
//   set:       glyph table   track: gap between letters   space: word gap
//   cap/top:   cap height and the extra ink above it (Canva's S/O overshoot)
function setLines(lines, { set, track, space, cap, top, lead }) {
  let y = cap + top;
  let width = 0;
  const groups = [];
  for (const line of lines) {
    let x = 0;
    const parts = line.map(({ text, cls }) => {
      let body = '';
      if (x > 0) x += space;
      for (const ch of text) {
        const g = set[ch];
        if (!g) throw new Error(`no glyph for "${ch}"`);
        const s = g.scaleY ? ` scale(1 ${g.scaleY.toFixed(5)})` : '';
        body += `<path transform="translate(${(x - g.x0).toFixed(3)} ${y.toFixed(3)})${s}"${g.evenodd ? ' fill-rule="evenodd"' : ''} d="${g.d.trim()}"/>`;
        x += g.x1 - g.x0 + track;
      }
      x -= track;
      return cls ? `<g class="${cls}">${body}</g>` : body;
    });
    width = Math.max(width, x);
    groups.push(parts.join(''));
    y += cap + lead;
  }
  const height = y - lead - cap + top; // overshoot below the last baseline as well
  return { body: groups.join(''), width, height };
}

function write(name, lines, opts) {
  const { body, width, height } = setLines(lines, opts);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}" fill="currentColor" aria-hidden="true">${body}</svg>\n`;
  writeFileSync(`${DIR}/${name}.svg`, svg);
  console.log(name, `${width.toFixed(1)} × ${height.toFixed(1)}`);
}

const HEAVY = { set: heavy, track: 4, space: 52, cap: 143.078, top: 4.2, lead: 30 };
const MEDIUM = { set: medium, track: 3.4, space: 17, cap: 44.5625, top: 1, lead: 4 };

// Menu bar: one line on wide screens, stacked on narrow ones (front.css)
write('brand', [[{ text: 'SELMA', cls: 'b1' }, { text: 'BINAU', cls: 'b2' }, { text: 'KUNST', cls: 'b3' }]], HEAVY);
write('brand-stack', [[{ text: 'SELMA', cls: 'b1' }], [{ text: 'BINAU', cls: 'b2' }], [{ text: 'KUNST', cls: 'b3' }]], HEAVY);
write('om-mig', [[{ text: 'OM' }, { text: 'MIG' }]], MEDIUM);
