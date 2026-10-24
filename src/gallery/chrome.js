// The gallery's HTML: everything inside the root (Danish labels), the settings
// popover, toast, hint, live region, and the plaque markup. The 3D work lives
// in gallery.js; this file only knows about the DOM.
import { settings, setSetting } from '../store.js';

export const STRINGS = {
  back: '← FORSIDE',
  prev: 'Forrige værk',
  next: 'Næste værk',
  settings: 'Indstillinger',
  hint: 'Swipe for at gå · tryk på et maleri for at gå tæt på',
  map: 'Kort over rummet',
  scene: '3D-galleri med Selmas malerier',
  contact: 'Skriv til Selma',
  sold: 'Solgt',
  imageFailed: 'Et billede kunne ikke hentes',
  announce: (titel, n, total) => `Galleri: ${titel}, ${n} af ${total}`,
};

// Settings keys and values stay as before (localStorage 'selma:settings'), only the labels are Danish
const SETTINGS = [
  { key: 'theme', label: 'Rum', options: [['evening', 'Aften'], ['daylight', 'Dag']] },
  { key: 'motion', label: 'Kamera', options: [['full', 'Glidende'], ['reduced', 'Rolig']] },
  { key: 'plaques', label: 'Skilte', options: [['on', 'Vis'], ['off', 'Skjul']] },
  { key: 'fx', label: 'Stemning', options: [['on', 'Film'], ['off', 'Enkel']] },
];

const ICON = {
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>`,
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>`,
};

export const pad = (n) => String(n).padStart(2, '0');

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Empty strings in vaerker.json mean "not filled in yet" and are never shown
const filled = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !/^udfyld$/i.test(String(v).trim());

function settingsMarkup() {
  return SETTINGS.map(
    ({ key, label, options }) => `
      <div class="galleri__setting">
        <span class="galleri__setting-label">${label}</span>
        <div class="galleri__segmented" data-setting="${key}">
          ${options.map(([value, text]) => `<button type="button" data-value="${value}" aria-pressed="false">${text}</button>`).join('')}
        </div>
      </div>`,
  ).join('');
}

