// The front page's own behaviour: the menu bar follows the section under it,
// section tabs scroll smoothly, and every "Skriv til Selma" opens the contact
// sheet. Entering the gallery is the router's job (src/router.js).
import { openContact } from './contact.js';

const html = document.documentElement;
const themeMeta = document.querySelector('meta[name="theme-color"]');
const tabs = [...document.querySelectorAll('.bar__tab[data-tab]')];
const sections = [...document.querySelectorAll('main > section[id]')];

export const SECTION_COLOUR = { top: '#ff2234', vaerker: '#5e17eb', processen: '#ff2234' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let current = html.dataset.section || 'top';
export const currentSection = () => current;

export function setThemeColor(colour) {
  if (themeMeta) themeMeta.content = colour;
}

export function setSection(id) {
  if (!SECTION_COLOUR[id]) return;
  current = id;
  html.dataset.section = id;
  tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === id));
  if (html.dataset.view !== 'galleri') setThemeColor(SECTION_COLOUR[id]);
}

// Which section crosses the middle of the viewport
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) if (e.isIntersecting) setSection(e.target.id);
  },
  { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
);
sections.forEach((s) => observer.observe(s));
setSection(current);

// Section links (menu tabs, "SE MIN KUNST"): no hash jump, a smooth scroll and
// the URL kept in step. Gallery links are left to the router.
export function scrollToSection(id, behavior = reduced.matches ? 'auto' : 'smooth') {
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView({ behavior, block: 'start' });
  setSection(id);
  return true;
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.hasAttribute('data-galleri') || a.getAttribute('href').startsWith('#galleri')) return;
  const id = a.getAttribute('href').slice(1);
  if (!document.getElementById(id)) return;
  e.preventDefault();
  if (html.dataset.view === 'galleri') return;
  history.replaceState(history.state, '', `#${id}`);
  scrollToSection(id);
});

// Every "Skriv til Selma": card buttons, KONTAKT tab, footer
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-contact]');
  if (!b || b.closest('#galleri')) return; // the room's plaques emit 'contact' themselves (router)
  e.preventDefault();
  e.stopPropagation();
  openContact({ id: b.dataset.contact || null, from: b });
});

// CSS smooth scrolling only once the page has settled (not on the initial jump)
addEventListener('load', () => requestAnimationFrame(() => html.classList.add('is-loaded')));
