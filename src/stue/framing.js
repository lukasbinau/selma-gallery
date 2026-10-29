// The work on the wall: the painting itself (canvas, board or paper at its true
// size) and, when chosen, a real frame around it: four mitred moulding pieces
// with eased edges, a passepartout with a bevelled cut showing its white core,
// glazing, or a floater frame with its shadow gap. Units are metres; the group's
// origin is the wall surface at the centre of the work, +z out of the wall.
import * as THREE from 'three';

const MM = 0.001;

// One mitred moulding piece lying along +x: inner edge length `inner`, width `w`
// across, depth `d` out of the wall. Edges eased by a small bevel.
function mitredPiece(inner, w, d, bevel = 0.0007) {
  const s = new THREE.Shape();
  s.moveTo(-inner / 2, 0);
  s.lineTo(inner / 2, 0);
  s.lineTo(inner / 2 + w, w);
  s.lineTo(-inner / 2 - w, w);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.001, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.translate(0, 0, bevel);
  return geo;
}

// Four pieces around an opening of iw × ih, as one geometry (one draw call)
function moulding(iw, ih, w, d) {
  const parts = [];
  const place = (len, rot, x, y) => {
    const g = mitredPiece(len, w, d);
    g.rotateZ(rot);
    g.translate(x, y, 0);
    parts.push(g);
  };
  place(iw, 0, 0, ih / 2); // top: inner edge at y = ih/2, outer above
  place(iw, Math.PI, 0, -ih / 2);
  place(ih, Math.PI / 2, -iw / 2, 0);
  place(ih, -Math.PI / 2, iw / 2, 0);
  return mergeSimple(parts);
}

// Merge non-indexed/indexed geometries with the same attributes
function mergeSimple(geos) {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = ['position', 'normal', 'uv'];
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const total = nonIndexed.reduce((n, g) => n + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of nonIndexed) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, nonIndexed[0].attributes[name].itemSize));
  }
  // groups: 0 = caps (front/back), 1 = sides, as ExtrudeGeometry makes them
  geos.forEach((g) => g.dispose());
  return out;
}

