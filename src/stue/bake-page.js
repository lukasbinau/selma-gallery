// /dev-bake.html: draws every recipe in baked.js the slow way and prints the
// canvases as PNG data URLs for scripts/bake-textures.mjs to save.
import { RECIPES, partsOf } from './baked.js';

const out = {};
for (const [key, recipe] of Object.entries(RECIPES)) {
  for (const [part, canvas] of Object.entries(partsOf(recipe()))) {
    out[part ? `${key}.${part}` : key] = canvas.toDataURL('image/png');
  }
}
document.getElementById('out').textContent = `BAKE${JSON.stringify(out)}BAKE`;
