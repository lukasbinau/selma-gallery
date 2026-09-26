import { defineConfig } from 'vite';

// GitHub Pages serves the site from /selma-gallery/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/selma-gallery/' : '/',
}));
