// Hash router between the front page, the 3D gallery and "I din stue" (the
// room view). GitHub Pages has no SPA fallback, so everything lives in the hash:
//
//   #top | #vaerker | #om-mig      the front page (sections)
//   #galleri                        the gallery, walked into from the door
//   #galleri/<id>                   the gallery, standing in front of a work
//   #stue/<id>                      a work hung in a living room
//
// Entering the gallery or the room is a pushState; moving between works inside
// either is replaceState. popstate is the single source of truth, so Back
// always leaves a view (to where you came from) and Forward re-enters. A state
// machine keeps transitions atomic: a view is entered or left only from rest
// (front | galleri | stue), and anything that arrives mid-way (entering |
// leaving) waits in `pending` until the transition has finished.
import data from './vaerker.json';
import artMeta from './art-meta.json';
import { toast } from './toast.js';
import { openContact, closeContact, isContactOpen } from './contact.js';
import { flyIn, flyOut, flyAcross, liftOff, nextFrame } from './transition.js';
import { artFormat } from './art-format.js';
import { currentSection, scrollToSection, setThemeColor, SECTION_COLOUR } from './front.js';

const WORKS = data.vaerker;
const indexOf = (id) => WORKS.findIndex((w) => w.id === id);

const html = document.documentElement;
const front = ['header', 'main', 'footer'].map((s) => document.querySelector(s)).filter(Boolean);
const root = document.getElementById('galleri');
const stueRoot = document.getElementById('stue');
const wipe = document.querySelector('.wipe');
const wipeText = wipe?.querySelector('.wipe__label')?.firstChild;
const galleriTab = document.querySelector('[data-galleri]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

// The room's background per theme (see gallery.css), for the browser chrome
const ROOM_COLOUR = { evening: '#230a66', daylight: '#e3dbf5' };
const roomColour = (theme = root.dataset.theme) => ROOM_COLOUR[theme] || ROOM_COLOUR.evening;
const STUE_COLOUR = '#e8e2d8'; // the living room's warm white (stue.css)
const STRIP_COLOUR = { top: '#5e17eb', vaerker: '#f767d3', 'om-mig': '#fcd23b' };
const WIPE_MS = 480;
const EXPOSURE_MS = 900;
const LOADING = { galleri: 'Henter galleriet', stue: 'Indretter stuen' };
// The photo "I din stue" shows (it loads the JPEGs), for the ghost that leaves it
const artUrl = (id) => `${import.meta.env.BASE_URL}art/${id}-1024.jpg`;

// ---------------------------------------------------------------- state
let view = 'front'; // front | galleri | stue at rest; entering | leaving in between
let gallery = null;
let galleryPromise = null;
let chunkPromise = null;
let stue = null;
let stuePromise = null;
let stueChunkPromise = null;
let pending = null; // a popstate that arrived mid-transition
let fromEl = null; // the card (or tab) we entered the gallery from; focus returns to it
let stueFromEl = null; // the "I din stue" link we entered the room from
let savedScroll = 0;

// A visitor who arrived straight on #galleri or #stue has no front state under
// that history entry. The entry is marked cold (also when it is reached again
// with Back/Forward), so the exit control pushes a front state instead of
// going back out of the site.
const isCold = () => !!history.state?.cold;

// Is the current history entry still one of `which`? A visitor who pressed
// Back while a view was opening is on another entry by now (its popstate
// waits in `pending`): the URL corrections below must not overwrite that one.
const onEntry = (which) => parseHash().view === which;

const parseHash = (hash = location.hash) => {
  const m = /^#galleri(?:\/([\w-]+))?$/.exec(hash);
  if (m) {
    const id = m[1] || null;
    const index = id ? indexOf(id) : -1;
    return { view: 'galleri', id: index >= 0 ? id : null, index: Math.max(index, 0), intro: !id };
  }
  const s = /^#stue(?:\/([\w-]+))?$/.exec(hash);
  if (s && WORKS.length) {
    const index = Math.max(indexOf(s[1] || ''), 0);
    return { view: 'stue', id: WORKS[index].id, index };
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
const loadStueChunk = () => (stueChunkPromise ??= import('./stue/stue.js'));

export function ensureGallery() {
  if (!galleryPromise) {
    galleryPromise = (async () => {
      if (!hasWebGL()) throw new Error('no-webgl');
      const { createGallery } = await loadChunk();
      const g = await createGallery({ root, works: WORKS, artMeta });
      g.on('index', ({ index }) => {
        if (view !== 'galleri' && view !== 'entering') return;
        const w = WORKS[index];
        if (w && onEntry('galleri')) history.replaceState({ ...history.state, view: 'galleri', id: w.id }, '', `#galleri/${w.id}`);
      });
      g.on('exit', () => {
        if (!isContactOpen()) leave();
      });
      g.on('contact', ({ id }) => openContact({ id }));
      // I DIN STUE on a plaque: the room is a view of its own (pushState)
      g.on('stue', ({ id }) => {
        if (view !== 'galleri' || isContactOpen() || indexOf(id) < 0) return;
        history.pushState({ view: 'stue', id, from: 'galleri' }, '', `#stue/${id}`);
        apply(parseHash());
      });
      gallery = g;
      return g;
    })().catch((err) => {
      galleryPromise = null; // a network hiccup can be retried
      throw err;
    });
  }
  return galleryPromise;
}

export function ensureStue() {
  if (!stuePromise) {
    stuePromise = (async () => {
      if (!hasWebGL() || !stueRoot) throw new Error('no-webgl');
      const { createStue } = await loadStueChunk();
      const s = await createStue({ root: stueRoot, works: WORKS, artMeta });
      if (!s.webgl) throw new Error('no-webgl');
      s.on('exit', () => {
        if (!isContactOpen()) leaveStue();
      });
      // Another painting chosen inside the room: the URL follows (replaceState)
      s.on('work', ({ id }) => {
        if (view !== 'stue') return;
        history.replaceState({ ...history.state, view: 'stue', id }, '', `#stue/${id}`);
      });
      stue = s;
      return s;
    })().catch((err) => {
      stuePromise = null;
      throw err;
    });
  }
  return stuePromise;
}

// Prefetch the chunks once the works come into view, build a view on intent
const vaerker = document.getElementById('vaerker');
if (vaerker) {
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (navigator.connection?.saveData) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 800));
    idle(() => loadChunk().catch(() => {}));
    idle(() => loadStueChunk().catch(() => {}));
    idle(() => artFormat());
  });
  io.observe(vaerker);
}
const onIntent = (e) => {
  const t = e.target.closest?.('.vaerk, .vaerk__stue, [data-galleri]');
  if (!t) return;
  if (t.classList.contains('vaerk__stue')) ensureStue().catch(() => {});
  else ensureGallery().catch(() => {});
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

// Both overlays lock the page the same way (html[data-view='galleri'] also tells
// the contact sheet that an overlay is up, so it keeps the page inert)
function lockScroll() {
  if (html.dataset.view) return;
  savedScroll = scrollY;
  html.dataset.view = 'galleri';
  document.body.style.top = `-${savedScroll}px`;
}
function unlockScroll() {
  delete html.dataset.view;
  document.body.style.top = '';
  scrollTo({ top: savedScroll, left: 0, behavior: 'instant' });
}

// Which layer takes focus and clicks: the page (null), the gallery or the room
function setOverlay(which) {
  front.forEach((n) => (n.inert = !!which));
  root.inert = which !== 'galleri';
  if (stueRoot) stueRoot.inert = which !== 'stue';
}
const setFrontInert = (on) => setOverlay(on ? 'galleri' : null);

function pulse(el) {
  el.classList.remove('is-pulse');
  void el.offsetWidth;
  el.classList.add('is-pulse');
  el.addEventListener('animationend', () => el.classList.remove('is-pulse'), { once: true });
}

const cardFor = (id) => (id ? document.querySelector(`.vaerk[data-id="${CSS.escape(id)}"]`) : null);
const stueLinkFor = (id) => (id ? document.querySelector(`.vaerk__stue[data-stue="${CSS.escape(id)}"]`) : null);
const setWipeLabel = (which) => {
  if (wipeText) wipeText.textContent = LOADING[which] || LOADING.galleri;
};

// The room theme can change from the gallery's settings popover
addEventListener('settings:change', (e) => {
  if (e.detail?.key !== 'theme') return;
  if (view === 'galleri' || (view === 'entering' && !root.hidden)) setThemeColor(roomColour(e.detail.value));
});

// ---------------------------------------------------------------- gallery transitions
// Exported so the lead can swap them for the FLIP version later.
export async function enterGallery({ index = 0, intro = false, fromEl: from = null, instant = false } = {}) {
  if (view !== 'front') return false;
  view = 'entering';
  closeContact();
  fromEl = from || galleriTab;
  setWipeLabel('galleri');
  // From a card the painting itself flies to the wall; otherwise the wipe
  if (!instant && !intro && !reduced.matches && from?.classList?.contains('vaerk')) {
    return enterByFlight({ index, card: from });
  }
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
    // The wipe's first frame goes on screen before anything is loaded or
    // built; from then on it scales in on the compositor, whatever the room costs
    await nextFrame();
    g = await ensureGallery();
    g.setExposure(0.2);
    // The room is built behind the wipe: keep it invisible until the wipe has covered the page
    root.style.visibility = 'hidden';
    const shown = g.show({ index, intro });
    await wipeIn;
    await shown;
    root.style.visibility = '';
  } catch (err) {
    root.style.visibility = '';
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

  // A hash with an unknown id landed on works[0]; make the URL say so
  const standing = WORKS[g.index];
  if (standing && !intro && onEntry('galleri') && parseHash().id !== standing.id) {
    history.replaceState({ ...history.state, view: 'galleri', id: standing.id }, '', `#galleri/${standing.id}`);
  }

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

// Entry from a card: the painting lifts off the card at once, and flies on to
// its place on the wall as soon as the room is ready behind the veil
async function enterByFlight({ index, card }) {
  const lift = hasWebGL() ? liftOff({ card, root, colour: roomColour(), label: LOADING.galleri }) : null;
  let g;
  try {
    if (lift) await lift.shown;
    g = await ensureGallery();
    g.setExposure(0.25);
    lockScroll(); // the page's scrollbar goes; the root takes its final size first
    const flew = await flyIn({ gallery: g, root, index, card, lift, showRoom: () => g.show({ index, intro: false }) });
    if (!flew) {
      // No usable rects (the card's image is gone?): just show the room
      root.style.visibility = '';
      await g.show({ index, intro: false });
      await lift?.fade();
    }
  } catch (err) {
    lift?.drop(); // the painting settles back on its card
    root.style.visibility = '';
    if (html.dataset.view) unlockScroll();
    console.warn('galleri', err);
    const wasCold = isCold();
    history.replaceState({ view: 'front' }, '', '#vaerker');
    if (wasCold) scrollToSection('vaerker', 'instant');
    view = 'front';
    toast('Galleriet kunne ikke åbnes');
    flush();
    return false;
  }
  const standing = WORKS[g.index];
  if (standing && onEntry('galleri') && parseHash().id !== standing.id) {
    history.replaceState({ ...history.state, view: 'galleri', id: standing.id }, '', `#galleri/${standing.id}`);
  }
  setFrontInert(true);
  setThemeColor(roomColour());
  root.focus({ preventScroll: true });
  rampExposure(g, 0.25, 1, 700); // the picture spots come up as the painting settles
  view = 'galleri';
  flush();
  return true;
}

export async function exitGallery({ section = null } = {}) {
  if (view !== 'galleri') return false;
  view = 'leaving';
  closeContact();

  // Back to the card we came from: the painting flies out of the room onto it
  const card = fromEl && fromEl.isConnected && fromEl.classList?.contains('vaerk') ? fromEl : null;
  if (card && gallery && !reduced.matches) {
    const flew = await flyOut({
      gallery,
      root,
      card,
      leaveRoom: () => {
        gallery.hide();
        setFrontInert(false);
        unlockScroll();
        setThemeColor(SECTION_COLOUR[currentSection()]);
        card.scrollIntoView({ block: 'center', behavior: 'instant' });
      },
    }).catch((err) => (console.warn('galleri', err), false));
    if (flew || root.hidden) {
      card.focus({ preventScroll: true });
      if (flew) pulse(card);
      view = 'front';
      flush();
      return true;
    }
  }

  await wipeBackToPage({
    leave: () => gallery?.hide(),
    target: fromEl && fromEl.isConnected ? fromEl : galleriTab,
    section,
  });
  view = 'front';
  flush();
  return true;
}

// Cover the page with the wipe, run `leave` (hide the view), restore the page
// with `target` centred, focused and pulsed, then lift the wipe.
async function wipeBackToPage({ leave, target, section }) {
  wipe.classList.add('is-active');
  wipe.style.background = STRIP_COLOUR[currentSection()] || STRIP_COLOUR.top;
  await animate(wipe, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 200 });

  leave();
  setOverlay(null);
  unlockScroll();
  setThemeColor(SECTION_COLOUR[currentSection()]);

  if (section && target === galleriTab) {
    scrollToSection(section, 'instant');
  } else if (target && target !== galleriTab) {
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  target?.focus({ preventScroll: true });
  if (target && !reduced.matches) pulse(target);

  await animate(wipe, [{ opacity: 1 }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 260 });
  wipe.classList.remove('is-active');
}

// ---------------------------------------------------------------- room transitions
// Front page → room. From a card the painting flies to its place above the
// sofa; a cold deep link or reduced motion gets the wipe.
export async function enterStue({ id, fromEl: from = null, instant = false } = {}) {
  if (view !== 'front') return false;
  view = 'entering';
  closeContact();
  stueFromEl = from;
  const index = Math.max(indexOf(id), 0);
  const card = cardFor(id);
  setWipeLabel('stue');

  if (!instant && !reduced.matches && card && card.getBoundingClientRect().height > 0) {
    // The painting lifts off its card at once, while the room loads behind the veil
    const lift = hasWebGL() ? liftOff({ card, root: stueRoot, colour: STUE_COLOUR, label: LOADING.stue }) : null;
    try {
      if (lift) await lift.shown;
      const s = await ensureStue();
      s.setFrom('front');
      s.setExposure(0.3);
      lockScroll();
      // Unhide the room invisibly so its panel can be measured for the framing
      stueRoot.style.visibility = 'hidden';
      stueRoot.hidden = false;
      await s.prepare(id);
      const flew = await flyIn({
        gallery: s,
        root: stueRoot,
        index,
        card,
        colour: STUE_COLOUR,
        lift,
        showRoom: () => s.show({ id, from: 'front' }),
      });
      if (!flew) {
        stueRoot.style.visibility = '';
        await s.show({ id, from: 'front' });
        await lift?.fade();
      }
      return arriveInStue(s, { ramp: 700 });
    } catch (err) {
      lift?.drop();
      return stueFailed(err);
    }
  }

  // The wipe: scales in, the room is built and shown behind it, it scales out
  const fade = reduced.matches;
  wipe.classList.add('is-active');
  wipe.style.background = instant ? STUE_COLOUR : STRIP_COLOUR[currentSection()] || STRIP_COLOUR.top;
  const wipeIn = instant
    ? animate(wipe, [{ opacity: 1, transform: 'scaleX(1)' }], { duration: 0 })
    : fade
      ? animate(wipe, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 200 })
      : animate(wipe, [{ opacity: 1, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], {
          duration: WIPE_MS,
          easing: 'cubic-bezier(0.7, 0, 0.2, 1)',
        });
  const slow = setTimeout(() => wipe.classList.add('is-loading'), instant ? 0 : WIPE_MS);
  try {
    await nextFrame(); // the wipe is on screen before the room is loaded and built
    const s = await ensureStue();
    s.setFrom('front');
    s.setExposure(0.3);
    await wipeIn;
    lockScroll();
    stueRoot.style.visibility = 'hidden';
    stueRoot.hidden = false;
    await s.show({ id, from: 'front' });
    stueRoot.style.visibility = '';
    clearTimeout(slow);
    wipe.classList.remove('is-loading');
    wipe.style.transformOrigin = 'right';
    const wipeOut = fade
      ? animate(wipe, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 })
      : animate(wipe, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
          duration: WIPE_MS,
          easing: 'cubic-bezier(0.7, 0, 0.2, 1)',
        });
    const arrived = arriveInStue(s, { ramp: fade ? 200 : EXPOSURE_MS, settle: wipeOut });
    await wipeOut;
    wipe.style.transformOrigin = 'left';
    wipe.classList.remove('is-active');
    return arrived;
  } catch (err) {
    clearTimeout(slow);
    wipe.classList.remove('is-loading');
    await animate(wipe, [{ opacity: 0 }], { duration: 200 });
    wipe.classList.remove('is-active');
    return stueFailed(err);
  }
}

