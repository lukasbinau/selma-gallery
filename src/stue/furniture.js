// Furniture and styling, modelled in code at real sizes (metres). Every builder
// returns a Group standing on the floor (y = 0), centred on x, its front facing
// +z. Soft shapes are rounded or deformed so nothing has a razor-sharp CG edge.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rand } from './textures.js';

const rbox = (w, h, d, r, segs = 3) => new RoundedBoxGeometry(w, h, d, segs, Math.min(r, w / 2, h / 2, d / 2) * 0.999);

export function mesh(geo, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const at = (obj, x, y, z, ry = 0) => {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  return obj;
};

// A plump cushion: a subdivided box whose faces bulge and whose edges pinch
function pillowGeometry(w, h, d, puff = 1) {
  const g = new THREE.BoxGeometry(w, h, d, 18, 18, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    const z = p.getZ(i) / (d / 2);
    const fx = 1 - Math.pow(Math.abs(x), 3);
    const fy = 1 - Math.pow(Math.abs(y), 3);
    const body = Math.max(0, fx * fy);
    // thickness follows the bulge: thin at the seams, full in the middle
    const zz = z * (0.18 + 0.82 * Math.pow(body, 0.6 * puff));
    // the seam line pulls the corners in a little
    const pinch = 1 - 0.06 * Math.pow(Math.abs(x * y), 2);
    p.setXYZ(i, p.getX(i) * pinch, p.getY(i) * pinch, zz * (d / 2));
  }
  g.computeVertexNormals();
  return g;
}

// A seat/back cushion: a rounded box whose top (local +y) domes slightly
function cushionGeometry(w, h, d, r, dome = 0.015) {
  const g = rbox(w, h, d, r, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const z = p.getZ(i) / (d / 2);
    const y = p.getY(i);
    if (y > 0) {
      const k = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
      p.setY(i, y + dome * k * (y / (h / 2)));
    }
  }
  g.computeVertexNormals();
  return g;
}

// Tube along a curve whose radius tapers from r0 to r1
export function taperedTube(curve, r0, r1, segments = 24, radial = 8) {
  const g = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const p = g.attributes.position;
  const frames = curve.computeFrenetFrames(segments, false);
  const c = new THREE.Vector3();
  for (let s = 0; s <= segments; s++) {
    curve.getPointAt(s / segments, c);
    const r = r0 + (r1 - r0) * (s / segments);
    for (let k = 0; k <= radial; k++) {
      const i = s * (radial + 1) + k;
      const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(r);
      p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  void frames;
  g.computeVertexNormals();
  return g;
}

const lathe = (pts, segs = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

// ------------------------------------------------------------------ sofa
// A low, deep three-seater in oatmeal bouclé on oak feet. Accent cushions and a
// throw take their colours from the painting (`palette`).
export function sofa(mats, palette, { width = 2.3, depth = 0.95 } = {}) {
  const g = new THREE.Group();
  const arm = 0.19;
  const legH = 0.09;
  const baseTop = legH + 0.2;
  // plinth frame
  g.add(at(mesh(rbox(width, 0.2, depth, 0.03), mats.sofa), 0, legH + 0.1, 0));
  // back frame
  g.add(at(mesh(rbox(width, 0.36, 0.17, 0.04), mats.sofa), 0, baseTop + 0.17, -depth / 2 + 0.085));
  // arms
  for (const sx of [-1, 1]) {
    g.add(at(mesh(rbox(arm, 0.33, depth, 0.07), mats.sofa), sx * (width / 2 - arm / 2), baseTop + 0.15, 0));
  }
  // seat cushions
  const seatW = (width - arm * 2) / 2;
  const seatD = depth - 0.17 - 0.02;
  for (const sx of [-0.5, 0.5]) {
    g.add(at(mesh(cushionGeometry(seatW - 0.006, 0.15, seatD, 0.05, 0.018), mats.sofa), sx * seatW, baseTop + 0.07, 0.085));
  }
  // back cushions, leaning back a little
  for (const sx of [-0.5, 0.5]) {
    const c = mesh(cushionGeometry(seatW - 0.008, 0.2, 0.42, 0.07, 0.012), mats.sofa);
    c.rotation.x = Math.PI / 2 - 0.2;
    c.position.set(sx * seatW, baseTop + 0.15 + 0.2, -depth / 2 + 0.17 + 0.07);
    g.add(c);
  }
  // oak feet
  const footGeo = new THREE.CylinderGeometry(0.022, 0.018, legH, 16);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(at(mesh(footGeo, mats.oak), sx * (width / 2 - 0.08), legH / 2, sz * (depth / 2 - 0.08)));
    }
  }
  // scatter cushions
  const cushionMat = (i) => mats.accentFabric[i % mats.accentFabric.length];
  const pillows = [
    [-width / 2 + arm + 0.28, 0.5, 0.22, 0],
    [-width / 2 + arm + 0.62, 0.45, -0.08, 1],
    [width / 2 - arm - 0.3, 0.5, 0.18, 2],
  ];
  pillows.forEach(([x, s, tilt, i]) => {
    const p = mesh(pillowGeometry(s, s, 0.17), cushionMat(i));
    p.position.set(x, baseTop + 0.14 + s / 2 - 0.02, -depth / 2 + 0.17 + 0.17);
    p.rotation.set(-0.32, tilt * 0.6, tilt);
    g.add(p);
  });
  // a throw draped over the right arm
  g.add(throwOverArm(mats.throw, { armX: width / 2 - arm, armW: arm, armTop: baseTop + 0.31, seatY: baseTop + 0.15, depth }));
  void palette;
  return g;
}

// A blanket: a strip bent over the arm's cross-section, with soft wrinkles
function throwOverArm(material, { armX, armW, armTop, seatY, depth }) {
  const L = 0.95;
  const W = 0.55;
  const T = 0.012;
  const geo = new THREE.BoxGeometry(L, T, W, 80, 1, 24);
  const p = geo.attributes.position;
  // path in the x-y plane: up the inner face, over the top, down the outside
  const r = 0.07;
  const inner = armX;
  const outer = armX + armW;
  const segs = [
    { len: armTop - r - seatY, f: (s) => [inner - T, seatY + s, -1, 0] },
    { len: (Math.PI / 2) * r, f: (s) => { const a = Math.PI - s / r; return [inner + r + Math.cos(a) * (r + T), armTop - r + Math.sin(a) * (r + T), Math.cos(a), Math.sin(a)]; } },
    { len: armW - 2 * r, f: (s) => [inner + r + s, armTop + T, 0, 1] },
    { len: (Math.PI / 2) * r, f: (s) => { const a = Math.PI / 2 - s / r; return [outer - r + Math.cos(a) * (r + T), armTop - r + Math.sin(a) * (r + T), Math.cos(a), Math.sin(a)]; } },
    { len: 10, f: (s) => [outer + T, armTop - r - s, 1, 0] },
  ];
  const total = segs.reduce((n, s) => n + s.len, 0);
  for (let i = 0; i < p.count; i++) {
    let s = ((p.getX(i) + L / 2) / L) * Math.min(L, total);
    const off = p.getY(i);
    const z = p.getZ(i);
    let seg = segs[0];
    for (const sg of segs) {
      seg = sg;
      if (s <= sg.len) break;
      s -= sg.len;
    }
    const [x, y, nx, ny] = seg.f(s);
    const wrinkle = Math.sin(z * 38 + x * 9) * 0.004 + Math.sin(z * 13) * 0.003;
    p.setXYZ(i, x + nx * (off + wrinkle), y + ny * (off + wrinkle), z);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, material);
  m.position.z = depth * 0.08;
  return m;
}

// ------------------------------------------------------------------ tables
export function coffeeTable(mats, palette) {
  const g = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.032, 64), mats.oak);
  top.position.y = 0.384;
  g.add(top);
  // edge eased: a thin torus
  const legGeo = new THREE.CylinderGeometry(0.024, 0.02, 0.37, 16);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.add(at(mesh(legGeo, mats.oak), Math.cos(a) * 0.3, 0.185, Math.sin(a) * 0.3));
  }
  // two art books and a ceramic bowl
  g.add(at(book(mats, 0.3, 0.24, 0.035, 0), -0.12, 0.4, 0.04, 0.3));
  g.add(at(book(mats, 0.26, 0.2, 0.025, 1), -0.13, 0.435, 0.05, 0.42));
  const bowl = mesh(lathe([[0.001, 0], [0.05, 0.002], [0.09, 0.03], [0.105, 0.065], [0.1, 0.066], [0.085, 0.03], [0.045, 0.01], [0.001, 0.008]]), mats.ceramic[1]);
  g.add(at(bowl, 0.17, 0.4, -0.08));
  void palette;
  return g;
}

