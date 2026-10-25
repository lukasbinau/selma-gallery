// The room view's HTML: top bar, the control panel with its tabs and
// horizontal rails, and the summary bar with prices and the buy button.
// Danish labels; no three.js in here.

export const STRINGS = {
  eyebrow: 'I din stue',
  backFront: '← Forside',
  backGallery: '← Galleri',
  close: 'Luk',
  tabs: { work: 'Værk', frame: 'Ramme', wall: 'Væg', time: 'Lys', view: 'Rum' },
  railLabel: {
    work: 'Vælg værk',
    frame: 'Vælg ramme',
    wall: 'Vælg væg',
    time: 'Vælg tidspunkt',
    view: 'Vælg rum',
  },
  buy: 'Køb og kontakt',
  sold: 'Solgt',
  priceOnRequest: 'Pris efter aftale',
  total: 'I alt',
  painting: 'Maleri',
  noFrame: 'Uden ramme',
  estimated: 'Mål ikke oplyst – vist i anslået størrelse',
  withMat: 'med passepartout',
  loading: 'Indretter stuen',
  scene: 'Selmas maleri hængt op i en stue',
  failed: 'Billedet kunne ikke hentes',
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const TIME_ICONS = {
  morgen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M7 17a5 5 0 0 1 10 0M12 6v3M5.6 9.6l2 2M18.4 9.6l-2 2" /></svg>',
  dag: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>',
  aften: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M6 21h12M7 17a5 5 0 0 1 10 0M12 4v3M8 8l-1-1M16 8l1-1" /></svg>',
  nat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" /></svg>',
};

const VIEW_ICONS = {
  stue: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 18h18M5 18v2M19 18v2" /></svg>',
  spise: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v10M19 10v10M8 4h8l-1 3H9Z" /></svg>',
};

export function buildChrome(root) {
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', STRINGS.eyebrow);
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
  root.innerHTML = `
    <canvas class="stue__scene" role="img" aria-label="${STRINGS.scene}"></canvas>
    <canvas class="stue__fade" aria-hidden="true"></canvas>
    <div class="stue__shade" aria-hidden="true"></div>
    <header class="stue__top">
      <button type="button" class="stue__back">${STRINGS.backFront}</button>
      <p class="stue__eyebrow">${STRINGS.eyebrow}</p>
      <p class="stue__note" hidden>${STRINGS.estimated}</p>
    </header>
    <section class="stue__panel" aria-label="Indstillinger for stuen">
      <div class="stue__summary">
        <div class="stue__what">
          <h2 class="stue__title"></h2>
          <p class="stue__lines"></p>
        </div>
        <div class="stue__buy">
          <p class="stue__total"></p>
          <button type="button" class="stue__cta">${STRINGS.buy}</button>
          <span class="stue__sold" hidden><i aria-hidden="true"></i>${STRINGS.sold}</span>
        </div>
      </div>
      <div class="stue__tabs" role="tablist" aria-label="Vælg hvad du vil ændre">
        ${Object.entries(STRINGS.tabs)
          .map(
            ([k, v], i) =>
              `<button type="button" role="tab" class="stue__tab" id="stue-tab-${k}" data-tab="${k}" aria-controls="stue-rail-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${v}</button>`,
          )
          .join('')}
      </div>
      <div class="stue__rails">
        ${Object.keys(STRINGS.tabs)
          .map(
            (k, i) =>
              `<div class="stue__rail" id="stue-rail-${k}" role="radiogroup" aria-label="${STRINGS.railLabel[k]}" data-rail="${k}" ${i === 0 ? '' : 'hidden'}></div>`,
          )
          .join('')}
      </div>
    </section>
    <div class="stue__live stue-sr-only" aria-live="polite"></div>`;
  const $ = (s) => root.querySelector(s);
  return {
    canvas: $('.stue__scene'),
    fade: $('.stue__fade'),
    back: $('.stue__back'),
    note: $('.stue__note'),
    panel: $('.stue__panel'),
    top: $('.stue__top'),
    title: $('.stue__title'),
    lines: $('.stue__lines'),
    total: $('.stue__total'),
    cta: $('.stue__cta'),
    sold: $('.stue__sold'),
    tabs: [...root.querySelectorAll('.stue__tab')],
    rails: Object.fromEntries([...root.querySelectorAll('.stue__rail')].map((r) => [r.dataset.rail, r])),
    live: $('.stue__live'),
  };
}

/**
 * Fill a rail with options. items: [{ id, label, sub, html (visual), disabled }]
 * The rail is a radio group: one tab stop, arrow keys move the choice.
 */
export function fillRail(rail, items, selected) {
  rail.innerHTML = items
    .map(
      (it) => `
      <button type="button" role="radio" class="stue__opt stue__opt--${rail.dataset.rail}" data-id="${esc(it.id)}"
        aria-checked="${it.id === selected}" tabindex="${it.id === selected ? 0 : -1}" aria-label="${esc(it.aria || it.label)}">
        <span class="stue__opt-visual">${it.html || ''}</span>
        <span class="stue__opt-label">${esc(it.label)}</span>
        ${it.sub ? `<span class="stue__opt-sub">${esc(it.sub)}</span>` : ''}
      </button>`,
    )
    .join('');
}

export function markRail(rail, selected, { scroll = true } = {}) {
  let current = null;
  rail.querySelectorAll('.stue__opt').forEach((b) => {
    const on = b.dataset.id === selected;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on) current = b;
  });
  if (current && scroll && !rail.hidden) centreInRail(rail, current);
  return current;
}

export function centreInRail(rail, el, behavior = 'smooth') {
  const target = el.offsetLeft - (rail.clientWidth - el.offsetWidth) / 2;
  rail.scrollTo({ left: Math.max(0, target), behavior });
}

export const viewIcon = (id) => VIEW_ICONS[id] || VIEW_ICONS.stue;
export { esc };
