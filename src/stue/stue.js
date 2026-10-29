// "I din stue": see a painting at its true size in a real room, choose a frame
// and a wall, and buy painting + frame as one. Loaded lazily by the router,
// like the gallery; nothing else imports three.js for it.
//
//   const stue = await createStue({ root, works, artMeta });
//   await stue.prepare('markvej');          // hang it (rectAtRest is valid now)
//   await stue.show({ id: 'markvej', from: 'front' });
//   stue.on('exit', () => …);  stue.on('work', ({ id }) => …)  // painting switched inside
//
// The API mirrors the gallery's where the transitions need it: resize(),
// rectAtRest(index), currentRect(), setExposure(k), show(), hide().
import * as THREE from 'three';
import './stue.css';
import { createRoom, viewsFor, VIEWS, TIMES, viewById } from './room.js';
import { WALLS, wallpaperSwatch } from './wallpapers.js';
import { offersFor, workSize, mediumOf, priceOf, formatKr, sizeLabel, NONE } from './catalogue.js';
import { samplePalette } from './palette.js';
import { outerOf } from './framing.js';
import { openContact, isContactOpen } from '../contact.js';
import { buildChrome, fillRail, markRail, centreInRail, STRINGS, TIME_ICONS, viewIcon, esc } from './chrome.js';

const BASE = import.meta.env.BASE_URL;
const artUrl = (id, size) => `${BASE}art/${id}-${size}.jpg`;
const ZERO_RECT = () => ({ x: 0, y: 0, width: 0, height: 0 });

// ------------------------------------------------------------------ preferences
// The visitor's last wall, light and frame, in this browser only (like store.js:
// every access guarded, the view still works without storage).
const PREFS_KEY = 'selma:stue';
function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}
function writePrefs(p) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

function noWebglStue({ on, off }) {
  return {
    webgl: false,
    id: null,
    index: 0,
    prepare: () => Promise.reject(new Error('no-webgl')),
    show: () => Promise.reject(new Error('no-webgl')),
    hide() {},
    on,
    off,
    rectAtRest: ZERO_RECT,
    currentRect: ZERO_RECT,
    setExposure() {},
    resize() {},
    setFrom() {},
  };
}

