# C3-R72 — Browser-only keyboard, focus and failure-recovery verification

**Purpose:** Automate incremental development-only checks without NVDA or claims of human assistive-technology speech.
**Scope:** Synthetic triangle `/viewer-demo.html` and synthetic indexed-cube `/indexed-demo.html`.
**Base:** C3-R69 merged main `32a2c200cd7cb329fe36d445a899ce68d98689e8`.
**Release state:** HOLD / NOT_CERTIFIED / NOT_GRANTED.

## Existing coverage retained

C3-R50 and R51 already verify camera bounds, basic Space/Enter behavior, initial disabled controls, live-region attributes and simulated WebGL context loss. C3-R72 does not replace those or the owner's prior NVDA/Chrome observations.

## New C3-R72 automated cases

For **each** viewer:
1. Validate initial start/stop/fieldset state; activate with Space, then close with Enter.
2. Assert focus returns to the initial Open button, closed viewer removes canvas and disables camera fieldset.
3. Use Tab and Shift+Tab after closure; confirm disabled controls are skipped and focus can return to Open.
4. Reopen with Space, confirm fresh canvas, available camera controls and rendered status, then close again.
5. Abort the GLB fetch once; assert fail-closed status, disabled camera controls, no canvas, and recover by retrying from the keyboard after allowing the same-origin GLB to load.

Native keyboard commands are driven by Playwright. These tests verify DOM focus/behavior and visual WebGL availability, **not screen-reader audio, original NVDA capture, WCAG certification or proof of human accessibility acceptance**. No real models or hosted services are accessed.

## CI integration

- Standard CI Playwright command runs all browser specs in Chromium, Firefox and WebKit, including the new R72 spec.
- Strict Linux Firefox/Xvfb/Mesa grep includes `C3-R72`; the strict run requires functioning WebGL and does not accept the ordinary development Firefox fallback.
- Existing R53 evidence assembly, R54–R56/R66 governance, and R8 release HOLD continue unchanged.

## Initial local observations

- On Windows the existing preview already occupied port 4178. An **untracked temporary local Playwright config** used isolated loopback port 4179; the existing preview was not terminated.
- First run failed because the new spec incorrectly used `toBeDisabled()` on an HTML `fieldset`. The fieldset *did* contain a valid `disabled` attribute, and the revised spec uses the same attribute-level check as R51. This was a **test assertion issue**, not evidence of an application defect.
- **Chromium:** four of four R72 browser cases PASS after correction.
- **Firefox:** four of four R72 browser cases PASS under existing non-strict local GPU policy.
- **WebKit:** four local tests blocked at launch because Windows Playwright WebKit executable was not installed; no application result was recorded. Linux protected CI is required for WebKit and strict Firefox verification.
- Source change is limited to one new Playwright spec plus a minimal strict-Firefox CI grep addition and this documentation. No application source or release control is changed.

## Decision

**Local Chromium/Firefox:** PASS. **Local WebKit:** INFRASTRUCTURE BLOCKED. **Protected Linux CI:** PENDING until the exact feature commit is checked.
**Production release:** HOLD.