export function book(mats, w, d, h, i) {
  const g = new THREE.Group();
  const cover = mats.books[i % mats.books.length];
  g.add(mesh(rbox(w, h, d, 0.002, 1), cover));
  // pages: a slightly inset paler block
  const pages = mesh(new THREE.BoxGeometry(w - 0.006, h * 0.8, d - 0.004), mats.pages);
  pages.position.x = 0.003;
  g.add(pages);
  g.children.forEach((c) => (c.position.y += h / 2));
  return g;
}

export function sideTable(mats) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 48), mats.blackMetal), 0, 0.52, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 12), mats.blackMetal), 0, 0.26, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.012, 48), mats.blackMetal), 0, 0.006, 0));
  // a stoneware vase with a single branch
  g.add(at(vase(mats.ceramic[0], 0.2), -0.04, 0.53, 0.02));
  g.add(at(branchBunch(mats, 3, 0.55, 5), -0.04, 0.53 + 0.17, 0.02));
  g.add(at(book(mats, 0.2, 0.15, 0.02, 2), 0.08, 0.53, -0.04, -0.4));
  return g;
}

export function vase(material, h = 0.3) {
  const k = h / 0.3;
  return mesh(
    lathe(
      [
        [0.001, 0],
        [0.06, 0.002],
        [0.085, 0.05],
        [0.095, 0.12],
        [0.075, 0.21],
        [0.04, 0.26],
        [0.036, 0.3],
        [0.032, 0.3],
        [0.032, 0.27],
        [0.001, 0.26],
      ].map(([r, y]) => [r * k, y * k]),
    ),
    material,
  );
}

