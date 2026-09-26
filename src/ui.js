// Everything HTML: top-bar buttons, settings, plaques, cart drawer, checkout.
import { paintings, formatPrice, ARTIST } from './paintings.js';
import { settings, setSetting, cart } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SHIPPING = 95;

// ---------------------------------------------------------------- overlays
// Only one overlay is open at a time. 'settings' is a popover (no scrim);
// the others are dialogs over a blurred scrim.
const scrim = $('.scrim');
const layers = {
  settings: $('#settings'),
  cart: $('#cart'),
  checkout: $('#checkout'),
  about: $('#about'),
};
let current = null;
let returnFocus = null;

export const isOverlayOpen = () => current !== null;

export function open(name) {
  if (current === name) return;
  if (current) close({ restoreFocus: false });
  current = name;
  returnFocus = document.activeElement;
  toastEl.classList.remove('is-visible');
  layers[name].hidden = false;
  scrim.hidden = name === 'settings';
  $('[data-open="settings"]').setAttribute('aria-expanded', String(name === 'settings'));
  if (name === 'cart') renderCart();
  if (name === 'checkout') showStep('details');
  const focusable = $('input, button:not([data-close]), [data-close]', layers[name]);
  focusable?.focus({ preventScroll: true });
}

export function close({ restoreFocus = true } = {}) {
  if (!current) return;
  layers[current].hidden = true;
  if (current === 'checkout') resetCheckout();
  current = null;
  scrim.hidden = true;
  $('[data-open="settings"]').setAttribute('aria-expanded', 'false');
  if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  if (opener) {
    const name = opener.dataset.open;
    if (name === 'checkout' && cart.count() === 0) return;
    if (name === current) close();
    else open(name);
    return;
  }
  if (e.target.closest('[data-close]')) return close();
  // Click outside the settings popover closes it
  if (current === 'settings' && !e.target.closest('#settings')) close({ restoreFocus: false });
});
scrim.addEventListener('click', () => close());
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
});

// ---------------------------------------------------------------- toast
const toastEl = $('.toast');
let toastTimer;
export function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2200);
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  $$('.segmented').forEach((group) => {
    $$('button', group).forEach((b) => {
      b.setAttribute('aria-pressed', String(settings[group.dataset.setting] === b.dataset.value));
    });
  });
}
$$('.segmented').forEach((group) => {
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    setSetting(group.dataset.setting, b.dataset.value);
    renderSettings();
  });
});
renderSettings();

// ---------------------------------------------------------------- badge
const badge = $('.badge');
function renderBadge(bump = false) {
  const n = cart.count();
  badge.hidden = n === 0;
  badge.textContent = n;
  $('[data-open="cart"]').setAttribute('aria-label', n ? `Cart, ${n} item${n > 1 ? 's' : ''}` : 'Cart');
  if (bump) {
    badge.classList.remove('is-bumping');
    void badge.offsetWidth; // restart the animation
    badge.classList.add('is-bumping');
  }
}

// ---------------------------------------------------------------- plaques
export function createPlaques(container) {
  const els = paintings.map((p) => {
    const el = document.createElement('article');
    el.className = 'plaque';
    el.setAttribute('aria-label', p.title);
    el.innerHTML = `
      <h2 class="plaque__title">${p.title}</h2>
      <p class="plaque__meta">${ARTIST}, ${p.year}<br />${p.medium} · ${p.size}</p>
      <p class="plaque__desc">${p.description}</p>
      <div class="plaque__foot">
        ${
          p.sold
            ? `<span class="plaque__price">${formatPrice(p.price)}</span><span class="plaque__sold">Sold</span>`
            : `<span class="plaque__price">${formatPrice(p.price)}</span>
               <button class="btn btn--primary btn--small" data-buy="${p.id}">Add to cart</button>`
        }
      </div>`;
    container.append(el);
    return el;
  });
  renderPlaqueButtons();
  return els;
}

function renderPlaqueButtons() {
  $$('[data-buy]').forEach((b) => {
    const inCart = cart.has(b.dataset.buy);
    b.textContent = inCart ? 'In cart ✓' : 'Add to cart';
    b.classList.toggle('btn--added', inCart);
  });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-buy]');
  if (!b) return;
  const id = b.dataset.buy;
  if (cart.has(id)) return open('cart');
  cart.add(id);
  renderBadge(true);
  toast(`“${paintings.find((p) => p.id === id).title}” added to cart`);
});

