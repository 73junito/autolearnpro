# C3-R50 — Accessible, bounded synthetic camera controls

**Scope:** development/testing only. Production publication, Cloudflare Workers deployment, DNS, hosted Supabase and real automotive models remain **HOLD**.

## Interaction contract

The two independently verified local synthetic test pages (the R40 triangle and R48/R49 indexed cube) now expose seven native `<button>` controls inside a disabled-by-default fieldset, enabled **only after** successful SHA-256, geometry-budget and WebGL initialization. Native Enter/Space keyboard activation, visible focus indicators, screen-reader button labels and an `aria-live` status response provide a non-canvas path for controlling and understanding the view.

The pure camera state reducer supports:
- Rotate left/right: 15-degree steps, azimuth clamped to -180..180 degrees
- Tilt up/down: 15-degree steps, elevation clamped to -60..60 degrees
- Zoom in/out: 0.5 distance steps, radius clamped to 2..7 units
- Reset: deterministic initial camera (triangle: 0/0/3; cube: 25/15/5)

Only explicit clicks or keyboard activations update camera state. There is no continuous orbit loop, drag tracking, telemetry or remote input. Controls are disabled on close or WebGL context loss; a new integrity-checked session must be created to operate them again. A disposable session's controls cannot act after close. The native controls are bounded independently of canvas pixel resolution.

## Test evidence and limits

Unit tests exercise deterministic state, bounds after 100 repeated actions, reset behavior and invalid state/action rejection. Browser tests run on both local synthetic pages in Chromium, Firefox and WebKit, and confirm disabled-by-default/enable/disable, keyboard action and status reporting, pixel differences after a camera rotation, clamped extremes, reset and context-loss cleanup. Standard headless Linux Firefox remains a fail-closed compatibility mode; the separate Mesa/Xvfb Firefox pixel gate continues requiring a real verified geometry rendering pass. Existing R39–R49 sample integrity, GLB geometry admission, indexing, performance and security gates are retained.

These are constrained local demonstration controls, not a released student interface. Neither 3D geometry nor camera movement is evidence of real vehicle fitment or mechanical tolerances, and no publication authority is implied.

## Commands

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/c3-r50-camera-controls.test.mjs
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright test --config playwright.c3-r43.config.mjs --project chromium --grep C3-R50
```

All changes are isolated within `F:\\autolearnpro` and a protected feature-branch PR. No deployment or live-hosted data change is authorized.
