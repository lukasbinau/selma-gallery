// Wall finishes: paint colours and four original wallpapers drawn in code. The
// wallpapers are in the spirit of Selma's references (a dark sage Arts & Crafts
// floral with cream tulips, a dusty pink large floral, and two yellow stripes)
// but are our own designs. Every tile is one roll width (53 cm) and repeats
// seamlessly: motifs near an edge are drawn again on the opposite side.
import { makeCanvas, toTexture, fbm, normalFromHeight, rand } from './textures.js';

export const ROLL = 0.53; // m, standard Scandinavian roll width = one repeat

// woodwork: skirting and door casings painted to go with the wall
export const WALLS = [
  { id: 'kalkhvid', name: 'Kalkhvid', kind: 'paint', colour: '#f1efeb', woodwork: '#f4f3ef' },
  { id: 'havre', name: 'Havre', kind: 'paint', colour: '#d9d0c1', woodwork: '#d9d0c1' },
  { id: 'salvie', name: 'Salvie', kind: 'paint', colour: '#a8ae97', woodwork: '#a8ae97' },
  { id: 'dueblaa', name: 'Dueblå', kind: 'paint', colour: '#9fabb1', woodwork: '#9fabb1' },
  { id: 'terrakotta', name: 'Terrakotta', kind: 'paint', colour: '#b9785e', woodwork: '#b9785e' },
  { id: 'skovgroen', name: 'Skovgrøn', kind: 'paint', colour: '#3f4c41', woodwork: '#3f4c41' },
  {
    id: 'tulipan',
    name: 'Tulipan, salvie',
    kind: 'paper',
    pattern: 'tulipan',
    colour: '#46543f',
    swatch: ['#46543f', '#e9dcbb', '#7d8b68'],
    woodwork: '#3c4838',
    repeatH: ROLL,
  },
  {
    id: 'rosenhave',
    name: 'Rosenhave',
    kind: 'paper',
    pattern: 'rosenhave',
    colour: '#d8b2ab',
    swatch: ['#d8b2ab', '#e5806c', '#97a08a'],
    woodwork: '#93717d', // mauve-painted woodwork, as in Selma's reference
    repeatH: ROLL * 1.2,
  },
  {
    id: 'smalle-striber',
    name: 'Smalle striber',
    kind: 'paper',
    pattern: 'smalle',
    colour: '#ecdcaa',
    swatch: ['#ecdcaa', '#f5ebcb', '#ecdcaa'],
    woodwork: '#f2eee4',
    repeatH: ROLL,
  },
  {
    id: 'brede-striber',
    name: 'Brede striber',
    kind: 'paper',
    pattern: 'brede',
    colour: '#f0d98c',
    swatch: ['#f0d98c', '#f8f4e8', '#f0d98c'],
    woodwork: '#f4f1e8',
    repeatH: ROLL,
  },
];

// ------------------------------------------------------------------ drawing helpers
// Draw `fn` nine times so anything crossing an edge reappears on the other side
function wrapped(g, W, H, fn) {
  for (const dy of [-H, 0, H]) {
    for (const dx of [-W, 0, W]) {
      g.save();
      g.translate(dx, dy);
      fn(g);
      g.restore();
    }
  }
}

// A leaf from (0,0) along +x, length L, half-width w, with a lighter mid-vein
function leaf(g, x, y, angle, L, w, fill, vein, { curl = 0.15, serrate = 0 } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, 0);
  const steps = serrate ? 10 : 1;
  if (steps === 1) {
    g.bezierCurveTo(L * 0.25, -w * 1.2, L * 0.7, -w * (1 + curl), L, curl * w * 2);
    g.bezierCurveTo(L * 0.7, w * (1 - curl), L * 0.25, w * 1.1, 0, 0);
  } else {
    // a toothed edge, like Morris' acanthus
    const edge = (side) => {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const half = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * (side < 0 ? 1 + curl : 1 - curl);
        const tooth = i % 2 ? serrate * w : 0;
        g.lineTo(L * t, side * (half + tooth) + curl * w * 2 * t * t);
      }
    };
    edge(-1);
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const half = Math.sin(Math.PI * Math.pow(t, 0.8)) * w * (1 - curl);
      const tooth = i % 2 ? serrate * w : 0;
      g.lineTo(L * t, half + tooth + curl * w * 2 * t * t);
    }
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (vein) {
    g.strokeStyle = vein;
    g.lineWidth = Math.max(1, w * 0.12);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(L * 0.04, 0);
    g.quadraticCurveTo(L * 0.5, curl * w * 0.6, L * 0.92, curl * w * 1.7);
    g.stroke();
    // side veins
    g.lineWidth = Math.max(0.6, w * 0.05);
    for (let i = 1; i < 5; i++) {
      const t = i / 5;
      g.beginPath();
      g.moveTo(L * t * 0.9, curl * w * t * 0.8);
      g.lineTo(L * (t * 0.9 + 0.1), -w * 0.55 * Math.sin(Math.PI * t));
      g.moveTo(L * t * 0.9, curl * w * t * 0.8);
      g.lineTo(L * (t * 0.9 + 0.1), w * 0.5 * Math.sin(Math.PI * t));
      g.stroke();
    }
  }
  g.restore();
}

