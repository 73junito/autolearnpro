# C3-R42 — Local read-only Three.js viewer

Scope: **development and testing only**. No publication, production deployment, Cloudflare Worker changes, hosted Supabase changes, real vehicle-part models, or signing-key changes.

The regular catalog route (index.html) remains the R38 shell with no catalog records. A **separate** local development page at `apps/catalog/viewer-demo.html` exposes explicit **Verify and show synthetic triangle** and **Close viewer** controls.

The viewer obtains the fixed C3-R40 GLB from a same-origin local URL, and verifies its byte length and SHA-256 using the pure C3-R39 loader **before** lazily importing Three.js. The rendering module parses the verified GLB, not substitute geometry, and draws a static triangle. It does not auto-start, animate, load learner information, or contact hosted services. The canvas is an illustration with an accessible text description, status announcements, keyboard-operated native controls, visible focus and reduced-motion support.

The C3-R41 Ed25519 signature implementation remains separate and **does not** authorize publication. This prototype is explicitly unapproved for release; the viewer does not claim that its synthetic fixture is signed by an owner-approved trust anchor.

Commands (Node 22):

```sh
npm ci --ignore-scripts --no-audit --no-fund
node infrastructure/scripts/c3-build-sample.mjs --check
node --test tests/c3-synthetic-viewer.test.mjs tests/c3-viewer-local-boundary.test.mjs
npm run build --workspace @autolearnpro/catalog
npm run build:viewer:dev --workspace @autolearnpro/catalog
```

The separate viewer build writes only `apps/catalog/dist-viewer` and must not be deployed. It exists to validate Vite compilation and asset bundling. The R42 CI gates reject asset tampering, unexpected catalog entries, loading/rendering failures and missing cleanup. Browser-level WebGL rendering and keyboard testing should be independently executed before any wider access. C3-R43 can add isolated headless-browser behavior checks; not a release approval.
