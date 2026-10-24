// Straightens a painting photographed at an angle: maps the four corners you
// give (clockwise from top-left, in source pixels) onto a flat rectangle.
// Pure JS on raw pixels (sharp has no perspective warp); fine for a few images.
import sharp from 'sharp';

// Solve the 3×3 homography that maps the unit square to the quad
function homography([p0, p1, p2, p3]) {
  // Rows of the 8×8 system for x' = (a x + b y + c) / (g x + h y + 1)
  const src = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const dst = [p0, p1, p2, p3];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [...h, 1];
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * @param {string|Buffer} input  image file or buffer
 * @param {number[][]} corners   [[x,y] top-left, top-right, bottom-right, bottom-left]
 * @param {number} maxEdge       longest output edge in px
 * @returns {Promise<sharp.Sharp>} the straightened image
 */
export async function rectify(input, corners, maxEdge = 2048) {
  const { data, info } = await sharp(input).rotate().flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  const { width: sw, height: sh, channels } = info;
  const [tl, tr, br, bl] = corners;
  // Output aspect from the quad's average edge lengths
  const w0 = (dist(tl, tr) + dist(bl, br)) / 2;
  const h0 = (dist(tl, bl) + dist(tr, br)) / 2;
  const scale = maxEdge / Math.max(w0, h0);
  const ow = Math.round(w0 * scale);
  const oh = Math.round(h0 * scale);
  const H = homography(corners);
  const out = Buffer.alloc(ow * oh * 3);
  for (let y = 0; y < oh; y++) {
    const v = (y + 0.5) / oh;
    for (let x = 0; x < ow; x++) {
      const u = (x + 0.5) / ow;
      const d = H[6] * u + H[7] * v + 1;
      const sx = (H[0] * u + H[1] * v + H[2]) / d;
      const sy = (H[3] * u + H[4] * v + H[5]) / d;
      // Bilinear sample
      const x0 = Math.max(0, Math.min(sw - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(sh - 2, Math.floor(sy)));
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));
      const i00 = (y0 * sw + x0) * channels;
      const i10 = i00 + channels;
      const i01 = i00 + sw * channels;
      const i11 = i01 + channels;
      const o = (y * ow + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
        const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return sharp(out, { raw: { width: ow, height: oh, channels: 3 } });
}
