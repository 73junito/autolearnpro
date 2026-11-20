# C3-R57-A — Isolated Windows/NVDA test-session preflight

**Authorization:** development and testing only. Production, Cloudflare Workers publication, hosted Supabase changes, DNS, signing, and real automotive models remain on HOLD. This document is not a test result or accessibility certification.

## Source and isolation

Use the exact Git commit intended for testing, on a clean Windows working tree under the existing authorized repository workspace. Use Node.js 22 and a local-only synthetic viewer built from source. Do not expose the preview beyond loopback, tunnel it, connect it to a production service, or use real vehicle assets.

Suggested commands from the existing Windows repository root (PowerShell):

```powershell
git rev-parse HEAD
git status --short
node --version
npm ci --ignore-scripts --no-audit --no-fund
npm run build:viewer:dev --workspace @autolearnpro/catalog
npm run preview:viewer:dev --workspace @autolearnpro/catalog
```

In a **second** PowerShell window in the same repository:

```powershell
node infrastructure/scripts/c3-r57-windows-preflight.mjs --local
```

The preflight checks only Windows, Node 22, clean Git source at an exact SHA, and a **loopback** HTML response from both synthetic demo URLs: `http://127.0.0.1:4178/viewer-demo.html` and `http://127.0.0.1:4178/indexed-demo.html`. It does **not** check that NVDA is installed/running, that browser rendering is correct, that the pages meet WCAG, or that a human performed a test. The command emits environmental facts to the console; it does not record or submit manual results.

`node infrastructure/scripts/c3-r57-windows-preflight.mjs --check` verifies the static source-only session template in CI and is platform-neutral. That is not equivalent to `--local`.

## Human execution: NVDA on Windows

A human tester must inspect and record Windows edition/build, Firefox and Chromium versions, NVDA version and configuration, real hardware and exact source commit. Confirm NVDA is running and that speech is audible. For both synthetic pages, examine keyboard-only Tab/Shift+Tab navigation, Space/Enter action, focus indication, disabled controls, accessible name/role/state, screen-reader announcements, viewer reset, and asset/WebGL error and focus recovery. Repeat independently in Firefox and Chromium. Record any failure with expected/actual result, reproduction steps, screenshot or sanitized observation, and an issue reference.

Do not mark the combined mobile scenario complete without actual iOS VoiceOver **and** Android TalkBack testing; other R54 cases remain separate. All six baseline R54 results must remain `NOT_TESTED` until a real tester and independent reviewer provide evidence satisfying the R54–R56 gates.

## Custody and review

For any real session, follow R54 evidence file requirements, R55 exact evidence-file SHA-256 review, and R56 identity verification and custody chain. Human testing and human independent review cannot be replaced with automation or a fabricated outcome. No release permissions may be changed. If the preflight fails, document the blocker without recording PASS.

**R57-A completion:** The plan and automated preflight are ready only after protected CI passes. **R57-B/C remain pending actual manual testing.**
