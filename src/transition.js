// The painting flies from its card on the front page to its place on the
// gallery wall (and back). A ghost <img> is placed exactly where the artwork
// will sit once the camera rests (gallery.rectAtRest), then FLIP-animated
// from the card's rect; a veil in the room's colour covers the hand-over.
// Only transform/opacity animate, so it stays smooth on phones.
//
// A click answers at once: liftOff() raises the ghost off its card and brings
// the veil up in the very next frame, before anything is downloaded or built.
// Those animations run on the compositor, so they keep moving while the main
// thread builds the room; flyIn() then carries the ghost on from wherever it
// floats to its true place on the wall.
//
// Any view with the gallery's rect API (resize, rectAtRest, currentRect) can
// use it, such as "I din stue": pass `colour` for its veil. flyAcross()
// carries the painting from one view's wall to another's.

const ROOM_COLOUR = { evening: '#230a66', daylight: '#e3dbf5' };
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const FLY_MS = 520;
const SLOW_MS = 700; // a load that takes longer than this says so on the veil

const rectOf = (el) => el.getBoundingClientRect();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Two frames, so whatever was just added has been painted. rAF stalls in a
// background tab; the timer lets the transition carry on there.
export const nextFrame = () =>
  Promise.race([new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))), wait(120)]);

// WAAPI with a timer fallback: animations stall in background tabs, and a
// stalled transition must never leave the state machine half-way.
function play(el, keyframes, options) {
  const anim = el.animate(keyframes, { fill: 'forwards', ...options });
  const settled = anim.finished.catch(() => {});
  const fallback = wait((options.delay || 0) + (options.duration || 0) + 400).then(() => anim.finish());
  return Promise.race([settled, fallback]);
}

