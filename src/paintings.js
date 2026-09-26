// The artworks on the wall, in hanging order.
// frame: 'mat'   = paper work, white passe-partout + thin black frame
//        'float' = canvas in a slim oak float frame
//        'bare'  = the photo already includes its own frame
// price is in DKK. sold: true shows the gallery red dot instead of a buy button.
const art = (file) => `${import.meta.env.BASE_URL}art/${file}`;

export const ARTIST = 'Selma Frausing Binau';

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
      'A face made of weather: violet at the crown, fire in the cheek, and one dark line holding it all together.',
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
      'The wall opens twice. Once for a star, and once for the steps that walk down to meet it.',
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
      'Summer, in rows. The fields hum yellow, stitched shut with blue, under a sky that asks for nothing.',
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
      'The house forgets its edges. What is left is the chalk of it, the trees, and the long blue after.',
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
      'Light goes into the green glass and comes out as shadow, quietly, on a striped afternoon.',
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
      'Walk far enough in and the land stands up around you, row on row, with only a strip of sky to keep.',
    price: 2600,
  },
];

const dkk = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 });
export const formatPrice = (n) => dkk.format(n);