async function arriveInStue(s, { ramp = 0, settle = null } = {}) {
  setOverlay('stue');
  setThemeColor(STUE_COLOUR);
  stueRoot.focus({ preventScroll: true });
  const lights = ramp ? rampExposure(s, 0.3, 1, ramp) : (s.setExposure(1), null);
  if (settle) await Promise.all([settle, lights]);
  // The URL names the painting actually shown (an unknown id landed on works[0])
  if (s.id && onEntry('stue') && parseHash().id !== s.id) history.replaceState({ ...history.state, view: 'stue', id: s.id }, '', `#stue/${s.id}`);
  view = 'stue';
  flush();
  return true;
}

// No WebGL or a failed load: stay where we are, with a toast
function stueFailed(err) {
  console.warn('stue', err);
  stueRoot.style.visibility = '';
  stue?.hide();
  if (stueRoot) stueRoot.hidden = true;
  const wasCold = isCold();
  if (view === 'entering' && !root.hidden) {
    // came from the gallery: the room's entry becomes the gallery again
    const id = gallery ? WORKS[gallery.index]?.id : null;
    history.replaceState({ view: 'galleri', id }, '', id ? `#galleri/${id}` : '#galleri');
    view = 'galleri';
  } else {
    if (html.dataset.view && root.hidden) unlockScroll();
    setOverlay(null);
    history.replaceState({ view: 'front' }, '', '#vaerker');
    if (wasCold) scrollToSection('vaerker', 'instant');
    view = 'front';
  }
  toast('Stuen kunne ikke åbnes');
  flush();
  return false;
}

