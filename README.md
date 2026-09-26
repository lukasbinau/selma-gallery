# Selma Frausing Benau · Paintings

An online exhibition of Selma's paintings: a 3D gallery room you walk through by swiping, with a plaque under every painting and a pretend shop (no real payments).

**Live:** https://lukasbinau.github.io/selma-gallery/

## Develop

```bash
npm install
npm run dev
```

- Paintings, titles, descriptions and prices: `src/paintings.js`
- Re-crop / resize the source photos into `public/art`: `npm run images` (see `scripts/prepare-images.mjs`)
- Pushing to `main` deploys to GitHub Pages automatically.
