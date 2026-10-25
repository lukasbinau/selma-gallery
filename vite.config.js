import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasPris, formatPris } from './src/pris.js';

// ---------------------------------------------------------------------------
// Front-page plugin: fills index.html from the data files at build time (and
// on every reload of the dev server), so the works grid is plain static HTML.
//
//   src/vaerker.json        the works, in display order (= hanging order)
//   src/art-meta.json       pixel size of every photo, written by `npm run images`
//   src/wordmarks/*.svg     SELMA / KUNST / ORIGINALE VÆRKER, lifted from Selma's
//                           Canva design by scripts/extract-wordmarks.mjs; the menu
//                           bar's SELMA BINAU KUNST and OM MIG are set from the same
//                           glyphs by scripts/compose-wordmarks.mjs
//
// How to add a work: add an object to src/vaerker.json, add its photo to
// scripts/prepare-images.mjs and run `npm run images`. Nothing else to touch:
// the grid, the gallery and the contact sheet all read the same two files.
//
// Markers the plugin replaces in index.html:
//   <!-- VAERKER -->              the grid items, one per work
//   <!-- WORDMARK selma -->       inline SVG of src/wordmarks/selma.svg
//   <!-- STRIP firkloever 24 -->  24 pattern tiles for a sidebar strip
// ---------------------------------------------------------------------------

// Where the first works sit on the 48-column grid of the ORIGINALE VÆRKER
// section (see .vaerker__grid in src/front.css), measured from the Canva
// layout. Rows are the grid's explicit rows, whose minimum heights reproduce
// the design's loose vertical rhythm; they grow if a caption needs more room.
//   col/span: column line and span   row/rows: row line and span
//   shift:    extra offset below the row's top edge (cqw = 1% of the page width)
const LAYOUT = {
  'moenster-lyseroed': { col: 37, span: 12, row: 1, rows: 2, shift: '2cqw' },
  'lilla-skyer': { col: 1, span: 17, row: 2, rows: 3 },
  cirkler: { col: 19, span: 13, row: 4, rows: 3 },
  'lille-stjerne': { col: 33, span: 15, row: 5, rows: 4 },
  ansigt: { col: 3, span: 13, row: 6, rows: 2 },
  figur: { col: 5, span: 18, row: 10, rows: 2 },
  'orange-mand': { col: 30, span: 19, row: 11, rows: 2 },
  'blaa-fliser': { col: 3, span: 15, row: 14, rows: 1 },
};
const FIRST_FREE_ROW = 15;

// Works beyond the table continue the scatter: right, left, right, left…
// each spanning two rows and starting one row after the previous work, so
// every work hangs beside the lower half of the one before it (a brick
// stagger), with a little air (the shift) above each.
const RHYTHM = [
  { col: 30, span: 19 },
  { col: 3, span: 15 },
  { col: 32, span: 16 },
  { col: 5, span: 18 },
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ARROW =
  '<svg class="arrow" viewBox="0 0 16 10" aria-hidden="true" focusable="false"><path d="M1 5h13M10 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function placement(id, i, extras) {
  const fixed = LAYOUT[id];
  if (fixed) return fixed;
  const k = extras.indexOf(id);
  return { ...RHYTHM[k % RHYTHM.length], row: FIRST_FREE_ROW + k, rows: 2, shift: '6cqw' };
}