// Builds the chrome inside `root` and returns references to the parts gallery.js drives.
export function buildChrome(root, { total }) {
  // The room is a modal layer over the page while it is shown
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Galleri');
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
  root.dataset.theme = settings.theme;
  root.dataset.fx = settings.fx === 'off' ? 'off' : 'on';
  root.innerHTML = `
    <canvas class="galleri__scene" aria-label="${STRINGS.scene}"></canvas>
    <div class="galleri__vignette" aria-hidden="true"></div>
    <div class="galleri__grain" aria-hidden="true"></div>
    <header class="galleri__topbar">
      <button type="button" class="galleri__back">${STRINGS.back}</button>
      <button type="button" class="galleri__icon-btn galleri__gear" aria-label="${STRINGS.settings}" aria-expanded="false">${ICON.gear}</button>
    </header>
    <div class="galleri__caption" aria-hidden="true"></div>
    <div class="galleri__popover" role="dialog" aria-label="${STRINGS.settings}" hidden>${settingsMarkup()}</div>
    <button type="button" class="galleri__nav galleri__nav--prev" aria-label="${STRINGS.prev}">${ICON.prev}</button>
    <button type="button" class="galleri__nav galleri__nav--next" aria-label="${STRINGS.next}">${ICON.next}</button>
    <div class="galleri__counter" aria-hidden="true">
      <span class="galleri__counter-current">01</span>
      <span class="galleri__counter-bar"><span class="galleri__counter-fill"></span></span>
      <span class="galleri__counter-total">${pad(total)}</span>
    </div>
    <div class="galleri__hint is-hidden" aria-hidden="true">${STRINGS.hint}</div>
    <nav class="galleri__minimap" aria-label="${STRINGS.map}"></nav>
    <div class="galleri__toast" role="status" aria-live="polite"></div>
    <div class="galleri__live galleri-sr-only" aria-live="polite"></div>
    <div class="galleri__progress" aria-hidden="true"><span></span></div>`;

  const $ = (sel) => root.querySelector(sel);
  const ui = {
    root,
    canvas: $('.galleri__scene'),
    back: $('.galleri__back'),
    gear: $('.galleri__gear'),
    popover: $('.galleri__popover'),
    prev: $('.galleri__nav--prev'),
    next: $('.galleri__nav--next'),
    current: $('.galleri__counter-current'),
    total: $('.galleri__counter-total'),
    fill: $('.galleri__counter-fill'),
    caption: $('.galleri__caption'),
    hint: $('.galleri__hint'),
    minimap: $('.galleri__minimap'),
    toastEl: $('.galleri__toast'),
    live: $('.galleri__live'),
    progress: $('.galleri__progress'),
  };

  ui.settings = createSettings(ui.gear, ui.popover);
  ui.toast = createToast(ui.toastEl);
  ui.announce = (text) => {
    // Clear first so repeated announcements of the same text are still read
    ui.live.textContent = '';
    ui.live.textContent = text;
  };
  ui.setProgress = (fraction) => {
    ui.progress.classList.remove('is-done');
    ui.progress.firstElementChild.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction))})`;
  };
  ui.progressDone = () => {
    ui.progress.firstElementChild.style.transform = 'scaleX(1)';
    ui.progress.classList.add('is-done');
  };
  return ui;
}

// ---------------------------------------------------------------- settings
// A popover with segmented controls; the pressed state mirrors the store.
function createSettings(gear, popover) {
  const groups = [...popover.querySelectorAll('.galleri__segmented')];
  const render = () => {
    groups.forEach((group) => {
      group.querySelectorAll('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(settings[group.dataset.setting] === b.dataset.value));
      });
    });
  };
  groups.forEach((group) => {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setSetting(group.dataset.setting, b.dataset.value);
      render();
    });
  });
  render();

  // Click outside the popover closes it
  const onDocClick = (e) => {
    if (!popover.contains(e.target) && !gear.contains(e.target)) close();
  };
  function open() {
    if (!popover.hidden) return;
    popover.hidden = false;
    gear.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    (popover.querySelector('button[aria-pressed="true"]') ?? popover.querySelector('button'))?.focus({ preventScroll: true });
  }
  function close({ restoreFocus = false } = {}) {
    if (popover.hidden) return;
    popover.hidden = true;
    gear.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick);
    if (restoreFocus) gear.focus({ preventScroll: true });
  }
  gear.addEventListener('click', () => (popover.hidden ? open() : close()));
  return { open, close, render, isOpen: () => !popover.hidden };
}

// ---------------------------------------------------------------- toast
function createToast(el) {
  let timer;
  return (message) => {
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('is-visible'), 2200);
  };
}

// ---------------------------------------------------------------- plaques
// One <article> per work: TITEL, "ÅR · TEKNIK · MÅL" (filled fields only), the
// OM text, then a SKRIV TIL SELMA button (emits 'contact') or a red dot + SOLGT.
export function createPlaques(works) {
  return works.map((w) => {
    const el = document.createElement('article');
    el.className = 'galleri-plaque';
    el.setAttribute('aria-label', w.titel ?? '');
    const meta = [w.aar, w.teknik, w.maal].filter(filled).map((v) => esc(String(v).trim())).join(' · ');
    const foot = w.solgt
      ? `<span class="galleri-plaque__sold">${STRINGS.sold}</span>`
      : `<button type="button" class="galleri-plaque__btn" data-contact="${esc(w.id)}">${STRINGS.contact}</button>`;
    el.innerHTML = `
      <h2 class="galleri-plaque__title">${esc(w.titel ?? '')}</h2>
      ${meta ? `<p class="galleri-plaque__meta">${meta}</p>` : ''}
      ${filled(w.om) ? `<p class="galleri-plaque__om">${esc(w.om.trim())}</p>` : ''}
      <div class="galleri-plaque__foot">${foot}</div>`;
    return el;
  });
}

// Plaque heights must be measured in the document, outside the hidden root
// (offsetHeight is 0 inside display:none), with the real fonts loaded. The
// measuring box stays on <body>; the CSS3D renderer later moves the elements
// into the gallery.
export async function measurePlaques(els) {
  let box = document.querySelector('.galleri-plaques');
  if (!box) {
    box = document.createElement('div');
    box.className = 'galleri-plaques';
    box.setAttribute('aria-hidden', 'true');
    document.body.append(box);
  }
  box.append(...els);
  await fontsReady();
  return els.map((el) => el.offsetHeight);
}

async function fontsReady() {
  if (!document.fonts) return;
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  try {
    // Ask for both weights and the latin-ext glyphs (æøå) explicitly, so the
    // faces are fetched before we measure, then wait for layout to settle.
    const loads = Promise.all([
      document.fonts.load('400 16px "Space Mono"', 'Mønster æøå'),
      document.fonts.load('700 16px "Space Mono"', 'MØNSTER ÆØÅ'),
    ]).then(() => document.fonts.ready);
    await Promise.race([loads, timeout]);
  } catch {
    /* a missing font never blocks the gallery */
  }
}
