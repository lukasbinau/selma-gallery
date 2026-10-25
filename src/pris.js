// Prices in vaerker.json are whole kroner; null or empty means "not shown".
// Shared by the build (vite.config.js), the contact sheet and the gallery plaques.
export const hasPris = (n) => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n)) && Number(n) > 0;

// 2399 → "2.399 kr." (Danish thousands separator, no Intl needed)
export const formatPris = (n) => `${String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kr.`;
