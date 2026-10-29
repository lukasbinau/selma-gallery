// Bakes the room's procedural textures (src/stue/baked.js) to image files:
//
//   node scripts/bake-textures.mjs
//
// Starts Vite, draws every recipe in headless Chrome (/dev-bake.html), and
// writes public/stue-tex/<key>[.<part>].webp plus src/stue/baked.json, the list
// of parts per key. Set CHROME=<path> if Chrome is not found.
import { createServer } from 'vite';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import sharp from 'sharp';

const OUT = 'public/stue-tex';
const PORT = 5199;

const chrome =
  process.env.CHROME ||
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
if (!chrome) throw new Error('Chrome not found: set CHROME=<path to chrome>');

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
let dom;
try {
  ({ stdout: dom } = await promisify(execFile)(
    chrome,
    ['--headless=new', '--disable-gpu', '--virtual-time-budget=120000', '--dump-dom', `http://localhost:${PORT}/dev-bake.html`],
    { maxBuffer: 1 << 30 },
  ));
} finally {
  await server.close();
}
const m = /BAKE(\{.*\})BAKE/s.exec(dom);
if (!m) throw new Error('the bake page printed nothing; open /dev-bake.html in the dev server to see why');
const images = JSON.parse(m[1]);

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(`${OUT}/${f}`);
const manifest = {};
let total = 0;
for (const [name, url] of Object.entries(images)) {
  const [key, part = ''] = name.split('.');
  (manifest[key] ??= []).push(part);
  const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  // Colour maps can be lossy; relief and roughness a little less so
  const quality = part === 'normal' || part === 'rough' ? 92 : 88;
  const info = await sharp(png).webp({ quality, effort: 6 }).toFile(`${OUT}/${name}.webp`);
  total += info.size;
  console.log(name.padEnd(28), `${info.width}×${info.height}`, `${Math.round(info.size / 1024)} KB`);
}
writeFileSync('src/stue/baked.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`${Object.keys(images).length} files, ${Math.round(total / 1024)} KB in ${OUT}`);
