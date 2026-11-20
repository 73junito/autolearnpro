# C3-R43 — Browser-level synthetic viewer acceptance

**Development and testing only. No publication or deployment authorization.** Regular catalog `index.html` and its Vite build remain unchanged. Browser tests serve an isolated `dist-viewer` preview on `127.0.0.1:4178`; no Cloudflare Worker, DNS, hosted Supabase or secret access is involved.

## Corrected inherited R42 deficiencies

1. `viewer-engine.js` previously parsed the signed/hashed GLB but drew a hardcoded `BufferGeometry` instead of the parsed scene. R43 renders the **verified `gltf.scene`**, requires exactly one three-vertex mesh, and disposes geometries/materials/context on close.
2. Vite's default small-asset inlining would turn the 460-byte GLB into a `data:` URL. The existing same-origin asset guard correctly rejects that URL. R43 sets `assetsInlineLimit: 0` in the **isolated viewer build only**, ensuring a real, same-origin, hash-named GLB file.
3. A source contract test now asserts rendering the parsed scene, not substitute hardcoded geometry.

## Browser acceptance

Pin `@playwright/test` in the catalog workspace. The existing mandatory Foundation/Academic CI job provisions disposable Chromium, Firefox and WebKit on the GitHub runner and executes:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright install --with-deps chromium firefox webkit
npx playwright test --config playwright.c3-r43.config.mjs
```

The Playwright runner starts and stops a local Vite preview server. Tests verify no GLB or rendering-module request before keyboard activation; actual GLB fetching; rendered canvas and removal; no focus trap; status announcements; explicit reduced-motion preference; tampered GLB rejection *before* the renderer chunk loads; missing asset failure and manual retry.

**Rendering outcome must be interpreted per browser.** Chromium requires a real rendered canvas. Firefox/WebKit accept either a rendered canvas or an explicit *no-canvas* fail-closed fallback in environments lacking software WebGL. A fallback is logged as `FAIL_CLOSED_FALLBACK`, not as successful 3D rendering; full cross-browser graphics certification would require successful rendered observations on those engines. CI tests verify behavior, not an external security audit or release qualification.

The R39 integrity loader remains the gate. R41 development-only signature support is not connected to this viewer and does not grant publication authority. **Production publication and Cloudflare Workers deployment remain HOLD.**
