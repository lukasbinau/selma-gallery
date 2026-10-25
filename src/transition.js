// The painting flies from its card on the front page to its place on the
// gallery wall (and back). A ghost <img> is placed exactly where the artwork
// will sit once the camera rests (gallery.rectAtRest), then FLIP-animated
// from the card's rect; a veil in the room's colour covers the hand-over.
// Only transform/opacity animate, so it stays smooth on phones.
//
// Any view with the gallery's rect API (resize, rectAtRest, currentRect) can
// use it, such as "I din stue": pass `colour` for its veil. flyAcross()
// carries the painting from one view's wall to another's.

const ROOM_COLOUR = { evening: '#230a66', daylight: '#e3dbf5' };
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)';
const FLY_MS = 520;

const rectOf = (el) => el.getBoundingClientRect();
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// WAAPI with a timer fallback: animations stall in background tabs, and a
// stalled transition must never leave the state machine half-way.
function play(el, keyframes, options) {
  const anim = el.animate(keyframes, { fill: 'forwards', ...options });
  const settled = anim.finished.catch(() => {});
  const fallback = new Promise((r) => setTimeout(r, (options.duration || 0) + 400)).then(() => anim.finish());
  return Promise.race([settled, fallback]);
}

function makeVeil(root, colour) {
  const veil = document.createElement('div');
  veil.className = 'fly-veil';
  veil.style.background = colour || ROOM_COLOUR[root?.dataset.theme] || ROOM_COLOUR.evening;
  document.body.append(veil);
  return veil;
}

function makeGhost(img, rect) {
  const ghost = document.createElement('img');
  ghost.className = 'fly-ghost';
  ghost.src = typeof img === 'string' ? img : img.currentSrc || img.src;
  ghost.alt = '';
  ghost.decoding = 'sync';
  Object.assign(ghost.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  document.body.append(ghost);
  return ghost;
}

// transform that makes an element sitting at `at` look like it sits at `from`
const flipFrom = (from, at) =>
  `translate(${from.x - at.x}px, ${from.y - at.y}px) scale(${from.width / at.width}, ${from.height / at.height})`;

const cardImage = (card) => card?.querySelector?.('.vaerk__frame img') || null;

/**
 * Card → room. Call after the gallery is built and page scrolling is locked
 * (so the root already has its final size). Resolves once the room is fully
 * revealed with the ghost gone. `showRoom` must un-hide the room and resolve
 * when its first frame has been rendered.
 */
export async function flyIn({ gallery, root, index, card, showRoom, colour }) {
  const img = cardImage(card);
  if (!img) return false;

  gallery.resize(); // the page's scrollbar has just gone; the rail depends on the root's size
  const from = rectOf(img);
  const to = gallery.rectAtRest(index);
  if (!to || !to.width || !to.height) return false;

  const veil = makeVeil(root, colour);
  const ghost = makeGhost(img, to);
  ghost.style.transform = flipFrom(from, to);
  await nextFrame(); // let the ghost paint at the card before it moves

  // The room renders behind the veil while the painting flies to the wall
  root.style.visibility = 'hidden';
  const shown = showRoom();
  const flight = play(ghost, [{ transform: flipFrom(from, to) }, { transform: 'none' }], { duration: FLY_MS, easing: EASE });
  const cover = play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out' });
  try {
    await Promise.all([flight, cover, shown]);
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

  const veil = makeVeil(root, colour);
  const ghost = makeGhost(img, from);
  await nextFrame();
  await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });

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
 * One view's wall → another's (gallery ↔ "I din stue"). The ghost starts on
 * the painting where it hangs now (`from`, a rect); the veil fades up in the
 * new view's colour while `change()` hides the old view and shows the new
 * one (resolving once it has rendered); then the ghost glides onto `to()`,
 * the painting's rect in the new view, and dissolves into it. `src` is the
 * photo's URL. Resolves false (nothing done) without a usable start rect.
 */
export async function flyAcross({ from, src, colour, change, to }) {
  if (!from || !from.width || !from.height || !src) return false;
  const probe = new Image();
  probe.src = src;
  await Promise.race([probe.decode().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);

  const veil = makeVeil(null, colour);
  const ghost = makeGhost(src, from);
  await nextFrame();
  await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
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