// Room → front page: the painting flies back onto its card (the card of the
// painting shown now, which may not be the one we came in with)
export async function exitStue({ section = null } = {}) {
  if (view !== 'stue') return false;
  view = 'leaving';
  closeContact();
  const card = cardFor(stue?.id);
  const link = stueLinkFor(stue?.id) || (stueFromEl?.isConnected ? stueFromEl : null);
  if (card && stue && !reduced.matches) {
    const flew = await flyOut({
      gallery: stue,
      root: stueRoot,
      card,
      colour: STUE_COLOUR,
      leaveRoom: () => {
        stue.hide();
        setOverlay(null);
        unlockScroll();
        setThemeColor(SECTION_COLOUR[currentSection()]);
        card.scrollIntoView({ block: 'center', behavior: 'instant' });
      },
    }).catch((err) => (console.warn('stue', err), false));
    if (flew || stueRoot.hidden) {
      (link || card).focus({ preventScroll: true });
      if (flew) pulse(card);
      view = 'front';
      flush();
      return true;
    }
  }
  await wipeBackToPage({ leave: () => stue?.hide(), target: card || link || galleriTab, section });
  view = 'front';
  flush();
  return true;
}

// Gallery → room: the painting leaves the gallery wall and settles above the sofa
async function enterStueFromGallery({ id }) {
  if (view !== 'galleri') return false;
  view = 'entering';
  closeContact();
  try {
    // The veil comes up at once; the room loads and is hung behind it
    let s;
    const prepare = async () => {
      s = await ensureStue();
      s.setFrom('galleri');
      s.setExposure(1);
      stueRoot.style.visibility = 'hidden';
      stueRoot.hidden = false;
      await s.prepare(id);
    };
    const change = async () => {
      gallery?.hide();
      stueRoot.style.visibility = '';
      await s.show({ id, from: 'galleri' });
      setOverlay('stue');
      setThemeColor(STUE_COLOUR);
    };
    const from = !reduced.matches && gallery ? gallery.currentRect() : null;
    const src = gallery?.currentSrc?.() || artUrl(id);
    const flew =
      from &&
      (await flyAcross({ from, src, colour: STUE_COLOUR, prepare, change, to: () => s.currentRect(), label: LOADING.stue }));
    if (!flew) await crossfade(STUE_COLOUR, change, prepare, 'stue');
    return arriveInStue(s);
  } catch (err) {
    if (gallery && root.hidden) await gallery.show({ index: gallery.index }).catch(() => {});
    return stueFailed(err);
  }
}