export async function createStue({ root, works, artMeta = {} }) {
  if (!root) throw new Error('createStue: root mangler');
  const list = Array.isArray(works) ? works : [];

  const listeners = new Map();
  const on = (e, fn) => (listeners.get(e) || listeners.set(e, new Set()).get(e)).add(fn);
  const off = (e, fn) => listeners.get(e)?.delete(fn);
  const emit = (e, d) =>
    listeners.get(e)?.forEach((fn) => {
      try {
        fn(d);
      } catch (err) {
        console.error(err);
      }
    });

  const ui = buildChrome(root);
  const q = new URLSearchParams(location.search).get('quality');
  const mobile = q ? q === 'mobile' : matchMedia('(pointer: coarse)').matches || Math.min(screen.width || 0, screen.height || 0) < 700;

  let room;
  try {
    room = createRoom({ canvas: ui.canvas, overlay: ui.fade, mobile });
  } catch (err) {
    console.warn('stue', err);
    root.replaceChildren();
    return noWebglStue({ on, off });
  }

  // ---------------------------------------------------------------- state
  const prefs = readPrefs();
  const state = {
    id: null,
    index: 0,
    work: null,
    size: null,
    offers: [],
    offer: null,
    views: [VIEWS[0]],
    viewId: VIEWS[0].id,
    wallId: WALLS.some((w) => w.id === prefs.wall) ? prefs.wall : WALLS[0].id,
    timeId: TIMES.some((t) => t.id === prefs.time) ? prefs.time : 'dag',
    frameId: typeof prefs.frame === 'string' ? prefs.frame : null,
    tab: 'work',
    from: 'front',
    shown: false,
  };
  const savePrefs = () => writePrefs({ wall: state.wallId, time: state.timeId, frame: state.frameId });

  room.setWall(WALLS.find((w) => w.id === state.wallId));
  room.setTime(state.timeId);

  // ---------------------------------------------------------------- the work
  const loader = new THREE.TextureLoader();
  const fullSize = mobile || Math.min(innerWidth, innerHeight) * devicePixelRatio < 1400 ? 1024 : 2048;
  const loadTexture = (url) =>
    new Promise((resolve, reject) => {
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = Math.min(8, room.renderer.capabilities.getMaxAnisotropy());
          resolve(t);
        },
        undefined,
        reject,
      );
    });

  // Average colour along the photo's border: the painted edge of a canvas
  function edgeColour(img) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 16, 16);
      const d = g.getImageData(0, 0, 16, 16).data;
      let r = 0;
      let gg = 0;
      let b = 0;
      let n = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (x > 0 && x < 15 && y > 0 && y < 15) continue;
          const i = (y * 16 + x) * 4;
          r += d[i];
          gg += d[i + 1];
          b += d[i + 2];
          n++;
        }
      }
      return `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
    } catch {
      return '#d8d0c2';
    }
  }

  function chooseOffer(offers, work) {
    const pref = offers.find((o) => o.frame.id === state.frameId);
    if (pref) return pref;
    // Paper looks unfinished without a frame: start with a calm one (a
    // passepartout, then oak, then black). Canvas and board start as they are.
    if (mediumOf(work) === 'paper' && offers.length > 1) {
      const framed = offers.slice(1);
      return (
        framed.find((o) => o.mat) ||
        framed.find((o) => /eg/i.test(o.frame.id)) ||
        framed.find((o) => /sort/i.test(o.frame.id)) ||
        framed[0]
      );
    }
    return offers[0];
  }

  // Everything about a work that does not need the GPU
  function specFor(id) {
    const index = Math.max(
      0,
      list.findIndex((w) => w.id === id),
    );
    const work = list[index];
    const meta = artMeta[work.id];
    const size = workSize(work, meta);
    const offers = offersFor(work, meta);
    // The room is staged for the work's largest frame (see room.hang)
    const ref = offers.reduce(
      (m, o) => {
        const s = outerOf(size, o);
        return { w: Math.max(m.w, s.w), h: Math.max(m.h, s.h) };
      },
      { w: 0, h: 0 },
    );
    return { index, work, size, offers, ref, medium: mediumOf(work), bare: work.ramme === 'bare' };
  }

  let loadToken = 0;
  // Load the photo and hang the work (no crossfade): used before showing
  async function prepare(id) {
    const token = ++loadToken;
    const spec = specFor(id);
    let tex = null;
    try {
      tex = await loadTexture(artUrl(spec.work.id, fullSize));
    } catch {
      try {
        tex = await loadTexture(artUrl(spec.work.id, 640));
      } catch (err) {
        console.warn('stue: billede kunne ikke hentes', err);
      }
    }
    if (token !== loadToken) {
      tex?.dispose();
      return false;
    }
    applySpec(spec, tex, { keepView: false });
    room.setViewInstant(state.viewId);
    return true;
  }

  function applySpec(spec, tex, { keepView }) {
    Object.assign(state, { id: spec.work.id, index: spec.index, work: spec.work, size: spec.size, offers: spec.offers });
    state.offer = chooseOffer(spec.offers, spec.work);
    if (tex) {
      room.setArtTexture(tex);
      room.setPalette(samplePalette(tex.image));
      room.setCanvasEdge(edgeColour(tex.image));
    }
    const outer = room.hang({ size: spec.size, medium: spec.medium, bare: spec.bare, offer: state.offer, ref: spec.ref });
    pickView(outer, keepView);
    renderAll();
  }

  function pickView(outer, keepView) {
    const { list: fits, best } = viewsFor(outer);
    state.views = fits;
    if (!keepView || !fits.some((v) => v.id === state.viewId)) state.viewId = best.id;
  }

  // Switch painting inside the view: crossfade, keep frame/wall/light choices
  let switchTimer = 0;
  function switchWork(id, { silent = false } = {}) {
    if (id === state.id) return;
    clearTimeout(switchTimer);
    markRail(ui.rails.work, id);
    switchTimer = setTimeout(async () => {
      const token = ++loadToken;
      const spec = specFor(id);
      root.classList.add('is-busy');
      let tex = null;
      try {
        tex = await loadTexture(artUrl(spec.work.id, fullSize));
      } catch {
        tex = await loadTexture(artUrl(spec.work.id, 640)).catch(() => null);
        if (!tex) toast(STRINGS.failed);
      }
      if (token !== loadToken) {
        tex?.dispose();
        return;
      }
      root.classList.remove('is-busy');
      const prevView = state.viewId;
      await room.change(() => {
        applySpec(spec, tex, { keepView: true });
        if (state.viewId !== prevView) room.setViewInstant(state.viewId);
      });
      if (!silent) emit('work', { id: state.id, index: state.index });
      announce(`${spec.work.titel}`);
    }, 120);
  }

  async function setOffer(frameId) {
    const offer = state.offers.find((o) => o.frame.id === frameId);
    if (!offer || offer === state.offer) return;
    state.offer = offer;
    state.frameId = frameId;
    savePrefs();
    markRail(ui.rails.frame, frameId);
    renderSummary();
    const spec = specFor(state.id);
    const prevView = state.viewId;
    await room.change(() => {
      const outer = room.hang({ size: spec.size, medium: spec.medium, bare: spec.bare, offer, ref: spec.ref });
      pickView(outer, true);
      if (state.viewId !== prevView) room.setViewInstant(state.viewId);
      renderViews();
    });
    announce(offer.frame.none ? STRINGS.noFrame : offer.label);
  }

  async function setWall(id) {
    const wall = WALLS.find((w) => w.id === id);
    if (!wall || id === state.wallId) return;
    state.wallId = id;
    savePrefs();
    markRail(ui.rails.wall, id);
    await room.change(() => room.setWall(wall));
    announce(wall.name);
  }

  async function setTime(id) {
    if (id === state.timeId) return;
    state.timeId = id;
    savePrefs();
    markRail(ui.rails.time, id);
    root.dataset.time = id;
    await room.change(() => room.setTime(id), { ms: 700 });
    announce(TIMES.find((t) => t.id === id)?.name || '');
  }

  async function setView(id) {
    if (id === state.viewId || !state.views.some((v) => v.id === id)) return;
    state.viewId = id;
    markRail(ui.rails.view, id);
    await room.setView(id);
    announce(viewById(id).name);
  }

  // ---------------------------------------------------------------- UI
  const thumb = (id) => artUrl(id, 640);
  // "Sort ramme, 30 × 40 cm med passepartout" – unless the name already says so
  const offerText = (o) => `${o.label}, ${sizeLabel(o.inner)}${o.mat && !/passepartout/i.test(o.label) ? ` ${STRINGS.withMat}` : ''}`;
  // "Sort blanklakeret træramme, smal 13 mm" → "Sort blanklakeret træramme" in the rail
  const shortName = (name) => String(name).split(',')[0];
  function frameVisual(offer) {
    const f = offer.frame;
    const img = `<img src="${thumb(state.id)}" alt="" loading="lazy" decoding="async">`;
    if (f.none) return `<span class="stue__fp stue__fp--none">${img}</span>`;
    const px = Math.max(2, Math.round((f.profileWidthMm || 13) / 4));
    const mat = offer.mat ? ' stue__fp--mat' : '';
    return `<span class="stue__fp${mat}" style="--fc:${esc(f.colour || '#222')};--fw:${px}px">${img}</span>`;
  }

  function renderWorks() {
    fillRail(
      ui.rails.work,
      list.map((w) => ({
        id: w.id,
        label: w.titel,
        aria: `${w.titel}${w.solgt ? `, ${STRINGS.sold.toLowerCase()}` : ''}`,
        html: `<img src="${thumb(w.id)}" alt="" loading="lazy" decoding="async">${w.solgt ? '<i class="stue__dot" aria-hidden="true"></i>' : ''}`,
      })),
      state.id,
    );
  }

  function renderFrames() {
    fillRail(
      ui.rails.frame,
      state.offers.map((o) => ({
        id: o.frame.id,
        label: o.frame.none ? STRINGS.noFrame : shortName(o.label),
        sub: o.frame.none ? '' : `${sizeLabel(o.inner)}${o.mat ? ' + pp.' : ''} · ${formatKr(o.price)}`,
        aria: o.frame.none
          ? STRINGS.noFrame
          : `${offerText(o)}, ${formatKr(o.price)}`,
        html: frameVisual(o),
      })),
      state.offer?.frame.id,
    );
  }

  const swatches = new Map();
  function renderWalls() {
    fillRail(
      ui.rails.wall,
      WALLS.map((w) => {
        let bg = w.colour;
        if (w.kind === 'paper') {
          if (!swatches.has(w.id)) swatches.set(w.id, wallpaperSwatch(w, 128));
          bg = `url(${swatches.get(w.id)}) center / cover`;
        }
        return { id: w.id, label: w.name, sub: w.kind === 'paper' ? 'Tapet' : 'Maling', html: `<span class="stue__sw" style="background:${bg}"></span>` };
      }),
      state.wallId,
    );
  }

  function renderTimes() {
    fillRail(
      ui.rails.time,
      TIMES.map((t) => ({ id: t.id, label: t.name, html: TIME_ICONS[t.id] })),
      state.timeId,
    );
  }

  const VIEW_SUB = { stue: 'Over sofaen', spise: 'Over skænken' };
  function renderViews() {
    const tab = ui.tabs.find((t) => t.dataset.tab === 'view');
    const many = state.views.length > 1;
    tab.hidden = !many;
    if (!many && state.tab === 'view') selectTab('work');
    fillRail(
      ui.rails.view,
      state.views.map((v) => ({ id: v.id, label: v.name, sub: VIEW_SUB[v.id] || '', html: viewIcon(v.id) })),
      state.viewId,
    );
  }

  function renderSummary() {
    const w = state.work;
    if (!w) return;
    const year = w.aar ? ` (${w.aar})` : '';
    ui.title.textContent = `${w.titel}${year}`;
    const pris = priceOf(w);
    const o = state.offer;
    const sizeText = `${sizeLabel(state.size)}${state.size.estimated ? ' (anslået)' : ''}`;
    const lines = [];
    if (w.solgt) {
      lines.push(`${STRINGS.painting} ${sizeText}`);
    } else {
      lines.push(`${STRINGS.painting} ${sizeText} · ${pris ? formatKr(pris) : STRINGS.priceOnRequest.toLowerCase()}`);
    }
    if (o && !o.frame.none) {
      lines.push(`${offerText(o)} · ${formatKr(o.price)}`);
    } else {
      lines.push(STRINGS.noFrame);
    }
    ui.lines.innerHTML = lines.map((l) => `<span>${esc(l)}</span>`).join('');
    ui.cta.hidden = !!w.solgt;
    ui.sold.hidden = !w.solgt;
    if (w.solgt) ui.total.textContent = '';
    else if (pris) ui.total.innerHTML = `<span>${STRINGS.total}</span> ${esc(formatKr(pris + (o?.price || 0)))}`;
    else ui.total.innerHTML = `<span>${STRINGS.priceOnRequest}</span>`;
    ui.note.hidden = !state.size.estimated;
  }

  function renderAll() {
    renderSummary();
    renderFrames();
    renderViews();
    markRail(ui.rails.work, state.id, { scroll: false });
  }

  let liveTimer;
  function announce(text) {
    clearTimeout(liveTimer);
    ui.live.textContent = '';
    liveTimer = setTimeout(() => (ui.live.textContent = text), 60);
  }
  const toastEl = document.querySelector('.toast');
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    setTimeout(() => toastEl.classList.remove('is-visible'), 2400);
  }

  // ---- tabs
  function selectTab(tab, { focus = false } = {}) {
    state.tab = tab;
    ui.tabs.forEach((t) => {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    Object.entries(ui.rails).forEach(([k, r]) => (r.hidden = k !== tab));
    const sel = ui.rails[tab].querySelector('[aria-checked="true"]');
    if (sel) centreInRail(ui.rails[tab], sel, 'instant');
  }
  ui.tabs.forEach((t) =>
    t.addEventListener('click', () => {
      // on a phone, a tab of a folded sheet opens it on that tab
      if (!state.sheetOpen) setSheet(true);
      selectTab(t.dataset.tab);
    }),
  );

  // ---- phones: the panel is a bottom sheet. Folded, it keeps the work's name,
  // the price, the buy button and the tab bar; open, the choices too. The
  // handle (or a flick up/down on the sheet's top) folds and opens it.
  const phone = matchMedia('(max-width: 640px) and (min-height: 501px)');
  state.sheetOpen = true;
  function setSheet(open) {
    state.sheetOpen = open;
    ui.panel.classList.toggle('is-folded', !open);
    ui.handle.setAttribute('aria-expanded', String(open));
  }
  ui.handle.addEventListener('click', () => setSheet(!state.sheetOpen));
  const flick = { id: null, y: 0 };
  ui.panel.addEventListener('pointerdown', (e) => {
    if (!phone.matches || e.target.closest('.stue__rail, button:not(.stue__handle)')) return;
    Object.assign(flick, { id: e.pointerId, y: e.clientY });
  });
  ui.panel.addEventListener('pointerup', (e) => {
    if (e.pointerId !== flick.id) return;
    flick.id = null;
    const dy = e.clientY - flick.y;
    if (Math.abs(dy) > 30) setSheet(dy < 0);
  });
  phone.addEventListener?.('change', () => {
    if (!phone.matches) setSheet(true);
  });

  // ---- the panel's look on wide screens, while Selma chooses one:
  // ?panel=a (centred card), b (two columns), c (side panel)
  const variant = new URLSearchParams(location.search).get('panel');
  root.dataset.panel = ['a', 'b', 'c'].includes(variant) ? variant : 'a';
  // the side panel: variant c on a wide screen, and any short landscape screen
  // (a phone on its side), where a panel along the bottom would hide the room
  const wideSide = matchMedia('(min-width: 900px)');
  const shortSide = matchMedia('(max-height: 500px) and (orientation: landscape)');
  const placePanel = () => root.classList.toggle('is-side', (root.dataset.panel === 'c' && wideSide.matches) || shortSide.matches);
  placePanel();
  wideSide.addEventListener?.('change', placePanel);
  shortSide.addEventListener?.('change', placePanel);
  ui.tabs[0].parentElement.addEventListener('keydown', (e) => {
    const visible = ui.tabs.filter((t) => !t.hidden);
    const i = visible.findIndex((t) => t.dataset.tab === state.tab);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % visible.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + visible.length) % visible.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = visible.length - 1;
    if (j < 0) return;
    e.preventDefault();
    selectTab(visible[j].dataset.tab, { focus: true });
  });

  // ---- rails: click, arrow keys (radio semantics), wheel → horizontal scroll
  const choose = { work: switchWork, frame: setOffer, wall: setWall, time: setTime, view: setView };
  Object.entries(ui.rails).forEach(([k, rail]) => {
    rail.addEventListener('click', (e) => {
      const b = e.target.closest('.stue__opt');
      if (!b) return;
      choose[k](b.dataset.id);
    });
    rail.addEventListener('keydown', (e) => {
      const opts = [...rail.querySelectorAll('.stue__opt')];
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(opts.length - 1, i + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1);
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = opts.length - 1;
      if (j < 0 || j === i) return;
      e.preventDefault();
      opts[j].focus({ preventScroll: true });
      centreInRail(rail, opts[j]);
      choose[k](opts[j].dataset.id);
    });
    rail.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // trackpads scroll sideways by themselves
        if (rail.scrollWidth <= rail.clientWidth) return;
        e.preventDefault();
        rail.scrollBy({ left: e.deltaY * (e.deltaMode === 1 ? 32 : 1), behavior: 'auto' });
      },
      { passive: false },
    );
  });

  ui.cta.addEventListener('click', () => {
    const o = state.offer;
    const frame =
      o && !o.frame.none
        ? { label: offerText(o), price: o.price }
        : null;
    openContact({ id: state.id, from: ui.cta, frame });
  });
  ui.back.addEventListener('click', () => emit('exit'));

  // ---- angled view ⇄ straight on: swipe the room, the edge button, ← →
  function setAngle(angle) {
    if (angle === room.angle) return;
    room.setAngle(angle);
    renderAngle();
    announce(STRINGS.angleLabel[angle]);
  }
  function renderAngle() {
    const to = room.angle === 'forfra' ? 'vinkel' : 'forfra';
    ui.angle.dataset.to = to;
    ui.angle.setAttribute('aria-label', STRINGS.angleLabel[to]);
    ui.angle.querySelector('.stue__angle-label').textContent = STRINGS.angle[to];
  }
  ui.angle.addEventListener('click', () => setAngle(ui.angle.dataset.to));
  const swipe = { id: null, x: 0, y: 0, t: 0 };
  ui.canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) return;
    Object.assign(swipe, { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() });
  });
  ui.canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== swipe.id) return;
    swipe.id = null;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5 || performance.now() - swipe.t > 900) return;
    // the finger pulls the next view in from the side the button is on
    setAngle(dx < 0 ? 'forfra' : 'vinkel');
  });
  ui.canvas.addEventListener('pointercancel', () => (swipe.id = null));

  function onKey(e) {
    if (!state.shown || isContactOpen()) return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest?.('.stue__rail, .stue__tabs')) {
      e.preventDefault();
      setAngle(e.key === 'ArrowRight' ? 'forfra' : 'vinkel');
      return;
    }
    if (e.key !== 'Escape') return;
    const t = e.target;
    if (t && t !== document.body && t !== document.documentElement && !root.contains(t)) return;
    e.preventDefault();
    emit('exit');
  }
  // the page behind must not scroll under the room
  root.addEventListener('wheel', (e) => {
    if (!e.target.closest('.stue__rail')) e.preventDefault();
  }, { passive: false });

  // ---------------------------------------------------------------- layout
  // The room's framing leaves the top bar and the panel free
  function measure() {
    const r = root.getBoundingClientRect();
    const w = r.width || innerWidth;
    const h = r.height || innerHeight;
    const panel = ui.panel.getBoundingClientRect();
    const top = ui.top.getBoundingClientRect();
    const visible = !root.hidden && panel.height > 0;
    let bottom = visible ? Math.max(0, r.bottom - panel.top) : Math.min(300, h * 0.36);
    let right = 0;
    // a side panel (variant c) takes width, not height
    if (visible && panel.left > r.left + w / 2) {
      right = Math.max(0, r.right - panel.left + 12);
      bottom = Math.round(h * 0.2); // frame it as if a panel were below: the sofa keeps its place
    }
    // a folded sheet frames the room as if open, so folding never moves it
    if (visible && !state.sheetOpen && state.openBottom) bottom = state.openBottom;
    else if (visible) state.openBottom = bottom;
    const insetTop = visible ? top.bottom - r.top : 56;
    room.setInsets({ top: insetTop, bottom, left: 0, right });
    // the angle button sits in a bottom corner of the free band, clear of the work
    root.style.setProperty('--band-bottom', `${Math.round(h - (right ? 18 : bottom))}px`);
    root.style.setProperty('--band-right', `${Math.round(right)}px`);
    return { w, h };
  }
  function resize() {
    placePanel();
    const { w, h } = measure();
    room.resize(w, h);
  }
  addEventListener('resize', () => {
    if (!innerWidth || !innerHeight || root.hidden) return;
    resize();
  });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!root.hidden) resize();
    });
    ro.observe(root);
    ro.observe(ui.panel);
  }

  // ---------------------------------------------------------------- show / hide
  function setFrom(from) {
    state.from = from === 'galleri' ? 'galleri' : 'front';
    ui.back.textContent = state.from === 'galleri' ? STRINGS.backGallery : STRINGS.backFront;
  }

  async function show({ id, from } = {}) {
    if (from) setFrom(from);
    root.hidden = false;
    if (id && id !== state.id) await prepare(id);
    else if (!state.work) await prepare(list[0]?.id);
    resize();
    room.show();
    room.renderNow();
    if (!state.shown) {
      state.shown = true;
      addEventListener('keydown', onKey);
    }
    renderAll();
    selectTab(state.tab);
    // one frame for the picture to land (a timer too: rAF stalls in background tabs)
    await new Promise((r) => {
      requestAnimationFrame(() => r());
      setTimeout(r, 120);
    });
    prewarm();
  }

  function hide() {
    if (state.shown) {
      state.shown = false;
      removeEventListener('keydown', onKey);
    }
    clearTimeout(switchTimer);
    room.hide();
    root.hidden = true;
  }

  // Draw the other wallpapers while the visitor looks, so choosing one is instant
  let prewarmed = false;
  function prewarm() {
    if (prewarmed) return;
    prewarmed = true;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    const queue = WALLS.filter((w) => w.kind === 'paper');
    const next = () => {
      const w = queue.shift();
      if (!w) return;
      room.prewarmWall?.(w);
      idle(next);
    };
    idle(next);
  }

  // ---------------------------------------------------------------- build
  renderWorks();
  renderWalls();
  renderTimes();
  root.dataset.time = state.timeId;
  // compile every shader now, off the critical path where the browser allows it
  try {
    await room.renderer.compileAsync(room.scene, room.camera);
  } catch {
    /* compileAsync is an optimisation only */
  }

  const stue = {
    webgl: true,
    get id() {
      return state.id;
    },
    get index() {
      return state.index;
    },
    prepare,
    show,
    hide,
    // another painting, inside the room (crossfade); no 'work' event comes back
    select: (id) => switchWork(id, { silent: true }),
    on,
    off,
    setFrom,
    resize,
    rectAtRest(target) {
      const id = typeof target === 'number' ? list[target]?.id : target;
      if (id && id !== state.id) return ZERO_RECT();
      measure();
      const r = room.artRect();
      const c = root.getBoundingClientRect();
      return { x: r.x + c.left, y: r.y + c.top, width: r.width, height: r.height };
    },
    currentRect() {
      return this.rectAtRest(state.id);
    },
    setExposure: (k) => room.setExposure(k),
    debug: { room, state, NONE },
  };
  window.__stue = stue;
  return stue;
}
