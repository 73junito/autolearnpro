/**
 * `apps/catalog` entry module — C3-R34.
 *
 * **C3-R33 D7:** this is the only module in the application permitted to touch the DOM. Everything that
 * decides *what* is shown must live in pure modules importable in bare Node. The skeleton has no such
 * decisions yet, so no `src/lib/` exists; this file must not become the place where one is invented.
 *
 * It reports only what it can observe while running:
 *   - that the module executed at all
 *   - the build mode Vite substituted at build time
 *   - that no catalog data was loaded, because there is none to load
 *
 * It makes no claim about library generations, build attestations, publication authority or vehicle
 * application. Nothing here fetches, imports a dataset, or writes HTML.
 */

const status = document.getElementById('boot-status');
const factStatus = document.getElementById('fact-status');
const factMode = document.getElementById('fact-mode');

const runtime = Object.freeze({
  started: true,
  module: 'apps/catalog/src/main.js',
  mode: import.meta.env.MODE,
  catalogDataLoaded: false,
  recordCount: 0,
  networkUsed: false,
  vehicleData: false
});

if (status) status.textContent = `Catalog shell started (build mode: ${runtime.mode}). No catalog records are loaded.`;
if (factStatus) factStatus.textContent = 'started';
if (factMode) factMode.textContent = runtime.mode;

// R5 accessibility: the details panel is a dismissible overlay operated entirely from the keyboard.
// Enter/Space on the trigger opens it (native button activation), Escape closes it, and focus returns to the
// control that opened it. Focus indicators come from the declared :focus-visible rule; tab order is the DOM
// order, and no element takes positive tabindex. Text reaches the page through textContent only.
const aboutOpen = document.getElementById('about-open');
const aboutPanel = document.getElementById('about-panel');
const aboutClose = document.getElementById('about-close');
const aboutLive = document.getElementById('about-live');

if (aboutOpen && aboutPanel && aboutClose) {
  let opener = null;
  const openPanel = () => {
    opener = document.activeElement;
    aboutPanel.hidden = false;
    aboutOpen.setAttribute('aria-expanded', 'true');
    aboutClose.focus();
    if (aboutLive) aboutLive.textContent = 'Prototype details opened.';
  };
  const closePanel = () => {
    aboutPanel.hidden = true;
    aboutOpen.setAttribute('aria-expanded', 'false');
    (opener ?? aboutOpen).focus();
    if (aboutLive) aboutLive.textContent = 'Prototype details closed.';
  };
  aboutOpen.addEventListener('click', openPanel);
  aboutClose.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !aboutPanel.hidden) closePanel();
  });
}

document.documentElement.dataset.catalogShell = 'started';

/**
 * Read-only handle for a future browser test, following the staging studio's `window.__alpCatalog`
 * precedent (C3-R33 §2.7). It exposes only values already shown on the page.
 */
globalThis.__alpCatalogSkeleton = runtime;