// ---------------------------------------------------------------- cart drawer
function renderCart() {
  const items = cart.items();
  const list = $('.cart-list');
  list.innerHTML = items
    .map(
      (p) => `
      <li class="cart-item">
        <img src="${p.src}" alt="" loading="lazy" />
        <div>
          <div class="cart-item__title">${p.title}</div>
          <div class="cart-item__meta">${p.medium} · ${p.size}</div>
        </div>
        <div class="cart-item__side">
          <span class="cart-item__price">${formatPrice(p.price)}</span>
          <button class="link-btn" data-remove="${p.id}">Remove</button>
        </div>
      </li>`,
    )
    .join('');
  list.hidden = items.length === 0;
  $('.cart-empty').hidden = items.length > 0;
  $('.drawer__foot').hidden = items.length === 0;
  $('.cart-subtotal').textContent = formatPrice(cart.subtotal());
}
$('.cart-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (b) cart.remove(b.dataset.remove);
});

addEventListener('cart:change', () => {
  renderBadge();
  renderPlaqueButtons();
  if (current === 'cart') renderCart();
});

// ---------------------------------------------------------------- checkout
const detailsForm = $('form[data-step="details"]');
const reviewForm = $('form[data-step="review"]');
const order = {};

function showStep(step) {
  const sequence = ['details', 'review', 'done'];
  $$('.step', layers.checkout).forEach((el) => (el.hidden = el.dataset.step !== step));
  $$('.steps li').forEach((li) => {
    const i = sequence.indexOf(li.dataset.step);
    li.classList.toggle('is-active', li.dataset.step === step);
    li.classList.toggle('is-complete', i < sequence.indexOf(step));
  });
}

function resetCheckout() {
  detailsForm.reset();
  reviewForm.reset();
  $('.ship-fields').hidden = true;
  $('.form-error').textContent = '';
  $$('input', detailsForm).forEach((i) => i.removeAttribute('aria-invalid'));
  showStep('details');
}

detailsForm.addEventListener('change', (e) => {
  if (e.target.name === 'delivery') $('.ship-fields').hidden = e.target.value !== 'ship';
});

detailsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(detailsForm));
  const ship = data.delivery === 'ship';
  const checks = [
    ['name', data.name.trim().length > 1, 'Please enter your name.'],
    ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()), 'Please enter a valid email.'],
    ['street', !ship || data.street.trim().length > 2, 'Please enter your street address.'],
    ['zip', !ship || /^\d{4}$/.test(data.zip.trim()), 'Danish postcodes have 4 digits.'],
    ['city', !ship || data.city.trim().length > 1, 'Please enter your city.'],
  ];
  let firstError = null;
  for (const [name, ok, message] of checks) {
    const input = detailsForm.elements[name];
    input.setAttribute('aria-invalid', String(!ok));
    if (!ok && !firstError) firstError = { input, message };
  }
  $('.form-error').textContent = firstError?.message ?? '';
  if (firstError) return firstError.input.focus();

  Object.assign(order, data, { shipping: ship ? SHIPPING : 0 });
  renderSummary();
  showStep('review');
  $('button[type="submit"]', reviewForm).focus({ preventScroll: true });
});

function renderSummary() {
  const items = cart.items();
  $('.summary-list').innerHTML = items
    .map((p) => `<li><img src="${p.src}" alt="" /><span>${p.title}</span><strong>${formatPrice(p.price)}</strong></li>`)
    .join('');
  const total = cart.subtotal() + order.shipping;
  $('.summary-totals').innerHTML = `
    <div class="row"><span>Subtotal</span><span>${formatPrice(cart.subtotal())}</span></div>
    <div class="row"><span>${order.shipping ? 'Delivery in Denmark' : 'Pick up from the studio'}</span><span>${
      order.shipping ? formatPrice(order.shipping) : 'Free'
    }</span></div>
    <div class="row row--total"><span>Total</span><strong>${formatPrice(total)}</strong></div>`;
}

$('[data-back]', reviewForm).addEventListener('click', () => showStep('details'));

reviewForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const items = cart.items();
  const total = cart.subtotal() + order.shipping;
  const number = `SFB-${Math.floor(1000 + Math.random() * 9000)}`;
  const first = order.name.trim().split(/\s+/)[0];
  const works = items.length === 1 ? `“${items[0].title}”` : `${items.length} paintings`;
  $('.done-title').textContent = `Thank you, ${first}!`;
  $('.done-text').textContent =
    `Order ${number} for ${works} (${formatPrice(total)}) is confirmed. ` +
    `A confirmation would be sent to ${order.email.trim()}.`;
  cart.clear();
  showStep('done');
});

renderBadge();
