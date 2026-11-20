# C3-R46 — Synthetic Viewer Lifecycle and Stability

## Authorization and scope
Development/test only. Production publication, Cloudflare Workers deployment, hosted Supabase migration, DNS, actual vehicle fitment data and signing permissions remain **HOLD**. The normal catalog shell remains disconnected and unchanged.

## Lifecycle behavior
The separate local synthetic GLB viewer now:
- Imports Three.js **only after** R39 SHA-256 and size validation and renders only the known synthetic triangle.
- Maintains one canvas, one renderer and one ResizeObserver per active viewer; resizing changes camera aspect and framebuffer size, without a new GLB fetch.
- On close, disconnects the observer, removes the WebGL context-loss listener and canvas, disposes the verified triangle's geometry/materials and Three.js renderer, and requests context release.
- On `webglcontextlost`, prevents default handling, fails closed, removes the canvas and announces a contextual error. The start control is re-enabled; a fresh viewer session must repeat integrity verification before rendering.
- Ignores late context-loss signals for a disposed session and ensures fault notification and cleanup occur at most once.

## Acceptance tests
`tests/c3-viewer-lifecycle.test.mjs` covers once-only fault/callback and teardown semantics, state transition, post-disposal events and invalid callbacks.

`tests/browser/c3-r46-lifecycle.spec.mjs` covers four complete open/close cycles, no extra DOM canvas, explicit new verified asset fetch each cycle, responsive resize, and synthetic context-loss recovery. These browser tests run under the existing required C3-R43/R44 Playwright matrix; Linux Firefox headless may still fail closed. The independent C3-R45 strict Mesa/Xvfb pixel test remains required.

The tests verify observable cleanup and bounded canvas/resource lifecycle. They **do not prove all GPU driver memory is reclaimed** or establish hardware-level leak freedom. R46 does not add student-facing access, live telemetry or animation.

## Local verification commands
```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/c3-viewer-lifecycle.test.mjs tests/c3-synthetic-viewer.test.mjs tests/c3-viewer-local-boundary.test.mjs
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright test --config playwright.c3-r43.config.mjs --project chromium --grep 'repeated verified|changing viewer width|WebGL context loss'
```

Merge only if all three protected CI checks pass and the R45 strict Firefox Linux pixel requirement remains green. No production release is authorized.
