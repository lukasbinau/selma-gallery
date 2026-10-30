# Selma Frausing Binau · Kunst

Selmas hjemmeside: en forside med hendes værker og et realistisk 3D-galleri, man kan gå igennem. Statisk site uden butik; køb foregår ved at skrive til Selma, og betaling sker med MobilePay.

**Live:** https://selmabinaukunst.dk (den gamle adresse lukasbinau.github.io/selma-gallery sender videre hertil)

## Udvikling

```bash
npm install
npm run dev
```

- Forsiden: `index.html`, `src/front.css`, `src/front.js`, `src/router.js`, `src/contact.js`
- 3D-galleriet: `src/gallery/` (hentes først, når nogen åbner det)
- Testside for galleriet alene: `/dev-galleri.html`
- "I din stue" (et værk i en stue, med ramme og væg): `src/stue/`, testside `/dev-stue.html?id=<værk>`

Et push til `main` deployer automatisk til GitHub Pages.

## Sådan tilføjer du et værk

1. Læg fotoet i `source/` og tilføj det til tabellen øverst i `scripts/prepare-images.mjs` (lige forfra = ingen hjørner; fotograferet skævt = angiv de fire hjørner, så rettes det op).
2. Kør `npm run images`. Det laver `public/art/<id>-{2048,1024,640}.{avif,webp,jpg}` (browseren vælger det mindste format, den kan læse) og opdaterer `src/art-meta.json`. Det tager et par minutter: AVIF er langsom at lave.
3. Tilføj værket til `src/vaerker.json` (id, titel, aar, om, teknik, maal, pris, ramme, solgt). Rækkefølgen i filen er rækkefølgen på forsiden og i galleriet. Tomme felter vises ikke. `pris` er hele kroner som et tal (`2399` vises som "2.399 kr."); `null` = ingen pris vises.

Tekster på forsiden (bio m.m.) rettes direkte i `index.html`. De store ordmærker er vektorgrafik fra Canva-designet (`src/wordmarks/`); kør `node scripts/extract-wordmarks.mjs <Selma.svg>` efter en ny Canva-eksport. "SELMA BINAU KUNST" i menulinjen og "OM MIG" er sat af de samme bogstaver med `node scripts/compose-wordmarks.mjs` (B, I og det smalle M fandtes ikke i designet og er tegnet til).

Mønsterfliserne i siderne (firkløveren og solen) skæres ud i `TILES` øverst i `scripts/prepare-images.mjs`; skift kilde eller udsnit dér og kør `npm run images`.

## Stuens teksturer

Gulv, træ, stoffer, puds og tapeter i "I din stue" tegnes af kode i `src/stue/textures.js` og `src/stue/wallpapers.js`, men de er bagt på forhånd til små billedfiler i `public/stue-tex/`, så browseren ikke skal tegne dem (gulvet alene tog over 3 sekunder). Har du ændret en tekstur, så kør `node scripts/bake-textures.mjs` (kræver Chrome). Listen over bagte teksturer står i `RECIPES` i `src/stue/baked.js`.

## Rammer i "I din stue"

Rammerne, kunden kan vælge, står i `src/stue/frames.json` (kun kundepriser, aldrig indkøbspriser: filen ligger offentligt). Et værk får kun de rammer at se, der findes i en størrelse, som passer til værkets `maal`, eller som kan laves på mål (feltet `specialmaal`: grundpris plus pris pr. meter omkreds). Mindst én egetræsramme kan altid laves på mål, så alle værker med rammevalg kan få en. Rækkefølgen i filen er rækkefølgen på rammevælgeren. Priserne er anslåede (opdateret 2026-10-30), og den endelige liste over rammer kommer fra Selma. Kilder og licenser for stuen: `src/stue/CREDITS.md`.

## Rejsen bag Lille stjernes dør

Et skjult indslag i galleriet: tryk på stjernen (eller den nederste dør) i Lille stjerne. Figurerne i rejsen er klippet ud af fotoene med `node scripts/dream-cutouts.mjs` (skriver `public/art/dream/*.webp` og `src/gallery/dream-cast.json`); kør det igen, hvis et af de fotos skiftes. Historiens tekster står i `STORY` øverst i `src/gallery/dream.js`.
