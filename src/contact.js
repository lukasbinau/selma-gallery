// The contact sheet: no shop, buying a work means writing to Selma. A dialog
// with a prefilled Danish message, a real mailto: link and copy buttons, usable
// over the front page and over the gallery.
import data from './vaerker.json';
import { toast } from './toast.js';

const WORKS = data.vaerker;
// Assembled at runtime so the address is not sitting in the HTML for scrapers
const ADDRESS = ['selma', 'gmail.com'].join('@');
const SITE = 'selmabinaukunst.dk';

const art = (file) => `${import.meta.env.BASE_URL}art/${file}`;
const deepLink = (id) => `${location.origin}${location.pathname}#galleri/${id}`;

let el = null;
let returnFocus = null;
let open = false;

// Everything behind the sheet is inert while it is open. On close, inert goes
// back to what the current view needs: the gallery up → the page is inert;
// otherwise the hidden gallery root is.
function setBehindInert(sheetOpen) {
  const inGallery = document.documentElement.dataset.view === 'galleri';
  for (const s of ['header', 'main', 'footer']) {
    const n = document.querySelector(s);
    if (n) n.inert = sheetOpen || inGallery;
  }
  const root = document.getElementById('galleri');
  if (root) root.inert = sheetOpen || !inGallery;
}

export const isContactOpen = () => open;

function build() {
  el = document.createElement('div');
  el.className = 'kontakt';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'kontakt-title');
  el.hidden = true;
  el.innerHTML = `
    <div class="kontakt__scrim" data-close></div>
    <div class="kontakt__card">
      <button type="button" class="kontakt__close" data-close aria-label="Luk">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <p class="kontakt__eyebrow">Skriv til Selma</p>
      <h2 class="kontakt__title" id="kontakt-title"></h2>
      <div class="kontakt__work" hidden>
        <img alt="" width="72" height="72" />
        <div><b class="kontakt__work-title"></b><br /><span class="kontakt__work-year"></span></div>
      </div>
      <label class="kontakt__label" for="kontakt-msg">Beskeden (du kan rette den i dit mailprogram)</label>
      <textarea id="kontakt-msg" readonly rows="8"></textarea>
      <a class="btn kontakt__mail" href="#">Åbn i mail</a>
      <div class="kontakt__addr">
        <span>Eller skriv selv til</span>
        <b class="kontakt__email"></b>
        <button type="button" class="kontakt__copy" data-copy="email">Kopiér e-mail</button>
        <button type="button" class="kontakt__copy" data-copy="msg">Kopiér besked</button>
      </div>
      <p class="kontakt__note">Selma læser og svarer selv – som regel inden for et par dage.</p>
    </div>`;
  el.querySelector('.kontakt__email').textContent = ADDRESS;
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeContact();
    const copy = e.target.closest('[data-copy]');
    if (copy) copyText(copy.dataset.copy);
  });
  document.body.append(el);
}

function compose(work) {
  if (!work) {
    return {
      subject: `Forespørgsel via ${SITE}`,
      body: `Hej Selma\n\nJeg vil gerne høre mere om dine værker.\n\nMange hilsner\n`,
    };
  }
  const year = work.aar ? ` (${work.aar})` : '';
  return {
    subject: `Forespørgsel: ${work.titel}${year}`,
    body:
      `Hej Selma\n\n` +
      `Jeg er interesseret i værket "${work.titel}"${year}. Er det stadig ledigt, og hvad koster det?\n\n` +
      `Se værket: ${deepLink(work.id)}\n\n` +
      `Mange hilsner\n`,
  };
}

function fill(id) {
  const work = WORKS.find((w) => w.id === id) || null;
  const { subject, body } = compose(work);
  const workEl = el.querySelector('.kontakt__work');
  el.querySelector('.kontakt__title').textContent = work ? `Om “${work.titel}”` : 'Hej Selma';
  workEl.hidden = !work;
  if (work) {
    const img = workEl.querySelector('img');
    img.src = art(`${work.id}-640.jpg`);
    img.alt = work.titel;
    workEl.querySelector('.kontakt__work-title').textContent = work.titel;
    workEl.querySelector('.kontakt__work-year').textContent = work.aar || '';
  }
  el.querySelector('textarea').value = body;
  el.querySelector('.kontakt__mail').href =
    `mailto:${ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyText(what) {
  const text = what === 'email' ? ADDRESS : el.querySelector('textarea').value;
  try {
    await navigator.clipboard.writeText(text);
    toast(what === 'email' ? 'E-mail kopieret' : 'Besked kopieret');
  } catch {
    // No clipboard permission: select the text so a manual copy is one keystroke away
    const ta = el.querySelector('textarea');
    if (what === 'msg') {
      ta.focus();
      ta.select();
    }
    toast('Kunne ikke kopiere – markér teksten selv');
  }
}

const focusable = () =>
  [...el.querySelectorAll('button, a[href], textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (n) => !n.hidden && n.offsetParent !== null,
  );

export function openContact({ id = null, from = null } = {}) {
  if (!el) build();
  fill(id);
  returnFocus = from || document.activeElement;
  setBehindInert(true);
  el.hidden = false;
  open = true;
  el.querySelector('.kontakt__mail').focus({ preventScroll: true });
}

export function closeContact() {
  if (!open) return;
  open = false;
  el.hidden = true;
  setBehindInert(false);
  returnFocus?.focus?.({ preventScroll: true });
  returnFocus = null;
}

// Capture phase on window, registered before the gallery module ever loads, so
// Escape closes the sheet and never reaches the gallery's own key handling.
addEventListener(
  'keydown',
  (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeContact();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      e.stopImmediatePropagation();
      return;
    }
    // Other keys stay inside the sheet (the gallery listens for arrows etc.)
    e.stopImmediatePropagation();
  },
  true,
);