function stem(g, pts, width, colour) {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  g.bezierCurveTo(pts[2], pts[3], pts[4], pts[5], pts[6], pts[7]);
  g.stroke();
}

const bez = (p, t) => {
  const u = 1 - t;
  return [
    u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
    u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
  ];
};
const bezAngle = (p, t) => {
  const a = bez(p, Math.max(0, t - 0.01));
  const b = bez(p, Math.min(1, t + 0.01));
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
};

// A cream tulip: three cupped petals with soft ochre shading and an outline
function tulip(g, x, y, angle, s, { cream, shade, line }) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.lineJoin = 'round';
  const petal = (dx, w, h, tilt, fill) => {
    g.save();
    g.translate(dx, 0);
    g.rotate(tilt);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-w, -h * 0.15, -w * 0.95, -h * 0.85, -w * 0.15, -h);
    g.quadraticCurveTo(0, -h * 0.8, w * 0.15, -h);
    g.bezierCurveTo(w * 0.95, -h * 0.85, w, -h * 0.15, 0, 0);
    g.closePath();
    const grd = g.createLinearGradient(0, 0, 0, -h);
    grd.addColorStop(0, shade);
    grd.addColorStop(0.55, fill);
    grd.addColorStop(1, fill);
    g.fillStyle = grd;
    g.fill();
    g.strokeStyle = line;
    g.lineWidth = s * 0.035;
    g.stroke();
    g.restore();
  };
  petal(-s * 0.22, s * 0.3, s * 0.95, -0.28, cream);
  petal(s * 0.22, s * 0.3, s * 0.95, 0.28, cream);
  petal(0, s * 0.34, s * 1.05, 0, cream);
  // fine hatching on the middle petal, like a woodblock print
  g.strokeStyle = shade;
  g.lineWidth = s * 0.02;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(i * s * 0.07, -s * 0.12);
    g.quadraticCurveTo(i * s * 0.09, -s * 0.5, i * s * 0.05, -s * 0.78);
    g.stroke();
  }
  // calyx
  g.fillStyle = line;
  g.beginPath();
  g.ellipse(0, s * 0.02, s * 0.12, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function blossom(g, x, y, r, petals, fill, centre, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = fill;
  for (let i = 0; i < petals; i++) {
    g.rotate((Math.PI * 2) / petals);
    g.beginPath();
    g.ellipse(r * 0.55, 0, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = centre;
  g.beginPath();
  g.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// Paper grain + print misregistration noise over the whole tile
function paperGrain(g, W, H, amount, seed) {
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = (fbm(x / W, y / H, 64, 2, seed) - 0.5) * amount * 255;
      const i = (y * W + x) * 4;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
  }
  g.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ patterns
function drawTulipan(g, W, H) {
  const C = {
    ground: '#44523e',
    groundDeep: '#3a4735',
    groundLight: '#4f5e47',
    leafDark: '#5e6d51',
    leaf: '#7b8966',
    leafLight: '#9aa684',
    vein: 'rgba(222, 220, 180, 0.5)',
    stem: '#2e3829',
    cream: '#ece0c0',
    shade: '#c8ad84',
    line: '#2e3829',
  };
  g.fillStyle = C.ground;
  g.fillRect(0, 0, W, H);
  const s = W / 530; // px per mm
  // Background: a dense scatter of small tonal leaves (Morris' "fill")
  wrapped(g, W, H, (gg) => {
    const rr = rand(3);
    for (let i = 0; i < 260; i++) {
      const tone = rr() < 0.6 ? C.groundDeep : C.groundLight;
      leaf(gg, rr() * W, rr() * H, rr() * Math.PI * 2, (18 + rr() * 22) * s, (5 + rr() * 4) * s, tone, null);
    }
  });
  // Three scrolling main stems per repeat, with large toothed leaves along them
  const stems = [
    [0.02 * W, 1.0 * H, 0.42 * W, 0.8 * H, -0.04 * W, 0.4 * H, 0.36 * W, 0.0 * H],
    [0.36 * W, 1.0 * H, 0.75 * W, 0.78 * H, 0.3 * W, 0.42 * H, 0.7 * W, 0.0 * H],
    [0.7 * W, 1.0 * H, 1.05 * W, 0.75 * H, 0.66 * W, 0.38 * H, 1.02 * W, 0.0 * H],
  ];
  wrapped(g, W, H, (gg) => {
    const rr = rand(11);
    for (const p of stems) {
      stem(gg, p, 5 * s, C.stem);
      for (let i = 0; i < 11; i++) {
        const t = 0.03 + (i / 11) * 0.94;
        const [x, y] = bez(p, t);
        const a = bezAngle(p, t);
        const side = i % 2 ? 1 : -1;
        const L = (75 + rr() * 45) * s;
        const tone = rr() < 0.5 ? C.leaf : C.leafDark;
        leaf(gg, x, y, a + side * (0.65 + rr() * 0.45), L, (17 + rr() * 7) * s, tone, C.vein, {
          curl: side * 0.25,
          serrate: rr() < 0.55 ? 0.14 : 0,
        });
      }
    }
  });
  // Tulips with their own leaves, and small blossoms
  const tulips = [
    [0.33 * W, 0.12 * H, -0.12, 1.0],
    [0.83 * W, 0.3 * H, 0.22, 0.92],
    [0.12 * W, 0.62 * H, -0.42, 0.88],
    [0.58 * W, 0.72 * H, 0.3, 0.95],
  ];
  wrapped(g, W, H, (gg) => {
    for (const [x, y, a, k] of tulips) {
      leaf(gg, x, y + 45 * s, -Math.PI / 2 - 0.95 + a, 115 * s * k, 22 * s * k, C.leafLight, C.vein, { curl: -0.3 });
      leaf(gg, x, y + 45 * s, -Math.PI / 2 + 0.95 + a, 105 * s * k, 21 * s * k, C.leaf, C.vein, { curl: 0.3 });
      tulip(gg, x, y + 34 * s, a, 92 * s * k, C);
    }
    const rr = rand(19);
    for (let i = 0; i < 22; i++) {
      blossom(gg, rr() * W, rr() * H, (9 + rr() * 6) * s, 5, C.cream, C.shade, rr() * 6);
    }
    for (let i = 0; i < 60; i++) {
      gg.fillStyle = rr() < 0.5 ? C.cream : C.leafLight;
      gg.beginPath();
      gg.arc(rr() * W, rr() * H, (1.8 + rr() * 2) * s, 0, Math.PI * 2);
      gg.fill();
    }
  });
}

// A full, ruffled bloom seen from above: broad pale outer petals, tighter and
// deeper-coloured cupped petals towards the heart, soft shadow between them
function bloom(g, x, y, R, { outer, inner, heart, edge }, seed) {
  const rr = rand(seed);
  g.save();
  g.translate(x, y);
  g.rotate(rr() * Math.PI);
  // soft shadow under the whole flower
  const sh = g.createRadialGradient(R * 0.06, R * 0.08, R * 0.5, R * 0.06, R * 0.08, R * 1.15);
  sh.addColorStop(0, 'rgba(120,60,60,0.22)');
  sh.addColorStop(1, 'rgba(120,60,60,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.arc(R * 0.06, R * 0.08, R * 1.15, 0, Math.PI * 2);
  g.fill();
  const rings = 5;
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1);
    const rad = R * (1 - t * 0.78);
    const n = Math.round(5 + (1 - t) * 3);
    const col = mixHex(outer, inner, Math.pow(t, 0.8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.7 + (rr() - 0.5) * 0.35;
      const len = rad * (0.85 + rr() * 0.2);
      const pw = len * (0.62 + rr() * 0.12);
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-pw, len * 0.15, -pw * 1.05, len * 0.95, -pw * 0.2, len * 1.02);
      g.quadraticCurveTo(0, len * (0.92 + rr() * 0.12), pw * 0.2, len * 1.02);
      g.bezierCurveTo(pw * 1.05, len * 0.95, pw, len * 0.15, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, len);
      grd.addColorStop(0, mixHex(col, heart, 0.55));
      grd.addColorStop(0.45, col);
      grd.addColorStop(0.9, mixHex(col, '#fff4ee', 0.28));
      grd.addColorStop(1, mixHex(col, '#fff4ee', 0.4));
      g.fillStyle = grd;
      g.fill();
      g.strokeStyle = edge;
      g.lineWidth = R * 0.014;
      g.stroke();
      g.restore();
    }
  }
  const hg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.16);
  hg.addColorStop(0, heart);
  hg.addColorStop(1, mixHex(heart, inner, 0.6));
  g.fillStyle = hg;
  g.beginPath();
  g.arc(0, 0, R * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

const rgbOf = (c) =>
  c[0] === '#' ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) : c.match(/\d+/g).slice(0, 3).map(Number);

// Mix two colours ('#rrggbb' or 'rgb(r,g,b)'), returning 'rgb(r,g,b)'
function mixHex(a, b, t) {
  const pa = rgbOf(a);
  const pb = rgbOf(b);
  const m = (i) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

function drawRosenhave(g, W, H) {
  const C = {
    ground: '#d8b2ab',
    groundLine: 'rgba(185, 140, 136, 0.35)',
    leaf: '#97a08a',
    leafDark: '#7c8772',
    vein: 'rgba(240, 236, 220, 0.4)',
    stem: '#7c8772',
  };
  g.fillStyle = C.ground;
  g.fillRect(0, 0, W, H);
  const s = W / 530;
  // faint trellis of hand-drawn ground lines
  wrapped(g, W, H, (gg) => {
    gg.strokeStyle = C.groundLine;
    gg.lineWidth = 1.2 * s;
    const rr = rand(4);
    for (let i = 0; i < 60; i++) {
      const x = rr() * W;
      const y = rr() * H;
      gg.beginPath();
      gg.moveTo(x, y);
      gg.quadraticCurveTo(x + 10 * s, y - 14 * s, x + 4 * s, y - 28 * s);
      gg.stroke();
    }
  });
  const flowers = [
    { x: 0.26 * W, y: 0.22 * H, R: 92 * s, pal: 0 },
    { x: 0.78 * W, y: 0.5 * H, R: 108 * s, pal: 1 },
    { x: 0.22 * W, y: 0.82 * H, R: 80 * s, pal: 2 },
    { x: 0.7 * W, y: 0.04 * H, R: 52 * s, pal: 2 },
    { x: 0.5 * W, y: 0.66 * H, R: 44 * s, pal: 0 },
    { x: 0.98 * W, y: 0.9 * H, R: 40 * s, pal: 0 },
  ];
  const PAL = [
    { outer: '#efb3ac', inner: '#de7f78', heart: '#a9484f', edge: 'rgba(150,70,70,0.35)' },
    { outer: '#f2a48d', inner: '#e5735c', heart: '#a8463a', edge: 'rgba(150,70,60,0.35)' },
    { outer: '#f3c3bd', inner: '#e8968f', heart: '#b55a60', edge: 'rgba(150,80,80,0.3)' },
  ];
  // stems and leaves behind the blooms
  wrapped(g, W, H, (gg) => {
    const rr = rand(23);
    for (const f of flowers) {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rr() * 0.6;
        const L = f.R * (1.25 + rr() * 0.55);
        leaf(gg, f.x + Math.cos(a) * f.R * 0.4, f.y + Math.sin(a) * f.R * 0.4, a, L, L * 0.28, rr() < 0.5 ? C.leaf : C.leafDark, C.vein, {
          curl: (rr() - 0.5) * 0.5,
        });
      }
    }
    // little sprigs of buds between the blooms
    for (let i = 0; i < 9; i++) {
      const x = rr() * W;
      const y = rr() * H;
      const a = -Math.PI / 2 + (rr() - 0.5) * 1.2;
      stem(gg, [x, y, x + 6 * s, y - 20 * s, x - 8 * s, y - 34 * s, x + Math.cos(a) * 46 * s, y + Math.sin(a) * 46 * s], 2.2 * s, C.stem);
      leaf(gg, x, y - 12 * s, a - 0.9, 26 * s, 8 * s, C.leaf, null);
      gg.fillStyle = '#e48a7b';
      gg.beginPath();
      gg.ellipse(x + Math.cos(a) * 46 * s, y + Math.sin(a) * 46 * s, 7 * s, 10 * s, a + Math.PI / 2, 0, Math.PI * 2);
      gg.fill();
    }
  });
  wrapped(g, W, H, (gg) => {
    flowers.forEach((f, i) => bloom(gg, f.x, f.y, f.R, PAL[f.pal], 40 + i));
  });
}

function drawSmalle(g, W, H) {
  // Tone-on-tone: buttery ground, a slightly paler satin stripe every 26.5 mm
  g.fillStyle = '#ecdcaa';
  g.fillRect(0, 0, W, H);
  const n = 20; // stripes per roll width
  const pitch = W / n;
  for (let i = 0; i < n; i++) {
    const x = i * pitch;
    g.fillStyle = '#f4e9c6';
    g.fillRect(x + pitch * 0.12, 0, pitch * 0.42, H);
    g.fillStyle = 'rgba(205, 180, 120, 0.55)';
    g.fillRect(x + pitch * 0.7, 0, Math.max(1, pitch * 0.05), H);
  }
}

function drawBrede(g, W, H) {
  // Wide awning stripes: 6 per roll (8.8 cm), soft yellow and warm white
  const n = 6;
  const pitch = W / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#f8f4e8' : '#f0d98c';
    g.fillRect(i * pitch, 0, pitch, H);
  }
  // a hairline in the yellow, as printed
  g.fillStyle = 'rgba(214, 178, 86, 0.6)';
  for (let i = 0; i < n; i += 2) {
    g.fillRect(i * pitch + pitch * 0.08, 0, Math.max(1, pitch * 0.012), H);
    g.fillRect(i * pitch + pitch * 0.9, 0, Math.max(1, pitch * 0.012), H);
  }
}

const DRAW = { tulipan: drawTulipan, rosenhave: drawRosenhave, smalle: drawSmalle, brede: drawBrede };

/**
 * Textures for a wallpaper: { map, normal, rough, width, height } where width
 * and height are the real-world size of one tile in metres.
 */
/** The paper's colour, roughness and relief as canvases (baked by baked.js). */
export function wallpaperCanvases(wall, px = 1024) {
  const W = px;
  const H = Math.round((px * wall.repeatH) / ROLL);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  DRAW[wall.pattern](g, W, H);
  paperGrain(g, W, H, wall.pattern === 'brede' || wall.pattern === 'smalle' ? 0.025 : 0.04, 9);

  // The seam between two drops, barely visible, at the tile's edge
  g.fillStyle = 'rgba(0,0,0,0.07)';
  g.fillRect(0, 0, Math.max(1, W / 700), H);

  // Roughness: printed ink and satin stripes are a touch shinier than the paper
  const rc = makeCanvas(W / 2, H / 2);
  const rg = rc.getContext('2d');
  rg.drawImage(c, 0, 0, W / 2, H / 2);
  const img = rg.getImageData(0, 0, W / 2, H / 2);
  const d = img.data;
  const base = wall.pattern === 'smalle' ? 0.86 : 0.8;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    let r = base;
    if (wall.pattern === 'smalle') r = lum > 0.9 ? 0.5 : 0.86; // satin stripe
    else if (wall.pattern === 'tulipan') r = lum > 0.55 ? 0.58 : base; // cream ink
    else if (wall.pattern === 'rosenhave') r = 0.72;
    else r = 0.78;
    d[i] = d[i + 1] = d[i + 2] = r * 255;
  }
  rg.putImageData(img, 0, 0);

  // Embossed paper: fine fibres plus a slight relief where the ink sits
  const NW = 256;
  const NH = Math.round((NW * H) / W);
  const sc = makeCanvas(NW, NH);
  const sg = sc.getContext('2d');
  sg.drawImage(c, 0, 0, NW, NH);
  const sd = sg.getImageData(0, 0, NW, NH).data;
  const height = new Float32Array(NW * NH);
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const i = (y * NW + x) * 4;
      const lum = (sd[i] * 0.3 + sd[i + 1] * 0.59 + sd[i + 2] * 0.11) / 255;
      height[y * NW + x] = lum * 0.5 + fbm(x / NW, y / NH, 48, 2, 3) * 0.6;
    }
  }
  const normal = normalFromHeight(height, NW, 1.2, NH);

  return { map: c, rough: rc, normal };
}

/** Textures for one drop of paper; `canvases` from wallpaperCanvases or baked. */
export function wallpaperTextures(wall, px = 1024, canvases = wallpaperCanvases(wall, px)) {
  return {
    map: toTexture(canvases.map),
    rough: toTexture(canvases.rough, { srgb: false }),
    normal: toTexture(canvases.normal, { srgb: false }),
    width: ROLL,
    height: wall.repeatH,
  };
}

// A small square preview for the swatch rail (CSS background)
export function wallpaperSwatch(wall, px = 160) {
  const c = makeCanvas(px, px);
  const g = c.getContext('2d');
  // Draw at a scale where ~30 cm of paper fills the swatch
  const tile = makeCanvas(Math.round(px * 1.8), Math.round((px * 1.8 * wall.repeatH) / ROLL));
  DRAW[wall.pattern](tile.getContext('2d'), tile.width, tile.height);
  g.drawImage(tile, -px * 0.2, -px * 0.1);
  return c.toDataURL('image/png');
}
