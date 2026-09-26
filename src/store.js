// Small persisted state: viewer settings and the (demo) cart.
// localStorage can be unavailable (private mode, blocked storage), so every
// access is guarded and the site still works without it.
import { paintings } from './paintings.js';

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
};
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));

// ---------------------------------------------------------------- settings
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const settings = {
  theme: 'evening',
  motion: prefersReduced ? 'reduced' : 'full',
  plaques: 'on',
  ...read('selma:settings', {}),
};

export function setSetting(key, value) {
  settings[key] = value;
  write('selma:settings', settings);
  emit('settings:change', { key, value });
}

// ---------------------------------------------------------------- cart
const buyable = (id) => paintings.some((p) => p.id === id && !p.sold);
let ids = read('selma:cart', []).filter(buyable);

export const cart = {
  has: (id) => ids.includes(id),
  count: () => ids.length,
  items: () => ids.map((id) => paintings.find((p) => p.id === id)),
  subtotal: () => cart.items().reduce((sum, p) => sum + p.price, 0),
  add(id) {
    if (!buyable(id) || ids.includes(id)) return;
    ids = [...ids, id];
    this.save();
  },
  remove(id) {
    ids = ids.filter((x) => x !== id);
    this.save();
  },
  clear() {
    ids = [];
    this.save();
  },
  save() {
    write('selma:cart', ids);
    emit('cart:change');
  },
};