// A board with a rectangular window and a 45° bevelled cut (passepartout)
function matBoard(ow, oh, ww, wh, t, oy = 0) {
  const s = new THREE.Shape();
  s.moveTo(-ow / 2, -oh / 2);
  s.lineTo(ow / 2, -oh / 2);
  s.lineTo(ow / 2, oh / 2);
  s.lineTo(-ow / 2, oh / 2);
  s.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-ww / 2, -wh / 2 + oy);
  hole.lineTo(-ww / 2, wh / 2 + oy);
  hole.lineTo(ww / 2, wh / 2 + oy);
  hole.lineTo(ww / 2, -wh / 2 + oy);
  hole.closePath();
  s.holes.push(hole);
  // The bevel only on the window: extrude thin, then push the hole's front edge out
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 1 });
  const p = geo.attributes.position;
  const b = t * 1.0; // 45°: the cut widens by the board's thickness towards the front
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i) - oy;
    const z = p.getZ(i);
    const onHole = Math.abs(Math.abs(x) - ww / 2) < 1e-6 || Math.abs(Math.abs(y) - wh / 2) < 1e-6;
    const inside = Math.abs(x) <= ww / 2 + 1e-6 && Math.abs(y) <= wh / 2 + 1e-6;
    if (onHole && inside && z > t / 2) {
      p.setX(i, x + Math.sign(x) * (Math.abs(Math.abs(x) - ww / 2) < 1e-6 ? b : 0));
      p.setY(i, p.getY(i) + Math.sign(y) * (Math.abs(Math.abs(y) - wh / 2) < 1e-6 ? b : 0));
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * The outer size (m) the work would have in `offer`, without building it:
 * the same sums as buildWork below.
 */
export function outerOf(size, offer) {
  const aw = size.w / 100;
  const ah = size.h / 100;
  const frame = offer?.frame;
  if (!frame || frame.none) return { w: aw, h: ah };
  const pw = (frame.profileWidthMm || 13) * MM;
  if ((frame.style || 'plakat') === 'svaever') return { w: aw + 0.014 + pw * 2, h: ah + 0.014 + pw * 2 };
  return { w: offer.inner.w / 100 + pw * 2, h: offer.inner.h / 100 + pw * 2 };
}

/**
 * Builds the work as it will hang. `size` is the work in cm ({ w, h }), `offer`
 * the chosen frame offer from catalogue.offersFor (frame.none for none),
 * `medium` paper | canvas | board, `bare` true when the photo already shows a
 * frame. `mats` holds shared materials (art, frame, mat, glass, …).
 * Returns { group, outer: { w, h }, art: { w, h, z, y }, depth }.
 */
export function buildWork({ size, offer, medium, bare, mats }) {
  const group = new THREE.Group();
  const aw = size.w / 100;
  const ah = size.h / 100;
  const frame = offer?.frame;
  const none = !frame || frame.none;

  const artPlane = (w, h, z, y = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.art);
    m.position.set(0, y, z);
    m.receiveShadow = true;
    m.name = 'art';
    group.add(m);
    return m;
  };

  if (none) {
    if (bare) {
      // The photo includes the artist's own frame: a solid block with the photo on its face
      const d = 0.035;
      group.add(box(aw, ah, d - 0.001, mats.bareEdge, 0, 0, d / 2));
      artPlane(aw, ah, d);
      return { group, outer: { w: aw, h: ah }, art: { w: aw, h: ah, z: d, y: 0 }, depth: d };
    }
    if (medium === 'paper') {
      // A sheet held flat on the wall (clips hidden behind), standing off 4 mm
      const d = 0.004;
      group.add(box(aw, ah, 0.0006, mats.paperEdge, 0, 0, d));
      artPlane(aw, ah, d + 0.0004);
      return { group, outer: { w: aw, h: ah }, art: { w: aw, h: ah, z: d + 0.0004, y: 0 }, depth: d };
    }
    // Canvas on stretcher bars (2 cm) or a board (1.2 cm), painted edges
    const d = medium === 'canvas' ? 0.022 : 0.014;
    group.add(box(aw, ah, d - 0.0005, mats.canvasEdge, 0, 0, d / 2));
    artPlane(aw, ah, d);
    return { group, outer: { w: aw, h: ah }, art: { w: aw, h: ah, z: d, y: 0 }, depth: d };
  }

  const pw = (frame.profileWidthMm || 13) * MM;
  const pd = (frame.profileDepthMm || 22) * MM;
  const iw = offer.inner.w / 100;
  const ih = offer.inner.h / 100;
  const style = frame.style || 'plakat';

  if (style === 'svaever') {
    // Floater: the canvas sits inside an L-profile with a 7 mm shadow gap
    const gap = 0.007;
    const cd = medium === 'canvas' ? 0.022 : 0.014;
    const fiw = aw + gap * 2;
    const fih = ah + gap * 2;
    const g = new THREE.Mesh(moulding(fiw, fih, pw, pd), mats.frame);
    g.castShadow = g.receiveShadow = true;
    group.add(g);
    // the dark back tray seen through the gap
    group.add(box(fiw, fih, 0.004, mats.gap, 0, 0, 0.002 + 0.006));
    const front = pd - 0.006; // canvas face 6 mm behind the frame's front
    group.add(box(aw, ah, cd - 0.0005, mats.canvasEdge, 0, 0, front - cd / 2));
    artPlane(aw, ah, front);
    return {
      group,
      outer: { w: fiw + pw * 2, h: fih + pw * 2 },
      art: { w: aw, h: ah, z: front, y: 0 },
      depth: pd,
    };
  }

  // Glazed poster frame: moulding, glass, (passepartout,) art, backing
  const g = new THREE.Mesh(moulding(iw, ih, pw, pd), mats.frame);
  g.castShadow = g.receiveShadow = true;
  group.add(g);
  group.add(box(iw, ih, 0.003, mats.backing, 0, 0, 0.0035));
  const glassZ = pd - 0.004;
  let art;
  if (offer.mat) {
    const t = 0.0016;
    const mw = offer.mat.w / 100;
    const mh = offer.mat.h / 100;
    // Weighted bottom: the window sits a little above centre on wide borders
    const oy = Math.min(0.012, Math.max(0, (ih - mh) / 2 - 0.05) * 0.25);
    const matZ = glassZ - 0.0012 - t;
    const mesh = new THREE.Mesh(matBoard(iw, ih, mw, mh, t, oy), mats.mat);
    mesh.position.z = matZ;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    const plane = artPlane(aw, ah, matZ - 0.0004, oy);
    art = { w: mw, h: mh, z: plane.position.z, y: oy };
  } else {
    const plane = artPlane(iw, ih, glassZ - 0.0015);
    art = { w: iw, h: ih, z: plane.position.z, y: 0 };
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(iw, ih), mats.glass);
  glass.position.z = glassZ;
  glass.renderOrder = 5;
  glass.name = 'glass';
  group.add(glass);
  return { group, outer: { w: iw + pw * 2, h: ih + pw * 2 }, art, depth: pd };
}
