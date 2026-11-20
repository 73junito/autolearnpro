# C3-R56 — Human accessibility test execution and evidence governance

**Authorization:** Development and testing ONLY. Production publication, Cloudflare Workers deployment, hosted Supabase changes, DNS updates, signing authority and real automotive models remain **HOLD**. No accessibility certification is claimed.

## 1. Human roles and custody

- **Tester:** A real person executes a manual case on actual hardware, recording the exact source commit, both isolated synthetic viewer URLs, OS/build, browser/version, assistive technology/version, commands used, observed results, limitations and a redacted evidence file under `docs/c3-r54/evidence/`. Neither automated axe nor a simulated fixture counts as a manual pass.
- **Identity verifier:** A different real person checks tester/reviewer identity and scoped role authorization through a human-controlled process; record its GitHub issue as `verificationRef` and the verifier identifier in the R56 registry. The registry and SHA-256 chain alone **do not authenticate an actual human**.
- **Reviewer:** Must be a real person different from the tester, independently inspect the exact evidence bytes, hashes, observations and source revision, and record the R55 review decision with rationale. Failed/blocked cases remain defects, never approved as PASS.
- **Release authority:** Separate decision. No R53–R56 CI job or review can change `releaseStatus: HOLD`, `certification: NOT_CERTIFIED`, or `manualAuthorization: NOT_GRANTED`.

No real identities or test executions are registered in the baseline: R54 has six `NOT_TESTED` cases, R55 has zero reviews and R56 has zero registry entries/custody events.

## 2. Reproducible test runbooks (perform on both development-only synthetic pages)

For each test, record the immutable commit SHA being tested and the exact isolated application origin. Do not publish the isolated viewer or replace synthetic geometry with production models. Follow the C3-R54 protocol; capture keyboard focus, exposed roles/names, announcements, error handling, and reproducible failures.

| R54 case ID | Required physical configuration | Manual actions and acceptance observations |
|---|---|---|
| `nvda-windows-firefox` | Real Windows machine, NVDA and Firefox versions recorded | Load both demo pages; navigate using Tab and Shift+Tab, Space/Enter; check spoken names, disabled controls, live-region updates, camera limits, focus recovery after close and failed asset |
| `nvda-windows-chromium` | Real Windows machine, NVDA and Chromium versions recorded | Repeat equivalent keyboard and live-region tasks; check no stale announcements and context-loss recovery |
| `voiceover-macos-safari` | Real macOS + Safari + VoiceOver versions recorded | Navigate using native VoiceOver commands and keyboard; verify landmarks, names, active/disabled controls, focus restoration and spoken errors |
| `mobile-voiceover-talkback` | **Both** iOS Safari/VoiceOver and Android Chrome/TalkBack; record distinct versions and evidence | On each physical device explore the page with screen reader gestures, activate controls, examine announcements and orientation/reflow; do not mark complete if either platform is missing |
| `zoom-200-400-high-contrast` | Record devices/browsers and zoom/high-contrast setting | At 200% and 400% zoom verify reflow without horizontal clipping, focus visibility, logical order, readable text and usable controls; repeat keyboard navigation in high-contrast mode |
| `assistive-tech-error-recovery` | Record relevant browser, screen reader and GPU/WebGL environment | Induce missing/tampered synthetic asset, failed WebGL context, close/reopen and reset; record disabled states, meaningful status text, cleanup and restored focus |

Log each observed deficiency in a numbered GitHub issue with reproducible steps, environment and expected/actual behavior. Avoid student data, credentials, device identifiers or personal recordings.

## 3. Submission and independent review states

1. An authorized person records a scoped identity registry entry (`id`, `role`, `verifiedBy`, `verificationRef`) for tester and reviewer; human reviewers must substantiate these identities outside CI.
2. Tester completes the corresponding R54 entry, deposits evidence, and pins its SHA-256; the R55 review ledger separately records a real human decision and ordered evidence digests.
3. Record a R56 `SUBMITTED` custody event with unique event ID, sequence, original source commit (40 lowercase hex), tester ID, case ID, date, evidence hashes and parent event hash.
4. Record a follow-on `REVIEWED` or `REJECTED` event with the independently verified reviewer and same source commit. Ensure it matches the R55 review entry; a rejected review is required for FAIL/BLOCKED.
5. R56 validation requires an unbroken SHA-256 hash chain, stable file content, consistent custody and no missing/duplicate transitions.

**Custody limitation:** A hash chain checks self-consistency of the submitted ledger, not append-only immutability against a malicious history rewrite. GitHub branch protection, commit review and independent retention are required to inspect changes against previous revisions. A source commit string alone is not an attestation that the executable truly came from that revision; verify it manually against the inspected test session and Git history.

## 4. Protected CI

CI runs `node infrastructure/scripts/c3-r56-governance.mjs --check` and `node --test tests/c3-r56-governance.test.mjs` after R53–R55, without removing any browser, strict Mesa/Xvfb or R8 release HOLD gate. Positive tests use temporary synthetic fixtures, **not** actual accessibility reports.

**Engineering merge criterion:** Three protected jobs green, R53 evidence artifact reviewed, R54 checks remain NOT_TESTED unless real signed-off testing has occurred, R55/R56 ledgers show no fabricated reviews and source review confirms the release HOLD. Manual test execution is separately authorized and cannot be claimed from CI success.
