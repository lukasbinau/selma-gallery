// Hash router between the front page and the 3D gallery. GitHub Pages has no
// SPA fallback, so everything lives in the hash:
//
//   #top | #vaerker | #processen   the front page (sections)
//   #galleri                        the gallery, walked into from the door
//   #galleri/<id>                   the gallery, standing in front of a work
//
// Entering the gallery is the only pushState; moving between works inside it
// is replaceState. popstate is the single source of truth, so Back always
// leaves the room and Forward re-enters. A state machine keeps transitions
// atomic: front → entering → galleri → leaving → front.
import data from './vaerker.json';
import artMeta from './art-meta.json';
import { toast } from './toast.js';
import { openContact, closeContact, isContactOpen } from './contact.js';
import { currentSection, scrollToSection, setThemeColor, SECTION_COLOUR } from './front.js';

const WORKS = data.vaerker;
const indexOf = (id) => WORKS.findIndex((w) => w.id === id);

const html = document.documentElement;
const front = ['header', 'main', 'footer'].map((s) => document.querySelector(s)).filter(Boolean);
const root = document.getElementById('galleri');
const wipe = document.querySelector('.wipe');
const galleriTab = document.querySelector('[data-galleri]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// The room's background per theme (see gallery.css), for the browser chrome
const ROOM_COLOUR = { evening: '#230a66', daylight: '#e3dbf5' };
const roomColour = (theme = root.dataset.theme) => ROOM_COLOUR[theme] || ROOM_COLOUR.evening;
const STRIP_COLOUR = { top: '#5e17eb', vaerker: '#f767d3', processen: '#fcd23b' };
const WIPE_MS = 480;
const EXPOSURE_MS = 900;

// ---------------------------------------------------------------- state
let view = 'front'; // front | entering | galleri | leaving
let gallery = null;
let galleryPromise = null;
let chunkPromise = null;
let pending = null; // a popstate that arrived mid-transition
let fromEl = null; // the card (or tab) we entered from; focus returns to it
let savedScroll = 0;

// A visitor who arrived straight on #galleri has no front state under the
// gallery's history entry. That entry is marked cold (also when it is reached
// again with Back/Forward), so the exit control pushes a front state instead
// of going back out of the site.
const isCold = () => !!history.state?.cold;

const parseHash = (hash = location.hash) => {
  const m = /^#galleri(?:\/([\w-]+))?$/.exec(hash);
  if (m) {
    const id = m[1] || null;
    const index = id ? indexOf(id) : -1;
    return { view: 'galleri', id: index >= 0 ? id : null, index: Math.max(index, 0), intro: !id };
  }
  const section = hash.slice(1);
  return { view: 'front', section: SECTION_COLOUR[section] ? section : null };
};

// ---------------------------------------------------------------- the gallery module
let webgl = null;
function hasWebGL() {
  if (webgl === null) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

// Dynamic import keeps three.js out of the front page's entry chunk
const loadChunk = () => (chunkPromise ??= import('./gallery/gallery.js'));

export function ensureGallery() {
  if (!galleryPromise) {
    galleryPromise = (async () => {
      if (!hasWebGL()) throw new Error('no-webgl');
      const { createGallery } = await loadChunk();
      const g = await createGallery({ root, works: WORKS, artMeta });
      g.on('index', ({ index }) => {
        if (view === 'front' || view === 'leaving') return;
        const w = WORKS[index];
        if (w) history.replaceState({ ...history.state, view: 'galleri', id: w.id }, '', `#galleri/${w.id}`);
      });
      g.on('exit', () => {
        if (!isContactOpen()) leave();
      });
      g.on('contact', ({ id }) => openContact({ id }));
      gallery = g;
      return g;
    })().catch((err) => {
      galleryPromise = null; // a network hiccup can be retried
      throw err;
    });
  }
  return galleryPromise;
}

// Prefetch the chunk once the works come into view, build the room on intent
const vaerker = document.getElementById('vaerker');
if (vaerker) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (navigator.connection?.saveData) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 800));
    idle(() => loadChunk().catch(() => {}));
  });
  io.observe(vaerker);
}
const onIntent = (e) => {
  if (!e.target.closest?.('.vaerk, [data-galleri]')) return;
  ensureGallery().catch(() => {});
};
document.addEventListener('pointerenter', onIntent, { capture: true, passive: true });
document.addEventListener('focusin', onIntent, { passive: true });
document.addEventListener('touchstart', onIntent, { capture: true, passive: true });

// ---------------------------------------------------------------- helpers
// Animations and rAF stall in a background tab; a timer always lets the state
// machine finish, so a transition can never stay stuck half-way.
function animate(el, keyframes, options) {
  el.getAnimations().forEach((a) => a.cancel());
  const anim = el.animate(keyframes, { fill: 'forwards', ...options });
  const settled = anim.finished.catch(() => {});
  const fallback = new Promise((r) => setTimeout(r, (options.duration || 0) + 400)).then(() => anim.finish());
  return Promise.race([settled, fallback]);
}

function rampExposure(g, from, to, ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      g.setExposure(to);
      resolve();
    };
    const tick = (t) => {
      if (done) return;
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      g.setExposure(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
    setTimeout(finish, ms + 400);
  });
}

function lockScroll() {
  savedScroll = scrollY;
  html.dataset.view = 'galleri';
  document.body.style.top = `-${savedScroll}px`;
}
function unlockScroll() {
  delete html.dataset.view;
  document.body.style.top = '';
  scrollTo({ top: savedScroll, left: 0, behavior: 'instant' });
}

function setFrontInert(on) {
  front.forEach((n) => (n.inert = on));
  root.inert = !on;
}

