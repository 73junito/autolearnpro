# C3-R49 — Indexed-geometry rendering and parser robustness

**Authorization:** development/testing only. Production publication, Cloudflare Workers deployment, hosted Supabase changes, signing authorization, DNS changes, and real automotive component integration remain **HOLD**.

## Separate verified indexed test page

`apps/catalog/indexed-demo.html` is a `noindex, nofollow` development-only page included **exclusively** in the isolated `vite.viewer.config.js` test bundle (`dist-viewer`). The main catalog `index.html`, standard production Vite build, and R40 triangle manifest stay unchanged. The test page imports the exact R48 cube test GLB via Vite and fetches it on demand only from the same origin, with credentials omitted and cache bypassed.

`apps/catalog/src/lib/indexed-cube-session.js` pins the fixture SHA-256 to `e5c7080d1da823e8697df830f09593da8297924368b7db3438e8e74d7e0d825d`. The GLB must match the fixed **748-byte** length, R39 integrity, R48 structure/budgets, **8 vertices / 36 indices / 12 triangles**, before the Three.js renderer chunk is imported. The existing triangle session remains a separate **three-vertex/one-triangle** admission pathway.

The shared renderer now accepts explicit expected vertex/face counts for the isolated cube route, validates that the parsed GLTF scene actually contains an indexed mesh, and renders the real verified geometry. It does not substitute hard-coded geometry or turn the cube into a catalog listing.

## Parser hardening

The R48 byte parser additionally rejects repeated index references inside a face and zero-area triangles (including collinear vertices). The fixed R48 cube remains unchanged. The R49 test suite adds an explicit degenerate-face corpus and a deterministic 256-case single-bit mutation exercise: failures must be typed `GeometryBudgetError`; any accepted mutation must satisfy strict geometry budgets. Mutation testing does not constitute a proof of complete GLB parser security.

## Required CI gates

The Foundation/Academic job adds Node tests for the indexed session, parser hardening, and detached-build boundaries, and runs the new Playwright browser tests in Chromium, Firefox, and WebKit (three tests per engine). The existing controlled Mesa/Xvfb Firefox step now also requires a **real indexed-cube render**, not a fallback.

Browser tests verify opt-in loading, nonzero blue framebuffer pixels and zero WebGL error, cleanup, tamper rejection **before** the dynamic renderer import, and explicit retry after a missing fixture. Standard headless Linux Firefox may continue its documented fail-closed fallback, which is not called a rendering success. The separate strict Mesa/Xvfb Firefox run must pass actual pixels.

## Boundaries / future work

No real vehicle specifications, CAD import pipeline, external GLB URLs, runtime arbitrary asset selection, dynamic materials/textures, production signer, or authorization to publish are introduced. A future step may examine second synthetic shapes, but richer glTF extensions or automotive model geometry require a new reviewed threat model and explicit approval.
