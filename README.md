# Selma Frausing Binau · Kunst

Selmas hjemmeside: en forside med hendes værker og et realistisk 3D-galleri, man kan gå igennem. Statisk site uden butik; køb foregår ved at skrive til Selma.

**Live:** https://selmabinaukunst.dk (den gamle adresse lukasbinau.github.io/selma-gallery sender videre hertil)

## Udvikling

```bash
npm install
npm run dev
```

- Forsiden: `index.html`, `src/front.css`, `src/front.js`, `src/router.js`, `src/contact.js`
- 3D-galleriet: `src/gallery/` (hentes først, når nogen åbner det)
- Testside for galleriet alene: `/dev-galleri.html`

Et push til `main` deployer automatisk til GitHub Pages.

## Sådan tilføjer du et værk

1. Læg fotoet i `source/` og tilføj det til tabellen øverst i `scripts/prepare-images.mjs` (lige forfra = ingen hjørner; fotograferet skævt = angiv de fire hjørner, så rettes det op).
2. Kør `npm run images`. Det laver `public/art/<id>-{2048,1024,640}.jpg` og opdaterer `src/art-meta.json`.
3. Tilføj værket til `src/vaerker.json` (id, titel, år, om, teknik, mål, ramme, solgt). Rækkefølgen i filen er rækkefølgen på forsiden og i galleriet. Tomme felter vises ikke.

Tekster på forsiden (bio m.m.) rettes direkte i `index.html`. De fire store ordmærker er vektorgrafik fra Canva-designet (`src/wordmarks/`); kør `node scripts/extract-wordmarks.mjs <Selma.svg>` efter en ny Canva-eksport.
