# C3-R47 — Development-only viewer performance and resource budgets

**Authorization:** Source-only development/testing. Production publication, Cloudflare deployment, hosted Supabase migrations, DNS, and real automotive models remain **HOLD**.

## Deterministic build budgets
The mandatory Foundation/Academic CI step runs `node --test tests/c3-viewer-budgets.test.mjs` against the separately built `apps/catalog/dist-viewer` artifacts.

| Output | Hard budget | Local reference |
|---|---:|---:|
| Lazy Three.js + GLTFLoader renderer | 750 KiB uncompressed | 569,633 bytes |
| Synthetic viewer startup bootstrap | 40 KiB uncompressed | 8,668 bytes |
| Verified synthetic GLB | 1 KiB maximum and exactly 460 bytes for unchanged test fixture | 460 bytes |

A different set of assets, changed topology or production viewer is outside this approval. The normal catalog shell remains disconnected from this viewer. No bundle is published.

## Observable browser startup and lifecycle budget
The existing mandatory three-browser Playwright matrix automatically discovers `tests/browser/c3-r47-performance.spec.mjs`. The **Chromium-only** benchmark requires:
- Five individually SHA-256-checked open/close cycles and exactly five GLB fetches.
- One lazy engine fetch across all cycles; no pre-load before initial user action.
- No more than one canvas while open and zero after closing.
- Maximum 12 seconds per cycle and median under 6 seconds, measured from user click to visible ready state.
- Resize settling within 3 seconds, without further asset downloads.

Thresholds are intentionally conservative for variable shared CI runners, not claims about the typical performance of a production application. Raw per-cycle measurements and the median/max values are printed to the CI log. Native WebGL pixel accuracy, focus, resize, context loss, asset integrity, and controlled Linux Firefox rendering remain enforced by R39–R46 suites.

## Memory evidence: bounded claims
`performance.memory?.usedJSHeapSize` is recorded only when available and is **diagnostic**, not a pass/fail condition: it is Chromium-specific, sometimes rounded, and affected by garbage collection. GPU memory reclamation is not observable with portable browser APIs. Actual memory-leak certification will require repeatable browser-process/private-memory or heap-snapshot measurements under a controlled separate benchmark environment, with noise ranges and teardown isolation. Passing R47 does not prove that no GPU or JavaScript memory leak exists.

Local Chromium first run: five cycles [128, 76, 72, 121, 73] ms; median 76 ms, max 128 ms; five integrity-verified asset requests and one renderer request.

## Local reproduction
```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
node --test tests/c3-viewer-budgets.test.mjs
npx playwright test --config playwright.c3-r43.config.mjs --project chromium --grep 'C3-R47 startup'
```

The required CI runs the complete R43–R47 browser matrix plus the strict Mesa/Xvfb Firefox graphics gate. Neither the tests nor their instrumentation claim release authority.
