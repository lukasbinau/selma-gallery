// Dev harness for the gallery module alone: /dev-galleri.html (Vite serves it
// from the repo root). Add ?debug to draw the rect contract over the painting.
import { createGallery } from './gallery.js';
import data from '../vaerker.json';
import artMeta from '../art-meta.json';

const works = data.vaerker;
const root = document.getElementById('galleri');
const log = document.querySelector('.log');
const say = (...args) => {
  console.log(...args);
  if (log) log.textContent = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
};

const gallery = await createGallery({ root, works, artMeta });

gallery.on('exit', () => {
  say('exit');
  gallery.hide();
});
gallery.on('contact', (e) => say('contact', e));
gallery.on('stue', (e) => say('stue', e));
gallery.on('index', (e) => say('index', e));
gallery.on('ready', () => say('ready: the textures around you are loaded'));

// Buttons on the stand-in front page: open at a given work
const buttons = document.querySelector('.buttons');
works.forEach((w, i) => {
  const b = document.createElement('button');
  b.textContent = `${i + 1}. ${w.titel}`;
  b.addEventListener('click', () => gallery.show({ index: i }).catch((err) => say('show failed', err.message)));
  buttons.append(b);
});
const intro = document.createElement('button');
intro.textContent = 'Intro (walk in)';
intro.addEventListener('click', () => gallery.show({ index: 0, intro: true }));
buttons.append(intro);

try {
  await gallery.show({ index: 0, intro: true });
  say('shown');
} catch (err) {
  say('show failed:', err.message);
}

// ---------------------------------------------------------------- ?debug
// Two overlays: a solid outline at rectAtRest(index) (where the art should be
// once the camera rests) and a dashed one following currentRect() every frame.
if (location.search.includes('debug')) {
  const mk = (style) => {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;pointer-events:none;z-index:1000;box-sizing:border-box;${style}`;
    document.body.append(el);
    return el;
  };
  const rest = mk('border:2px solid #ff2234;');
  const live = mk('border:2px dashed #fcd23b;');
  const place = (el, r) => {
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
    el.hidden = root.hidden;
  };

  // Settle the camera deterministically, then check that the live rect matches the predicted one
  function check() {
    gallery.tick(4);
    const a = gallery.rectAtRest(gallery.index);
    const b = gallery.currentRect();
    place(rest, a);
    const dx = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
    say(`rect check #${gallery.index}: max deviation ${dx.toFixed(2)}px`, a);
    window.__rectCheck = { rest: a, live: b, deviation: dx };
  }
  const settle = () => setTimeout(check, 50);
  gallery.on('index', settle);
  addEventListener('resize', settle);
  // show() does not emit 'index' (the caller chose the index), so re-check after every show too
  const show = gallery.show;
  gallery.show = (opts) => show(opts).then((r) => (settle(), r));
  settle();

  (function follow() {
    place(live, gallery.currentRect());
    requestAnimationFrame(follow);
  })();
  addEventListener('keydown', (e) => {
    if (e.key === 'r') check();
  });
}

// Console checks. __leanCheck(): leans in to every painting and reports the
// share of the screen it fills (! = cut off). __plaqueCheck(): on-screen size
// of the current plaque, its keys and its price.
window.__leanCheck = () => {
  const { state, view } = gallery.debug;
  const out = [`${view.w}x${view.h}`];
  for (let i = 0; i < works.length; i++) {
    gallery.goTo(i);
    gallery.tick(3);
    state.leanGoal = 1;
    gallery.tick(3);
    const r = gallery.currentRect();
    const inside = r.x >= view.left - 1 && r.y >= view.top - 1 && r.x + r.width <= view.left + view.w + 1 && r.y + r.height <= view.top + view.h + 1;
    out.push(`${Math.max(r.width / view.w, r.height / view.h).toFixed(2)}${inside ? '' : '!'}`);
    state.leanGoal = 0;
  }
  gallery.tick(3);
  return out.join(' ');
};
window.__plaqueCheck = () => {
  const plaque = document.querySelectorAll('#galleri .galleri-plaque')[gallery.index];
  if (!plaque) return 'no plaque';
  const px = (r) => `${Math.round(r.width)}x${Math.round(r.height)}`;
  const keys = [...plaque.querySelectorAll('.galleri-plaque__btn')].map((b) => px(b.getBoundingClientRect()));
  const price = plaque.querySelector('.galleri-plaque__price');
  return `${innerWidth}x${innerHeight}: plaque ${px(plaque.getBoundingClientRect())}, keys ${keys.join(' ')}, price ${price ? px(price.getBoundingClientRect()) : '-'}`;
};
