# C3-R52 — Automated Accessibility Audit and Assistive Technology Readiness

**Authorization:** development/testing only. Cloudflare production deployment, publication, hosted Supabase migration, DNS, signing authority and real automotive models remain **HOLD**.

## Automated audit

The isolated synthetic triangle and indexed-cube demo pages use pinned `@axe-core/playwright@4.10.2` with the existing pinned Playwright browser. The required Foundation/Academic CI job discovers `tests/browser/c3-r52-a11y-audit.spec.mjs` and performs axe-core WCAG 2.0/2.1/2.2 A/AA-tagged checks on four states for each page: initial disabled view, rendered/fail-closed view, enabled controls and closed view. Any reported violation fails the CI test. The standard Chromium, WebKit, and Firefox suites run this audit; Linux headless Firefox may enter its documented no-WebGL fail-closed state. The separate strict Mesa/Xvfb Firefox job also audits actual rendered content, not merely a safe fallback.

Separate browser checks assert a keyboard-visible focus outline (at least 2 CSS px), single primary heading, document language, reduced-motion computed animation/transition durations, screen-reader status semantics and keyboard operation at a 360px viewport with no horizontal overflow. This reuses the existing deterministic camera and R39-R51 integrity, boundary, cleanup and rendering gates.

**Evidence boundary:** A zero-violation axe result is not WCAG certification, does not guarantee behavior in every assistive technology, and cannot validate the educational accuracy or visual meaning of a 3D model. Hardware, rendering and aural announcement behavior vary across devices.

## Manual assistive-technology acceptance protocol — required before student-facing release

1. On Windows, use NVDA with Firefox and Edge/Chrome; on macOS, use VoiceOver with Safari. Record tested operating system, browser version, screen-reader version, date and any failures. Where possible, include mobile TalkBack/VoiceOver review.
2. Navigate from page title through heading, explanatory text, initial disabled controls, verification button and polite status using keyboard/screen-reader commands only. Confirm disabled controls are not activated before verification.
3. After verification, confirm the status change is announced once, Tab traverses camera buttons in document order, Space/Enter operate each button, angle/distance feedback is understandable, and controls never trap focus.
4. Drive rotation/zoom to every limit, verify no repeated redundant announcements and that reset reports the starting state. Compare the intended semantics with visible controls, rather than treating graphics alone as sufficient.
5. Close while a camera button has focus; verify focus returns to verification/start. Repeat after simulated WebGL context loss and integrity failure. Confirm fail-closed errors are announced and no inactive buttons remain operable.
6. Test 200% and 400% zoom/reflow, high contrast/forced colors, reduced motion, screen magnification and narrow viewport. Inspect text clipping, contrast, focus indicators, touch target sizes, keyboard scroll, and understandable alternatives to visual-only geometry.
7. File accessibility issues with exact reproduction steps and assistive technology evidence; do not declare release readiness until critical user journeys are independently confirmed.

## Reproducibility

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
npx playwright test --config playwright.c3-r43.config.mjs --grep C3-R52
```

The test-only viewer is excluded from the normal catalog build and no remote service is contacted. The production HOLD remains until separately reviewed authorization.