// Dried branches: thin tapering twigs fanning out of a vase
function branchBunch(mats, n, height, seed) {
  const g = new THREE.Group();
  const r = rand(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const lean = 0.15 + r() * 0.35;
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push(new THREE.Vector3(Math.cos(a) * lean * t * height * 0.6 + (r() - 0.5) * 0.02, t * height * (0.85 + r() * 0.3), Math.sin(a) * lean * t * height * 0.4 + (r() - 0.5) * 0.02));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(taperedTube(curve, 0.005, 0.0012, 16, 5), mats.twig));
    // side twigs
    for (let k = 0; k < 3; k++) {
      const t = 0.4 + r() * 0.5;
      const base = curve.getPointAt(t);
      const dir = new THREE.Vector3(r() - 0.5, 0.6 + r() * 0.4, r() - 0.5).normalize();
      const tip = base.clone().addScaledVector(dir, 0.08 + r() * 0.12);
      const c2 = new THREE.CatmullRomCurve3([base, base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.01, 0)), tip]);
      g.add(mesh(taperedTube(c2, 0.002, 0.0008, 6, 4), mats.twig));
    }
  }
  return g;
}

// ------------------------------------------------------------------ lamps
// A paper lantern on a slim black stand. Returns { group, light position (local) }.
export function floorLantern(mats) {
  const g = new THREE.Group();
  const h = 1.42;
  g.add(at(mesh(new THREE.CylinderGeometry(0.008, 0.008, h, 10), mats.blackMetal), 0, h / 2, 0));
  // three splayed feet
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 8), mats.blackMetal);
    leg.position.set(Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12);
    leg.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    g.add(leg);
  }
  // ellipsoid paper shade with fine bamboo ribs (in its texture)
  const shadePts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const a = -Math.PI / 2 + t * Math.PI;
    shadePts.push([Math.max(0.03, Math.cos(a) * 0.24), Math.sin(a) * 0.3]);
  }
  const shade = mesh(lathe(shadePts, 48), mats.paperShade, { cast: false });
  shade.position.y = h + 0.12;
  shade.name = 'shade';
  g.add(shade);
  return { group: g, light: new THREE.Vector3(0, h + 0.12, 0) };
}

