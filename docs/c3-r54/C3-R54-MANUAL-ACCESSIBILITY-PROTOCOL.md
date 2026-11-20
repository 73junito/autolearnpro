# C3-R54 — Manual accessibility test protocol and evidence boundary

**Authority:** Development/testing only. **Release HOLD.** This protocol is not a WCAG certification or authorization to publish, deploy Cloudflare Workers, alter DNS/hosted Supabase, use signing authority, or admit real vehicle assets.

## Required manual matrix

The six fixed entries in `manual-accessibility-evidence.json` start as `NOT_TESTED`:
1. NVDA on Windows + Firefox
2. NVDA on Windows + Chromium
3. VoiceOver on macOS + Safari
4. Mobile VoiceOver on iOS and TalkBack on Android (record both device/browser versions and split evidence within the entry)
5. 200% and 400% zoom, reflow, high contrast and keyboard navigation
6. Error recovery: viewer close/reopen, WebGL context loss, failed asset integrity and focus restoration

For **each** entry, inspect both synthetic pages `/viewer-demo.html` and `/indexed-demo.html` on the isolated development-only viewer. Start with no model loaded. Navigate every control by Tab / Shift+Tab, activate with Space and Enter, verify names, roles and states, and record announced status updates, focus visibility and return, disabled states, screen zoom clipping and any inaccessible interaction. For rendering-dependent tests, record whether a real synthetic model rendered. Test failure and recovery paths without introducing real automotive geometry.

## Evidence capture and defect tracking

Use a human tester and an actual device. For any completed entry, record `tester`, `testedOn` (YYYY-MM-DD), `platformVersion`, `browserVersion`, `atVersion`, and evidence references. Evidence objects must contain a scoped `docs/c3-r54/evidence/...` relative reference, the file's SHA-256, and substantive human observations. Capture redacted, non-sensitive observations, reproduction steps, expected versus actual outcomes, and severity. Store no user, student or credential data. An entry marked `FAIL` or `BLOCKED` must point to a GitHub defect issue. Because an evidence hash alone is not an independent attestation, reviewers must manually cross-check files and testers.

**Current state remains all six `NOT_TESTED`.** Do not turn checks to PASS based on axe, Playwright, a simulated AT tool, or CI. A group entry (mobile) cannot be PASS unless both technologies were actually exercised and evidenced. Do not use generic version strings in real submitted results.

## CI gate and release boundary

`node infrastructure/scripts/c3-r54-manual-evidence.mjs --check` checks the fixed matrix, source-only manifest restrictions and record shape. The companion Node test suite exercises fabricated PASS/release, missing tests, unsafe evidence, and untracked defects. Protected CI requires both. The validator verifies the *claims' structure*, not that manual tests occurred or the referenced files actually match hashes. Human review must make that determination. This milestone keeps `releaseStatus: HOLD`, `certification: NOT_CERTIFIED` and `manualAuthorization: NOT_GRANTED` even after any valid test evidence is entered.

## Merge and release

The R54 infrastructure PR may merge after the three protected CI checks pass and code review confirms no weakened R53 tests or release gates. Merging the infrastructure does not complete the manual testing program and does not authorize a student-facing release. Any future change to release authority requires a separate explicit owner decision and independent verification.
