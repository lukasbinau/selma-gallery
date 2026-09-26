// The artworks on the wall, in hanging order.
// frame: 'mat'   = paper work, white passe-partout + thin black frame
//        'float' = canvas in a slim oak float frame
//        'bare'  = the photo already includes its own frame
// price is in DKK. sold: true shows the gallery red dot instead of a buy button.
const art = (file) => `${import.meta.env.BASE_URL}art/${file}`;

export const ARTIST = 'Selma Frausing Benau';

export const paintings = [
  {
    id: 'portrait-in-vermilion',
    src: art('portrait-orange.jpg'),
    frame: 'mat',
    title: 'Portrait in Vermilion',
    year: 2025,
    medium: 'Oil pastel and gouache on paper',
    size: '30 × 40 cm',
    description:
      'A face built from blocks of colour — violet hair, a flushed red cheek, a cool blue jaw — held together by a single confident black line.',
    price: 2800,
  },
  {
    id: 'the-door-and-the-window',
    src: art('red-blue-canyon.jpg'),
    frame: 'float',
    title: 'The Door and the Window',
    year: 2025,
    medium: 'Oil on canvas',
    size: '40 × 50 cm',
    description:
      'A red wall opens twice: once onto a window holding a single star, once onto blue steps that lead down to where that star is reflected.',
    price: 4200,
  },
  {
    id: 'rapeseed-season',
    src: art('fields.jpg'),
    frame: 'mat',
    title: 'Rapeseed Season',
    year: 2026,
    medium: 'Oil pastel on paper',
    size: '45 × 35 cm',
    description:
      'Rolling fields stitched together with cobalt hedgerows, the yellow rows almost humming beneath a flat summer sky.',
    price: 3200,
  },
  {
    id: 'blue-hour',
    src: art('blue-house.jpg'),
    frame: 'bare',
    title: 'Blue Hour',
    year: 2025,
    medium: 'Oil and oil pastel on canvas, artist’s frame',
    size: '50 × 60 cm',
    description:
      'A house and its trees dissolve into ultramarine until only chalky outlines remain — the street as you remember it after dark.',
    price: 4500,
    sold: true,
  },
  {
    id: 'green-glass-on-stripes',
    src: art('green-glass.jpg'),
    frame: 'mat',
    title: 'Green Glass on Stripes',
    year: 2026,
    medium: 'Watercolour on paper',
    size: '21 × 30 cm',
    description:
      'A jug and a wine glass on a striped cloth, with light passing through the green glass and pooling in coloured shadows.',
    price: 1600,
  },
  {
    id: 'field-path',
    src: art('fields-vertical.jpg'),
    frame: 'mat',
    title: 'Field Path',
    year: 2026,
    medium: 'Oil pastel on paper',
    size: '35 × 45 cm',
    description:
      'The same fields, seen from the path itself: the land folds upward into a patchwork of rows, with a strip of sky held at the edge.',
    price: 2600,
  },
];

const dkk = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 });
export const formatPrice = (n) => dkk.format(n);
