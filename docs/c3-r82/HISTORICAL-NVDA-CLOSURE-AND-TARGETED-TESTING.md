# C3-R82 — Historical NVDA evidence disposition and future targeted testing

## Authoritative archival decision

**Historical evidence investigation: CLOSED_WITH_DISCLOSED_LIMITATIONS.** This repository document supersedes earlier *open-ended searches* for historical NVDA Speech Viewer captures. It does **not** supersede authentic prior observation files, convert unverified steps to PASS, authenticate missing session/build linkage, or award WCAG certification.

The source of truth for the **private evidence bytes** is the owner's local, untracked `F:\autolearnpro\_local\owner-evidence\c3-r81\C3-R81-HISTORICAL-NVDA-EVIDENCE-CLOSURE.md`. The checked-in `historical-nvda-disposition.json` is deliberately limited to **non-sensitive integrity metadata**, classification, explicit manual gaps, and prior CI results. Do not copy source speech text, private Chrome window titles, or personal file names to the repository or GitHub PR.

The owner is the **sole human developer, tester, maintainer and reviewer**, governed by C3-R75. R66 owner-only internal review does not require a second human or fabricated independent reviewer. The legacy formal R54/R55/R56 ledgers and validations are still maintained; their empty records do not assert manual completion.

## What the actual record supports

1. An **owner-identified 4,228-byte original speech-text file** for Chrome/NVDA includes synthetic triangle unloaded controls, opening, verification and rendered status. Its SHA-256 matches the separately preserved local copy. It is a mixed Chrome speech-history file, not a complete or independently witnessed NVDA session.
2. Longer **triangle** and **indexed-cube** redacted transcripts are *owner-attested conversation derivatives*, not matching verified native-original log exports. They contain camera-control status readings and reset states but do not by themselves prove which keys were pressed, which build ran, or whether absent NVDA announcements imply actual attempted key presses. The owner confirmed **Close indexed viewer was the final tested button**; no human NVDA reopen test followed in that historical session.
3. Current **C3-R72 Playwright** tests cover keyboard close/reopen, focus, Tab/Shift+Tab behavior and synthetic GLB failure/retry for both viewers. CI at `d8f62198bf2439963a07d2313c815af12d030400` passed three protected jobs. These are **browser/DOM verification**, not actual NVDA speech or a substitute for human accessibility acceptance.

## Focused manual-only protocol — only if later requested

The historical investigation is **closed now**. Do **not** restart NVDA or repeat known-good basic camera operations simply to clear a repository milestone. For any future *new* NVDA/Chrome manual observation request, test **only** the specific unverified behavior that matters:

| Future gap | Targeted real human observation | Keep recorded |
|---|---|---|
| Speech at camera bounds | At a documented limit, intentionally press the relevant button twice more, note whether each press yields new speech or remains silent | Actual key, starting state, before/after spoken output, negative control |
| Enter vs Space | On a named enabled control, separately invoke Enter and Space; do not infer from Playwright | Key identity, focus target, observed announcement |
| Close/reopen focus | Close with keyboard, inspect where NVDA focus goes, Tab and Shift+Tab past disabled controls, re-open via Space | Focus target and full actual spoken sequence |
| Error/retry speech | Safely use only the synthetic fault fixture, verify fail-closed controls and announced status, then retry | Actual source/build, steps, real NVDA output |
| Historical build provenance | Link an **actual new session** to recorded source Git SHA and served build; do not backfill old session | SHA, local URL, environment, test date/time, raw/source evidence hash |

For the **indexed cube**, do not claim a separate original Speech Viewer file until it is actually located. New indexed-cube testing is scoped to missing speech/focus/error cases, not repeating the full historical rotation sequence. A new original native capture (if explicitly made) must be stored privately under `_local\owner-evidence` with byte hash, while a reviewed privacy-screened derivative is separately saved for any scoped acceptance discussion.

**Acceptance rules:** Only personally observed genuine manual results can be marked tested. For R66, the owner must *personally write* the first-person attestation with the required provenance, date, source SHA and evidence hash; no AI-authored quote or automatic promotion from R72. If session source or key actions are unknown, record `INCONCLUSIVE` or `NOT_VERIFIED`, never `OWNER_REVIEWED` by inference. Do not populate R54/R55/R56 from this retrospective record.

## CI enforcement

`infrastructure/scripts/c3-r82-historical-nvda-disposition.mjs --check` and its negative-control tests enforce this archive's safe status, strict evidence categories, privacy scope, R75 one-person governance and R8 release HOLD checks. Their success does **not** mean the archived test passed; it means historical limitations have not been silently reclassified.

**Non-negotiable:** `HOLD` / `NOT_CERTIFIED` / `NOT_GRANTED`. No Cloudflare Workers production deployment, Supabase hosted writes, actual vehicle model publishing, DNS or signing change. Only a separate, explicitly owner-authorized workflow may amend this classification with *new real evidence*.
