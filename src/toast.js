// One small status line at the bottom of the screen, shared by the front page,
// the router and the contact sheet.
const el = document.querySelector('.toast');
let timer;

export function toast(message, ms = 2400) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('is-visible'), ms);
}