// A mushroom table lamp (white opal shade on a slim stem)
export function tableLamp(mats) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.015, 40), mats.lampWhite), 0, 0.0075, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.32, 16), mats.lampWhite), 0, 0.17, 0));
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    pts.push([Math.max(0.001, Math.sin(a) * 0.2), Math.cos(a) * 0.12]);
  }
  pts.reverse();
  const shade = mesh(lathe(pts, 48), mats.opal, { cast: true });
  shade.position.y = 0.31;
  shade.name = 'shade';
  g.add(shade);
  return { group: g, light: new THREE.Vector3(0, 0.33, 0) };
}

// A layered Danish pendant (three stacked shades), hanging from the ceiling
export function pendant(mats, drop = 0.85) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.003, 0.003, drop, 6), mats.blackMetal, { cast: false }), 0, -drop / 2, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), mats.lampWhite), 0, -0.0075, 0));
  const shade = (r, h, y) => {
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([r * (0.35 + 0.65 * Math.sin((t * Math.PI) / 2)), -t * h]);
    }
    const m = mesh(lathe(pts, 48), mats.pendantShade);
    m.material.side = THREE.DoubleSide;
    m.position.y = y;
    return m;
  };
  const y0 = -drop;
  g.add(shade(0.15, 0.13, y0 + 0.08));
  g.add(shade(0.22, 0.12, y0 - 0.0));
  g.add(shade(0.26, 0.08, y0 - 0.09));
  const bulb = mesh(new THREE.SphereGeometry(0.03, 16, 12), mats.bulb, { cast: false });
  bulb.position.y = y0 - 0.06;
  bulb.name = 'shade';
  g.add(bulb);
  return { group: g, light: new THREE.Vector3(0, y0 - 0.1, 0) };
}

// ------------------------------------------------------------------ storage
// A long oak sideboard with fluted doors on slim legs
export function sideboard(mats, { width = 1.8, depth = 0.45, height = 0.72 } = {}) {
  const g = new THREE.Group();
  const legH = 0.14;
  const bodyH = height - legH;
  g.add(at(mesh(rbox(width, 0.03, depth, 0.006), mats.oak), 0, height - 0.015, 0));
  g.add(at(mesh(new THREE.BoxGeometry(width - 0.02, bodyH - 0.03, depth - 0.03), mats.oak), 0, legH + (bodyH - 0.03) / 2, -0.01));
  // four fluted doors, a hair proud of the carcass, with shadow gaps
  const doorW = (width - 0.04) / 4;
  for (let i = 0; i < 4; i++) {
    const d = mesh(new THREE.BoxGeometry(doorW - 0.004, bodyH - 0.05, 0.02), mats.oakFluted);
    d.position.set(-width / 2 + 0.02 + doorW * (i + 0.5), legH + (bodyH - 0.03) / 2, depth / 2 - 0.02);
    g.add(d);
  }
  const legGeo = new THREE.CylinderGeometry(0.018, 0.015, legH, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(at(mesh(legGeo, mats.oak), sx * (width / 2 - 0.08), legH / 2, sz * (depth / 2 - 0.07)));
    }
  }
  return g;
}