function renderWorks(root) {
  const { vaerker } = JSON.parse(readFileSync(resolve(root, 'src/vaerker.json'), 'utf8'));
  const meta = JSON.parse(readFileSync(resolve(root, 'src/art-meta.json'), 'utf8'));
  const extras = vaerker.map((w) => w.id).filter((id) => !LAYOUT[id]);

  return vaerker
    .map((w, i) => {
      const size = meta[w.id];
      if (!size) throw new Error(`art-meta.json has no size for "${w.id}" – run npm run images`);
      const p = placement(w.id, i, extras);
      const style = [
        `--col-start:${p.col}`,
        `--col-span:${p.span}`,
        `--row-start:${p.row}`,
        `--row-span:${p.rows}`,
        p.shift ? `--row-shift:${p.shift}` : '',
      ]
        .filter(Boolean)
        .join(';');
      const title = esc(w.titel);
      const year = w.aar ? String(w.aar) : '';
      const caption = [
        `<h3 class="vaerk__title">${title}${year ? `<br>${year}` : ''}</h3>`,
        w.om ? `<p class="vaerk__om"><b>Om:</b> ${esc(w.om)}</p>` : '',
        w.teknik ? `<p>${esc(w.teknik)}</p>` : '',
        w.maal ? `<p>Mål: ${esc(w.maal)}</p>` : '',
      ]
        .filter(Boolean)
        .join('');
      // Price, then a row of two: buy (or the Solgt marker) and "I din stue",
      // which the router turns into the painting hung in a living room
      const price = !w.solgt && hasPris(w.pris) ? `<p class="vaerk__pris">${formatPris(w.pris)}</p>` : '';
      const buy = w.solgt
        ? `<span class="vaerk__sold"><i aria-hidden="true"></i>Solgt</span>`
        : `<button type="button" class="vaerk__contact" data-contact="${esc(w.id)}">Køb og kontakt</button>`;
      const stue = `<a class="vaerk__stue" href="#stue/${esc(w.id)}" data-stue="${esc(w.id)}" aria-label="Se “${title}” i din stue">I din stue ${ARROW}</a>`;
      const action = `<div class="vaerk__actions">${price}<div class="vaerk__buttons">${buy}${stue}</div></div>`;
      const alt = `“${title}”${year ? ` (${year})` : ''}, maleri af Selma Frausing Binau`;
      return `
        <div class="vaerk-cell" style="${style}">
          <a class="vaerk" href="#galleri/${esc(w.id)}" data-id="${esc(w.id)}">
            <span class="vaerk__frame" style="aspect-ratio:${size.w}/${size.h}">
              <img src="/art/${esc(w.id)}-640.jpg" srcset="/art/${esc(w.id)}-640.jpg 640w, /art/${esc(w.id)}-1024.jpg 1024w"
                sizes="(max-width: 760px) 86vw, 30vw" width="${size.w}" height="${size.h}"
                loading="lazy" decoding="async" alt="${alt}">
            </span>
            <span class="vaerk__caption">${caption}</span>
          </a>
          ${action}
        </div>`;
    })
    .join('\n');
}

function renderWordmark(root, name) {
  const svg = readFileSync(resolve(root, `src/wordmarks/${name}.svg`), 'utf8').trim();
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  if (!viewBox) throw new Error(`src/wordmarks/${name}.svg has no viewBox`);
  // The <g id> lets a page reuse the paths through <use href="#wm-<name>">
  return `<svg class="wm wm--${name}" viewBox="${viewBox}" fill="currentColor" aria-hidden="true" focusable="false"><g id="wm-${name}">${inner}</g></svg>`;
}

const renderStrip = (tile, n) => `<i class="tile tile--${tile}"></i>`.repeat(Number(n) || 24);

function selmaFront() {
  let root = process.cwd();
  return {
    name: 'selma-front',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html
          .replace(/<!--\s*VAERKER\s*-->/, () => renderWorks(root))
          .replace(/<!--\s*WORDMARK\s+([\w-]+)\s*-->/g, (_, name) => renderWordmark(root, name))
          .replace(/<!--\s*STRIP\s+([\w-]+)(?:\s+(\d+))?\s*-->/g, (_, tile, n) => renderStrip(tile, n));
      },
    },
    // Editing the data in dev: reload the page so the static grid is rebuilt
    handleHotUpdate({ file, server }) {
      if (/[\\/]src[\\/](vaerker\.json|art-meta\.json|wordmarks[\\/].+\.svg)$/.test(file)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

// Relative asset paths: the site works both at lukasbinau.github.io/selma-gallery/
// and at the root of the custom domain (selmabinaukunst.dk)
export default defineConfig({
  base: './',
  plugins: [selmaFront()],
});