// '#e8e2d8' and the like: the loading line goes dark on them
function isLight(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function makeVeil(root, colour, label) {
  const veil = document.createElement('div');
  veil.className = 'fly-veil';
  const bg = colour || ROOM_COLOUR[root?.dataset.theme] || ROOM_COLOUR.evening;
  veil.style.background = bg;
  veil.classList.toggle('is-light', isLight(bg));
  if (label) {
    // the same "loading" line as the wipe's, shown only if the wait gets long
    const text = document.createElement('div');
    text.className = 'wipe__label';
    text.append(label);
    text.insertAdjacentHTML('beforeend', '<span class="wipe__bar"><span></span></span>');
    veil.append(text);
  }
  document.body.append(veil);
  return veil;
}

function place(el, rect) {
  Object.assign(el.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}

function makeGhost(img, rect) {
  const ghost = document.createElement('img');
  ghost.className = 'fly-ghost';
  ghost.src = typeof img === 'string' ? img : img.currentSrc || img.src;
  ghost.alt = '';
  ghost.decoding = 'sync';
  place(ghost, rect);
  document.body.append(ghost);
  return ghost;
}

// Stop an element's animations where they are, keeping the look of that moment
function freeze(el) {
  const anims = el.getAnimations();
  if (!anims.length) return;
  const { transform, opacity } = getComputedStyle(el);
  anims.forEach((a) => a.cancel());
  el.style.transform = transform === 'none' ? '' : transform;
  el.style.opacity = opacity;
}

// transform that makes an element sitting at `at` look like it sits at `from`
const flipFrom = (from, at) =>
  `translate(${from.x - at.x}px, ${from.y - at.y}px) scale(${from.width / at.width}, ${from.height / at.height})`;

const cardImage = (card) => card?.querySelector?.('.vaerk__frame img') || null;
const isLoaded = (img) => img && img.complete && img.naturalWidth > 0;

/**
 * Click on a card: the painting lifts off it and the veil comes up in the
 * room's colour, starting this frame. Returns a handle for flyIn() (pass it as
 * `lift`), or null when the card has no visible image. `handle.shown`
 * resolves once that first frame is on screen, so heavy work can start
 * behind it. If the room never comes, `handle.drop()` puts the painting back
 * on its card and lifts the veil; `handle.fade()` just dissolves both (the
 * room was shown without a flight).
 */
export function liftOff({ card, root, colour, label }) {
  const img = cardImage(card);
  if (!img) return null;
  const from = rectOf(img);
  if (!from.width || !from.height) return null;

  const veil = makeVeil(root, colour, label);
  const ghost = makeGhost(img, from);
  // Up and a little towards the middle of the screen, as if picked up
  const dx = (innerWidth / 2 - (from.x + from.width / 2)) * 0.1;
  const dy = (innerHeight / 2 - (from.y + from.height / 2)) * 0.1 - 8;
  play(ghost, [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(1.05)` }], {
    duration: 420,
    easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
  });
  play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  const slow = setTimeout(() => veil.classList.add('is-loading'), SLOW_MS);

  const handle = {
    ghost,
    veil,
    from,
    taken: false, // flyIn() has taken over the ghost and the veil
    shown: nextFrame(),
    take() {
      clearTimeout(slow);
      veil.classList.remove('is-loading');
      handle.taken = true;
    },
    async drop() {
      if (handle.taken) return;
      handle.take();
      freeze(ghost);
      freeze(veil);
      await Promise.all([
        play(ghost, [{ transform: ghost.style.transform || 'none' }, { transform: 'none' }], { duration: 360, easing: EASE }),
        play(veil, [{ opacity: veil.style.opacity }, { opacity: 0 }], { duration: 300, easing: 'ease-in' }),
      ]);
      await play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
      ghost.remove();
      veil.remove();
    },
    async fade() {
      if (handle.taken) return;
      handle.take();
      freeze(ghost);
      freeze(veil);
      await Promise.all([
        play(veil, [{ opacity: veil.style.opacity }, { opacity: 0 }], { duration: 260, easing: 'ease-in' }),
        play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' }),
      ]);
      ghost.remove();
      veil.remove();
    },
  };
  return handle;
}

/**
 * Card → room. Call after the gallery is built and page scrolling is locked
 * (so the root already has its final size). Resolves once the room is fully
 * revealed with the ghost gone. `showRoom` must un-hide the room and resolve
 * when its first frame has been rendered. With `lift` (from liftOff), the
 * ghost flies on from where it floats; without, it starts on the card.
 * Resolves false, touching nothing, when there is no usable rect.
 */
export async function flyIn({ gallery, root, index, card, showRoom, colour, lift = null }) {
  const img = cardImage(card);
  if (!img && !lift) return false;

  gallery.resize(); // the page's scrollbar has just gone; the rail depends on the root's size
  const to = gallery.rectAtRest(index);
  if (!to || !to.width || !to.height) return false;

  let ghost;
  let veil;
  let from;
  let cover;
  if (lift && !lift.taken) {
    lift.take();
    ({ ghost, veil } = lift);
    from = rectOf(ghost); // where it floats right now, lift animation included
    ghost.getAnimations().forEach((a) => a.cancel());
    place(ghost, to);
    ghost.style.transform = flipFrom(from, to);
    cover = veil.getAnimations()[0]?.finished.catch(() => {}) ?? Promise.resolve();
  } else {
    from = rectOf(img);
    veil = makeVeil(root, colour);
    ghost = makeGhost(img, to);
    ghost.style.transform = flipFrom(from, to);
    await nextFrame(); // let the ghost paint at the card before it moves
    cover = play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  }

  // The room renders behind the veil while the painting flies to the wall
  root.style.visibility = 'hidden';
  const flight = play(ghost, [{ transform: flipFrom(from, to) }, { transform: 'none' }], { duration: FLY_MS, easing: EASE });
  try {
    await Promise.all([flight, cover, showRoom()]);
  } catch (err) {
    ghost.remove();
    veil.remove();
    root.style.visibility = '';
    throw err;
  }

  // Hand over: the 3D painting is now exactly under the ghost
  root.style.visibility = '';
  await nextFrame();
  await Promise.all([
    play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' }),
    play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 80, easing: 'ease-in' }),
  ]);
  ghost.remove();
  veil.remove();
  return true;
}

/**
 * Room → card. `leaveRoom` hides the room and restores the page (scroll
 * unlocked, card scrolled into view); it runs while the veil covers the hand-over.
 */
export async function flyOut({ gallery, root, card, leaveRoom, colour }) {
  const img = cardImage(card);
  if (!img) return false;

  const from = gallery.currentRect();
  if (!from || !from.width || !from.height) return false;

  // A card far down the page may never have loaded its (lazy) photo: then the
  // ghost borrows the one the room shows, decoding while the veil comes up
  const veil = makeVeil(root, colour);
  const ghost = makeGhost((!isLoaded(img) && gallery.currentSrc?.()) || img, from);
  const decoded = Promise.race([ghost.decode().catch(() => {}), wait(400)]);
  await Promise.all([play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }), decoded]);

  leaveRoom(); // page is back underneath the veil, card centred
  await nextFrame();
  const to = rectOf(img);

  // Fly to the card as the veil lifts; the ghost lands exactly on the card's image
  await Promise.all([
    play(ghost, [{ transform: 'none' }, { transform: flipFrom(to, from) }], { duration: 480, easing: EASE }),
    play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 360, delay: 60, easing: 'ease-in' }),
  ]);
  await play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
  ghost.remove();
  veil.remove();
  return true;
}

/**
 * One view's wall → another's (gallery ↔ "I din stue"). The veil starts up in
 * the new view's colour at once, with the ghost on the painting where it
 * hangs now (`from`, a rect), while `prepare()` loads and builds the new view
 * (optional; a failure there drops the veil again and rethrows). Then
 * `change()` hides the old view and shows the new one (resolving once it has
 * rendered); the ghost glides onto `to()`, the painting's rect in the new
 * view, and dissolves into it. `src` is the photo's URL. Resolves false
 * (nothing done) without a usable start rect.
 */
export async function flyAcross({ from, src, colour, prepare = null, change, to, label }) {
  if (!from || !from.width || !from.height || !src) return false;

  const veil = makeVeil(null, colour, label);
  const ghost = makeGhost(src, from);
  // Until its photo has decoded (it is usually cached) the ghost waits unseen;
  // it sits exactly on the painting, so it appears without a jump
  ghost.style.opacity = '0';
  const decoded = Promise.race([ghost.decode().catch(() => {}), wait(600)]).then(() => (ghost.style.opacity = ''));
  const up = play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  const slow = setTimeout(() => veil.classList.add('is-loading'), SLOW_MS);
  try {
    await Promise.all([up, decoded, prepare?.()]);
  } catch (err) {
    // the old view is still there: let it show through again
    clearTimeout(slow);
    freeze(veil);
    await play(veil, [{ opacity: veil.style.opacity }, { opacity: 0 }], { duration: 200 });
    ghost.remove();
    veil.remove();
    throw err;
  }
  clearTimeout(slow);
  veil.classList.remove('is-loading');
  try {
    await change();
  } catch (err) {
    ghost.remove();
    veil.remove();
    throw err;
  }
  await nextFrame();
  const target = to();
  if (target && target.width && target.height) {
    // the ghost sits at `from`: move it onto the new rect
    await play(ghost, [{ transform: 'none' }, { transform: flipFrom(target, from) }], { duration: FLY_MS, easing: EASE });
  }
  await Promise.all([
    play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in' }),
    play(ghost, [{ opacity: 1 }, { opacity: 0 }], { duration: 340, delay: 100, easing: 'ease-in' }),
  ]);
  ghost.remove();
  veil.remove();
  return true;
}