// Room → gallery, standing in front of the painting shown in the room
async function exitStueToGallery() {
  if (view !== 'stue') return false;
  view = 'leaving';
  closeContact();
  const index = Math.max(indexOf(stue?.id), 0);
  try {
    let g;
    const prepare = async () => {
      g = await ensureGallery();
    };
    const change = async () => {
      stue.hide();
      g.setExposure(1);
      await g.show({ index, intro: false });
      setOverlay('galleri');
      setThemeColor(roomColour());
    };
    const from = !reduced.matches ? stue.currentRect() : null;
    const flew =
      from &&
      (await flyAcross({
        from,
        src: artUrl(WORKS[index].id),
        colour: roomColour(),
        prepare,
        change,
        to: () => g.currentRect(),
        label: LOADING.galleri,
      }));
    if (!flew) await crossfade(roomColour(), change, prepare, 'galleri');
  } catch (err) {
    // The gallery could not be built: leave the room for the front page instead
    console.warn('galleri', err);
    view = 'stue';
    toast('Galleriet kunne ikke åbnes');
    history.replaceState({ view: 'front' }, '', '#vaerker');
    return exitStue();
  }
  const w = WORKS[index];
  if (w && onEntry('galleri')) history.replaceState({ ...history.state, view: 'galleri', id: w.id }, '', `#galleri/${w.id}`);
  root.focus({ preventScroll: true });
  view = 'galleri';
  flush();
  return true;
}

