# C3-R51 — Viewer accessibility and interaction hardening

**Scope:** development and testing only, synthetic triangle/cube demonstrations only. Production publication, Cloudflare Workers deployment, hosted Supabase, DNS and vehicle models remain **HOLD**.

## Accessibility and trust boundaries

- Both isolated local pages now provide explicit instructions for Tab, Enter, Space and reset, associated with the disabled-by-default camera fieldsets using `aria-describedby`.
- Canvas visualization labels no longer incorrectly describe user-controlled views as static. Canvas is not keyboard-focusable; camera commands are provided by native, named buttons.
- Existing status elements remain polite live regions, without a background timer, auto rotation, cursor tracking or telemetry.
- Camera command handler announces each distinct state change, but suppresses duplicate announcements when a bounded limit (such as azimuth +180°) has been reached. This avoids needless repeated screen-reader notifications during rapid activation while preserving every individual deterministic camera command.
- On close or WebGL context loss, fieldset controls become disabled, the canvas is removed, and keyboard focus returns to the opt-in verify/start button. A new session repeats SHA-256 and geometry checks before controls can be reenabled.
- All changes are restricted to the development-only viewer and its UI/test gate. The normal catalog, signing trust, remote APIs, and actual automotive CAD remain unchanged.

## Acceptance tests

`tests/browser/c3-r51-accessibility.spec.mjs` covers both synthetic pages across Chromium, Firefox and WebKit: disabled initial buttons, semantic fieldset labeling and help associations, Tab order, Space/Enter activation, polite state announcements, sustained repeated commands at camera bounds, duplicate announcement suppression via MutationObserver, and focus recovery/fail-closed disabling on WebGL context loss.

Standard headless Linux Firefox may return a genuine no-WebGL fallback; the strict Mesa/Xvfb Firefox job continues to require actual rendered graphics and now additionally checks the R51 keyboard/announcement scenario. Passing these tests establishes observable DOM/keyboard interaction properties, **not formal screen-reader certification**. A future assistive-technology manual review is appropriate before a student-facing release.

## Local reproduction

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright test --config playwright.c3-r43.config.mjs --project chromium --grep C3-R51
npm run lint:oxc
```

Merge only when all three protected required checks pass; do not bypass safeguards or deploy.
