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

document.documentElement.dataset.catalogShell = 'started';

/**
 * Read-only handle for a future browser test, following the staging studio's `window.__alpCatalog`
 * precedent (C3-R33 §2.7). It exposes only values already shown on the page.
 */
globalThis.__alpCatalogSkeleton = runtime;