// A veil in the next view's colour: up (at once, while `prepare` loads the
// next view), change underneath, down
async function crossfade(colour, change, prepare = null, which = 'galleri') {
  setWipeLabel(which);
  wipe.classList.add('is-active');
  wipe.style.background = colour;
  const slow = setTimeout(() => wipe.classList.add('is-loading'), 700);
  try {
    await Promise.all([
      animate(wipe, [{ opacity: 0, transform: 'scaleX(1)' }, { opacity: 1, transform: 'scaleX(1)' }], { duration: 220 }),
      prepare?.(),
    ]);
  } catch (err) {
    clearTimeout(slow);
    wipe.classList.remove('is-loading');
    await animate(wipe, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 200 });
    wipe.classList.remove('is-active');
    throw err;
  }
  clearTimeout(slow);
  wipe.classList.remove('is-loading');
  await change();
  await animate(wipe, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(1)' }], { duration: 280 });
  wipe.classList.remove('is-active');
}

// ---------------------------------------------------------------- state machine
function apply(target, extra = {}) {
  if (view === 'entering' || view === 'leaving') {
    pending = { target, extra };
    return;
  }
  if (target.view === 'galleri') {
    if (view === 'front') enterGallery({ index: target.index, intro: target.intro, ...extra });
    else if (view === 'stue') exitStueToGallery();
    else if (gallery && gallery.index !== target.index) gallery.goTo(target.index);
  } else if (target.view === 'stue') {
    if (view === 'front') enterStue({ id: target.id, ...extra });
    else if (view === 'galleri') enterStueFromGallery({ id: target.id });
    else if (stue && stue.id !== target.id) stue.select(target.id);
  } else if (view === 'galleri') {
    exitGallery({ section: target.section });
  } else if (view === 'stue') {
    exitStue({ section: target.section });
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

// The room's own exit control (← FORSIDE / ← GALLERI / Escape): back to where
// the visitor came from; a cold entry goes on to the front page
function leaveStue() {
  if (view !== 'stue') return;
  if (isCold()) {
    history.pushState({ view: 'front' }, '', '#vaerker');
    apply(parseHash('#vaerker'));
  } else {
    history.back();
  }
}

const plainClick = (e) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

// Entering from the front page: cards and the GALLERI tab…
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#galleri"]');
  if (!a || !plainClick(e)) return;
  e.preventDefault();
  if (view !== 'front') return;
  const href = a.getAttribute('href');
  const target = parseHash(href);
  history.pushState({ view: 'galleri', id: target.id }, '', href);
  apply(target, { fromEl: a });
});

// …and I DIN STUE under each card
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#stue"]');
  if (!a || !plainClick(e) || a.closest('#stue, #galleri')) return;
  e.preventDefault();
  if (view !== 'front') return;
  const target = parseHash(a.getAttribute('href'));
  history.pushState({ view: 'stue', id: target.id, from: 'front' }, '', `#stue/${target.id}`);
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
  } else if (start.view === 'stue') {
    history.replaceState({ view: 'stue', id: start.id, cold: true }, '', `#stue/${start.id}`);
    enterStue({ id: start.id, instant: true });
  } else if (start.section) {
    scrollToSection(start.section, 'instant');
  }
}

export const currentView = () => view;
