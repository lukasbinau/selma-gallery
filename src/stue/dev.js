// Dev harness for the room view alone: /dev-stue.html?id=markvej
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import { createStue } from './stue.js';
import data from '../vaerker.json';
import artMeta from '../art-meta.json';

// ?t=aften&wall=tulipan&frame=<frame id> preset the visitor's choices
const q = new URLSearchParams(location.search);
if (q.get('t') || q.get('wall') || q.get('frame')) {
  try {
    const prev = JSON.parse(localStorage.getItem('selma:stue') || '{}');
    localStorage.setItem(
      'selma:stue',
      JSON.stringify({ ...prev, time: q.get('t') || prev.time, wall: q.get('wall') || prev.wall, frame: q.get('frame') || prev.frame }),
    );
  } catch {
    /* no storage: defaults */
  }
}
const root = document.getElementById('stue');
const stue = await createStue({ root, works: data.vaerker, artMeta });
const id = new URLSearchParams(location.search).get('id') || data.vaerker[0].id;
stue.on('exit', () => console.log('exit'));
stue.on('work', (e) => console.log('work', e));
await stue.show({ id, from: 'front' });
console.log('shown');

// Console checks: await __stueCheck(['lilla-skyer', 'blaa-fliser']) measures
// the work at rest in both views (share of the screen width and of the free
// band, and whether the angle button covers it); await __frameCheck(id) runs
// every frame and reports whether the camera stayed put.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pick(id) {
  if (stue.id === id) return;
  stue.select(id);
  for (let i = 0; i < 40 && stue.id !== id; i++) await sleep(150);
  await sleep(600);
}
function measureNow() {
  const r = stue.rectAtRest(stue.id);
  const p = root.querySelector('.stue__panel').getBoundingClientRect();
  const t = root.querySelector('.stue__top').getBoundingClientRect();
  const b = root.querySelector('.stue__angle').getBoundingClientRect();
  const covers = !(b.right <= r.x || b.left >= r.x + r.width || b.bottom <= r.y || b.top >= r.y + r.height);
  const inside = r.x >= 0 && r.x + r.width <= innerWidth && r.y >= t.bottom && r.y + r.height <= p.top;
  return `${stue.id} ${stue.debug.room.angle}: w ${Math.round((r.width / innerWidth) * 100)}% h ${Math.round((r.height / (p.top - t.bottom)) * 100)}% inside=${inside} button-covers=${covers}`;
}
window.__stueCheck = async (ids = data.vaerker.map((w) => w.id)) => {
  const out = [`${innerWidth}x${innerHeight}`];
  for (const id of ids) {
    await pick(id);
    for (const a of ['vinkel', 'forfra']) {
      await stue.debug.room.setAngle(a, { animate: false });
      out.push(measureNow());
    }
  }
  await stue.debug.room.setAngle('vinkel', { animate: false });
  return out.join('\n');
};
window.__frameCheck = async (id) => {
  await pick(id);
  const { room, state } = stue.debug;
  const rail = root.querySelector('[data-rail="frame"]');
  const keys = [];
  for (const o of state.offers) {
    rail.querySelector(`[data-id="${o.frame.id}"]`).click();
    await sleep(700);
    const p = room.camera.position;
    keys.push([p.x, p.y, p.z, room.camera.rotation.y].map((v) => v.toFixed(4)).join() + state.viewId);
  }
  return `${id}: ${keys.length} frames, camera still=${keys.every((k) => k === keys[0])}`;
};
// __layoutCheck(): controls that run off the screen, or are under 38px tall
window.__layoutCheck = () => {
  const bad = [];
  for (const s of ['.stue__cta', '.stue__tab', '.stue__handle', '.stue__angle', '.stue__back', '.stue__total', '.stue__title']) {
    for (const el of root.querySelectorAll(s)) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.left < 0 || r.right > innerWidth + 0.5) bad.push(`${s} off-screen`);
      if (/cta|tab|angle|back/.test(s) && r.height < 38) bad.push(`${s} ${Math.round(r.height)}px`);
    }
  }
  return `${innerWidth}x${innerHeight}: ${bad.join('; ') || 'controls ok'}`;
};
