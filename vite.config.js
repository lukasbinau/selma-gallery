import { defineConfig } from 'vite';

// Relative asset paths: the site works both at lukasbinau.github.io/selma-gallery/
// and at the root of the custom domain (selmabinaukunst.dk)
export default defineConfig({
  base: './',
});
