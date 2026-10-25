// The contact sheet: no shop, buying a work means writing to Selma. A dialog
// with a prefilled Danish message, a real mailto: link and copy buttons, usable
// over the front page and over the gallery.
//
//   openContact()                          a general message
//   openContact({ id, from })              about one work (buy it / ask about it)
//   openContact({ id, from, frame })       …with a frame chosen in "I din stue":
//                                          frame = { label: 'Egetræ', price: 450 }
import data from './vaerker.json';
import { toast } from './toast.js';
import { hasPris, formatPris } from './pris.js';

const WORKS = data.vaerker;
// Assembled at runtime so the address is not sitting in the HTML for scrapers
const ADDRESS = ['selma' + 'binau', 'gmail.com'].join('@');
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
      <p class="kontakt__eyebrow"></p>
      <h2 class="kontakt__title" id="kontakt-title"></h2>
      <div class="kontakt__work" hidden>
        <img alt="" width="72" height="72" />
        <div>
          <b class="kontakt__work-title"></b><br /><span class="kontakt__work-year"></span>
          <dl class="kontakt__prices"></dl>
        </div>
      </div>
      <label class="kontakt__label" for="kontakt-msg">Beskeden (du kan rette den i dit mailprogram)</label>
      <textarea id="kontakt-msg" readonly rows="8"></textarea>
      <a class="btn kontakt__mail" href="#">Åbn i mail</a>
      <div class="kontakt__addr">
        <span>Skriv selv til</span>
        <b class="kontakt__email"></b>
        <button type="button" class="kontakt__copy" data-copy="email">Kopiér e-mail</button>
        <button type="button" class="kontakt__copy" data-copy="msg">Kopiér besked</button>
      </div>
      <p class="kontakt__pay">
        <b>Sådan betaler du</b>
        Det her er en lille forretning uden webshop og betalingsløsning. Når du skriver, svarer Selma selv og sender
        dig oplysningerne, så du kan betale med MobilePay.
      </p>
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

// A frame chosen in "I din stue", or null when it is missing or malformed
function validFrame(frame) {
  if (!frame || typeof frame.label !== 'string' || !frame.label.trim()) return null;
  return { label: frame.label.trim(), price: hasPris(frame.price) ? Math.round(Number(frame.price)) : null };
}

// The lines of the price list: the work, the frame and the total (when both are known)
function priceLines(work, frame) {
  if (!work || work.solgt) return [];
  const lines = [];
  const workPrice = hasPris(work.pris) ? Number(work.pris) : null;
  if (workPrice) lines.push(['Pris', formatPris(workPrice)]);
  if (frame) lines.push(['Med ramme', frame.price ? `${frame.label}, ${formatPris(frame.price)}` : frame.label]);
  if (frame && workPrice && frame.price) lines.push(['I alt', formatPris(workPrice + frame.price)]);
  return lines;
}

function compose(work, frame) {
  if (!work) {
    return {
      subject: `Forespørgsel via ${SITE}`,
      body: `Hej Selma Binau\n\nJeg vil gerne høre mere om dine værker.\n\nMange hilsner\n`,
    };
  }
  const name = `"${work.titel}"${work.aar ? ` (${work.aar})` : ''}`;
  const link = `Se værket: ${deepLink(work.id)}\n\n`;
  if (work.solgt) {
    return {
      subject: `Forespørgsel: ${work.titel}`,
      body:
        `Hej Selma Binau\n\n` +
        `Jeg kan se, at ${name} er solgt. Har du andre værker, der minder om det?\n\n` +
        link +
        `Mange hilsner\n`,
    };
  }
  const lines = priceLines(work, frame);
  const ask = hasPris(work.pris)
    ? `Jeg vil gerne købe ${name}. Er det stadig ledigt?`
    : `Jeg er interesseret i at købe ${name}. Er det til salg?`;
  const list = lines.length ? lines.map(([k, v]) => `${k}: ${v}`).join('\n') + '\n\n' : '';
  return {
    subject: `Køb af ${work.titel}`,
    body: `Hej Selma Binau\n\n${ask}\n\n${list}${link}Mange hilsner\n`,
  };
}

function fill(id, frame) {
  const work = WORKS.find((w) => w.id === id) || null;
  const { subject, body } = compose(work, frame);
  const workEl = el.querySelector('.kontakt__work');
  el.querySelector('.kontakt__eyebrow').textContent = work && !work.solgt ? 'Køb og kontakt' : 'Skriv til Selma';
  el.querySelector('.kontakt__title').textContent = work ? `Om “${work.titel}”` : 'Hej Selma Binau';
  workEl.hidden = !work;
  if (work) {
    const img = workEl.querySelector('img');
    img.src = art(`${work.id}-640.jpg`);
    img.alt = work.titel;
    workEl.querySelector('.kontakt__work-title').textContent = work.titel;
    workEl.querySelector('.kontakt__work-year').textContent = [work.aar, work.solgt ? 'Solgt' : ''].filter(Boolean).join(' · ');
    const dl = workEl.querySelector('.kontakt__prices');
    dl.replaceChildren(
      ...priceLines(work, frame).flatMap(([k, v]) => {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        if (k === 'I alt') dt.className = dd.className = 'is-total';
        return [dt, dd];
      }),
    );
    dl.hidden = !dl.childElementCount;
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

export function openContact({ id = null, from = null, frame = null } = {}) {
  if (!el) build();
  fill(id, validFrame(frame));
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
