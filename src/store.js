// Persisted viewer settings (room theme, camera motion, plaques, atmosphere).
// localStorage can be unavailable (private mode, blocked storage), so every
// access is guarded and the site still works without it.

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in memory only */
  }
};
const emit = (name, detail) => dispatchEvent(new CustomEvent(name, { detail }));

// The shop is gone; forget any cart an earlier visit left behind
try {
  localStorage.removeItem('selma:cart');
} catch {
  /* ignore */
}

// ---------------------------------------------------------------- settings
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Keys and values are the same as before, so existing visitors' choices survive:
// theme evening|daylight, motion full|reduced, plaques on|off, fx on|off
export const settings = {
  theme: 'evening',
  motion: prefersReduced ? 'reduced' : 'full',
  plaques: 'on',
  fx: 'on', // atmosphere: dust, light beams, vignette, grain
  ...read('selma:settings', {}),
};

export function setSetting(key, value) {
  settings[key] = value;
  write('selma:settings', settings);
  emit('settings:change', { key, value });
}
