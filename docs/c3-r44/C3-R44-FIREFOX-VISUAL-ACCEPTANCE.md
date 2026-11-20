# C3-R44 — Firefox WebGL compatibility and visual acceptance

**Scope:** development and testing only. Production release, Cloudflare deployment, DNS, and hosted Supabase remain on HOLD.

## Findings

C3-R43's GitHub Linux Firefox job returned `FAIL_CLOSED_FALLBACK` although Chromium and WebKit rendered the integrity-verified GLB. Direct Windows Firefox 159 with a WebGL2 context **did render** the synthetic triangle, showing that this is not a general Firefox browser incompatibility. The runner's software/WebGL environment is a remaining independent variable.

C3-R44 adds conservative Firefox-only Playwright preferences intended to permit software WebGL on Linux: `webgl.force-enabled`, `webgl.disabled=false`, `webgl.enable-webgl2`, `webgl.disable-fail-if-major-performance-caveat`, and `gfx.webrender.software`. These are **test-browser preferences only**, not settings applied to students or real browsers.

## Visual acceptance tests

The isolated R42 renderer enables `preserveDrawingBuffer` **only for this development test viewer**, making deterministic framebuffer readback possible. The Playwright visual test samples a WebGL framebuffer and requires more than 200 opaque pixels, more than 200 blue pixels and more than 20 center-region blue pixels, with `gl.getError()===0`. This is materially stronger than asserting that a canvas exists or screenshot bytes are nonempty.

The diagnostic test records each browser's WebGL availability, WebGL2 availability and permitted renderer descriptor, plus any console warnings. It never treats a safe error state as visual success. Chromium and WebKit **must** visually render and pass pixel assertions. Firefox must also pass pixels to claim Firefox visual certification; when WebGL is absent it must explicitly report `FAIL_CLOSED_NO_RENDER` with no canvas, and the remaining Firefox certification is **blocked**, not passed.

Run:
```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright install --with-deps chromium firefox webkit
npx playwright test --config playwright.c3-r43.config.mjs
```

The existing Foundation/Academic required CI job already runs this Playwright configuration and will therefore execute the R44 diagnostic and pixel-readback tests. Do not merge on failed mandatory checks or bypass branch protection.

## Limitations

These tests check a fixed synthetic triangle, not vehicle-part geometry or educational accuracy; source trust still follows the R39 integrity boundary and no production signing key is involved. WebGL software support can vary across CI runner versions, and `preserveDrawingBuffer` has a performance cost suitable only for this test build. Avoid asserting Firefox rendering if the observed result is a fail-closed fallback.

Local Windows evidence before Linux CI: Chromium **PIXEL_READBACK** (14,705 blue pixels), Firefox **PIXEL_READBACK** (14,705 blue pixels); zero GL errors on both.