// The still life on the sideboard: a big vase with branches, books, a bowl
export function sideboardStyling(mats, width = 1.8) {
  const g = new THREE.Group();
  g.add(at(vase(mats.ceramic[2], 0.38), -width / 2 + 0.24, 0, 0));
  g.add(at(branchBunch(mats, 5, 0.75, 11), -width / 2 + 0.24, 0.32, 0));
  g.add(at(book(mats, 0.28, 0.22, 0.03, 0), width / 2 - 0.42, 0, 0.02, 0.08));
  g.add(at(book(mats, 0.25, 0.19, 0.028, 2), width / 2 - 0.42, 0.03, 0.02, 0.18));
  const bowl = mesh(lathe([[0.001, 0], [0.04, 0.002], [0.07, 0.025], [0.075, 0.045], [0.07, 0.046], [0.06, 0.025], [0.03, 0.008], [0.001, 0.007]]), mats.ceramic[1]);
  g.add(at(bowl, width / 2 - 0.42, 0.058, 0.02));
  return g;
}

// ------------------------------------------------------------------ dining
export function diningTable(mats, { length = 2.0, width = 0.95 } = {}) {
  const g = new THREE.Group();
  g.add(at(mesh(rbox(width, 0.035, length, 0.008), mats.oak), 0, 0.74, 0));
  const legGeo = rbox(0.06, 0.72, 0.06, 0.012);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(at(mesh(legGeo, mats.oak), sx * (width / 2 - 0.08), 0.36, sz * (length / 2 - 0.12)));
    }
  }
  return g;
}

// A Danish dining chair: oak legs, a woven paper-cord seat in an oak frame and
// a curved, steam-bent back rest
export function chair(mats) {
  const g = new THREE.Group();
  const seatH = 0.45;
  g.add(at(mesh(rbox(0.45, 0.035, 0.42, 0.01), mats.oak), 0, seatH - 0.02, 0));
  g.add(at(mesh(rbox(0.4, 0.02, 0.37, 0.008), mats.chairSeat), 0, seatH, 0));
  const legGeo = new THREE.CylinderGeometry(0.016, 0.013, seatH - 0.02, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const l = mesh(legGeo, mats.oak);
      l.position.set(sx * 0.19, (seatH - 0.02) / 2, sz * 0.17);
      l.rotation.set(sz * 0.03, 0, -sx * 0.03);
      g.add(l);
    }
  }
  // back posts rising from the rear legs, and the curved rest on top
  for (const sx of [-1, 1]) {
    const p = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.34, 10), mats.oak);
    p.position.set(sx * 0.19, seatH + 0.16, -0.18);
    p.rotation.x = -0.08;
    g.add(p);
  }
  const rest = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.075, 32, 1, true, Math.PI - 0.62, 1.24), mats.oak);
  rest.material.side = THREE.DoubleSide;
  rest.position.set(0, seatH + 0.3, 0.12);
  g.add(rest);
  return g;
}

// ------------------------------------------------------------------ plants
// Leaves as instanced cards on a branch skeleton. Returns { group }.
function foliage(material, branches, { count, leafLen, leafW, spread, seed, upBias = 0.3, droop = 0 }) {
  const r = rand(seed);
  const geo = new THREE.PlaneGeometry(leafW, leafLen);
  geo.translate(0, leafLen / 2, 0); // pivot at the leaf's base
  const im = new THREE.InstancedMesh(geo, material, count);
  im.castShadow = true;
  im.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const colour = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const b = branches[i % branches.length];
    const t = 0.35 + Math.pow(r(), 0.6) * 0.65;
    b.getPointAt(Math.min(1, t), pos);
    pos.x += (r() - 0.5) * spread;
    pos.y += (r() - 0.5) * spread * 0.8;
    pos.z += (r() - 0.5) * spread;
    e.set((r() - 0.5) * 2.4 + droop, r() * Math.PI * 2, (r() - 0.5) * 2.4 - upBias * 0);
    q.setFromEuler(e);
    const k = 0.75 + r() * 0.5;
    s.set(k, k, k);
    m.compose(pos, q, s);
    im.setMatrixAt(i, m);
    colour.setHSL(0, 0, 0.78 + r() * 0.3);
    im.setColorAt(i, colour);
  }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// A multi-stem olive tree in a stone planter, ~2 m tall