function pulse(el) {
  el.classList.remove('is-pulse');
  void el.offsetWidth;
  el.classList.add('is-pulse');
  el.addEventListener('animationend', () => el.classList.remove('is-pulse'), { once: true });
}

// The room theme can change from the gallery's settings popover
addEventListener('settings:change', (e) => {
  if (e.detail?.key !== 'theme') return;
  if (view === 'galleri' || view === 'entering') setThemeColor(roomColour(e.detail.value));
});

// ---------------------------------------------------------------- transitions
// Exported so the lead can swap them for the FLIP version later.
export async function enterGallery({ index = 0, intro = false, fromEl: from = null, instant = false } = {}) {
  if (view !== 'front') return false;
  view = 'entering';
  closeContact();
  fromEl = from || galleriTab;
  wipe.classList.add('is-active');
  wipe.style.background = instant ? roomColour() : STRIP_COLOUR[currentSection()] || STRIP_COLOUR.top;

  // The wipe scales in from the left while the room is built and shown behind it
  const fade = reduced.matches;
  const wipeIn = instant
    ? animate(wipe, [{ opacity: 1, transform: 'scaleX(1)' }], { duration: 0 })
    : fade
      ? animate(wipe, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 200 })
      : animate(wipe, [{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], {
          duration: WIPE_MS,
          easing: 'cubic-bezier(0.7, 0, 0.2, 1)',
        });
  const slow = setTimeout(() => wipe.classList.add('is-loading'), WIPE_MS);

  let g;
  try {
    g = await ensureGallery();
    g.setExposure(0.2);
    await Promise.all([wipeIn, g.show({ index, intro })]);
  } catch (err) {
    clearTimeout(slow);
    wipe.classList.remove('is-loading');
    console.warn('galleri', err);
    // Stay on the front page. The gallery entry becomes #vaerker in place
    // (never history.back(): a visitor without WebGL could otherwise bounce
    // between two gallery entries).
    const wasCold = isCold();
    history.replaceState({ view: 'front' }, '', '#vaerker');
    if (wasCold) scrollToSection('vaerker', 'instant');
    await animate(wipe, [{ opacity: 0 }], { duration: 200 });
    wipe.classList.remove('is-active');
    view = 'front';
    toast('Galleriet kunne ikke åbnes');
    flush();
    return false;
  }
  clearTimeout(slow);
  wipe.classList.remove('is-loading');

  lockScroll();
  setFrontInert(true);
  setThemeColor(roomColour());
  root.focus({ preventScroll: true });

  // Reveal: the wipe leaves to the right while the picture spots come up
  wipe.style.transformOrigin = 'right';
  const wipeOut = fade
    ? animate(wipe, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 })
    : animate(wipe, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration: WIPE_MS,
        easing: 'cubic-bezier(0.7, 0, 0.2, 1)',
      });
  await Promise.all([wipeOut, rampExposure(g, 0.2, 1, fade ? 200 : EXPOSURE_MS)]);
  wipe.style.transformOrigin = 'left';
  wipe.classList.remove('is-active');
  view = 'galleri';
  flush();
  return true;
}

export async function exitGallery({ section = null } = {}) {
  if (view !== 'galleri') return false;
  view = 'leaving';
  closeContact();
  wipe.classList.add('is-active');
  wipe.style.background = STRIP_COLOUR[currentSection()] || STRIP_COLOUR.top;
  await animate(wipe, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 200 });

  gallery?.hide();
  setFrontInert(false);
  unlockScroll();
  setThemeColor(SECTION_COLOUR[currentSection()]);

  // Back to where you came from: the card centred, focused and pulsed
  const target = fromEl && fromEl.isConnected ? fromEl : galleriTab;
  if (section && target === galleriTab) {
    scrollToSection(section, 'instant');
  } else if (target !== galleriTab) {
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  target?.focus({ preventScroll: true });
  if (target && !reduced.matches) pulse(target);

  await animate(wipe, [{ opacity: 1 }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 260 });
  wipe.classList.remove('is-active');
  view = 'front';
  flush();
  return true;
}

// ---------------------------------------------------------------- state machine
function apply(target, extra = {}) {
  if (view === 'entering' || view === 'leaving') {
    pending = { target, extra };
    return;
  }
  if (target.view === 'galleri') {
    if (view === 'front') enterGallery({ index: target.index, intro: target.intro, ...extra });
    else if (gallery && gallery.index !== target.index) gallery.goTo(target.index);
  } else if (view === 'galleri') {
    exitGallery({ section: target.section });
  } else if (target.section && target.section !== currentSection()) {
    scrollToSection(target.section, 'instant');
  }
}

function flush() {
  if (!pending) return;
  const { target, extra } = pending;
  pending = null;
  apply(target, extra);
}

// The gallery's own exit control (← FORSIDE / Escape)
function leave() {
  if (view !== 'galleri') return;
  if (isCold()) {
    history.pushState({ view: 'front' }, '', '#vaerker');
    apply(parseHash('#vaerker'));
  } else {
    history.back();
  }
}

// Entering from the front page: cards and the GALLERI tab
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#galleri"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  if (view !== 'front') return;
  const href = a.getAttribute('href');
  const target = parseHash(href);
  history.pushState({ view: 'galleri', id: target.id }, '', href);
  apply(target, { fromEl: a });
});

addEventListener('popstate', () => apply(parseHash()));

// ---------------------------------------------------------------- boot
history.scrollRestoration = 'manual';
{
  const start = parseHash();
  if (start.view === 'galleri') {
    history.replaceState({ view: 'galleri', id: start.id, cold: true }, '', location.hash);
    enterGallery({ index: start.index, intro: start.intro, instant: true });
  } else if (start.section) {
    scrollToSection(start.section, 'instant');
  }
}

export const currentView = () => view;