export function oliveTree(mats, { quality = 1, seed = 2 } = {}) {
  const g = new THREE.Group();
  const pot = mesh(lathe([[0.001, 0], [0.2, 0], [0.25, 0.04], [0.27, 0.5], [0.28, 0.52], [0.26, 0.52], [0.25, 0.48], [0.001, 0.46]], 48), mats.planter);
  g.add(pot);
  const r = rand(seed);
  const branches = [];
  const trunks = 3;
  for (let i = 0; i < trunks; i++) {
    const a = (i / trunks) * Math.PI * 2 + r();
    const pts = [new THREE.Vector3(Math.cos(a) * 0.03, 0.46, Math.sin(a) * 0.03)];
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.12 * t + (r() - 0.5) * 0.12, 0.46 + t * 1.0, Math.sin(a) * 0.12 * t + (r() - 0.5) * 0.12));
    }
    const trunk = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(taperedTube(trunk, 0.035, 0.014, 24, 8), mats.bark));
    // branches from the upper trunk
    for (let k = 0; k < 4; k++) {
      const base = trunk.getPointAt(0.55 + r() * 0.45);
      const dir = new THREE.Vector3(Math.cos(a + (r() - 0.5) * 2.2), 0.5 + r() * 0.7, Math.sin(a + (r() - 0.5) * 2.2)).normalize();
      const len = 0.35 + r() * 0.35;
      const mid = base.clone().addScaledVector(dir, len * 0.5).add(new THREE.Vector3(0, 0.05, 0));
      const tip = base.clone().addScaledVector(dir, len);
      const c = new THREE.CatmullRomCurve3([base, mid, tip]);
      g.add(mesh(taperedTube(c, 0.012, 0.003, 10, 6), mats.bark));
      branches.push(c);
    }
  }
  g.add(foliage(mats.oliveLeaf, branches, { count: Math.round(2600 * quality), leafLen: 0.065, leafW: 0.016, spread: 0.24, seed: seed + 9 }));
  // soil
  g.add(at(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 32), mats.soil), 0, 0.47, 0));
  return g;
}

// A fiddle-leaf fig in a woven basket, ~1.6 m
export function figTree(mats, { quality = 1, seed = 4 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0.001, 0], [0.18, 0], [0.22, 0.04], [0.23, 0.36], [0.2, 0.36], [0.19, 0.34], [0.001, 0.32]], 40), mats.basket));
  const r = rand(seed);
  const stem = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.32, 0),
    new THREE.Vector3(0.03, 0.8, 0.02),
    new THREE.Vector3(-0.02, 1.25, 0.0),
    new THREE.Vector3(0.02, 1.6, -0.02),
  ]);
  g.add(mesh(taperedTube(stem, 0.018, 0.008, 20, 6), mats.bark));
  const im = new THREE.InstancedMesh(
    (() => {
      const geo = new THREE.PlaneGeometry(0.2, 0.3, 1, 4);
      geo.translate(0, 0.15, 0);
      // cup the leaf: bend along its length
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(p.getY(i) / 0.3, 2) * 0.05);
      geo.computeVertexNormals();
      return geo;
    })(),
    mats.figLeaf,
    Math.round(46 * Math.max(0.6, quality)),
  );
  im.castShadow = im.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < im.count; i++) {
    const t = 0.25 + (i / im.count) * 0.75;
    stem.getPointAt(t, pos);
    const yaw = i * 2.4 + r() * 0.4;
    q.setFromEuler(new THREE.Euler(-0.7 - r() * 0.5, yaw, 0, 'YXZ'));
    const k = 0.7 + (1 - t) * 0.5 + r() * 0.2;
    s.set(k, k, k);
    m.compose(pos, q, s);
    im.setMatrixAt(i, m);
  }
  g.add(im);
  return g;
}
