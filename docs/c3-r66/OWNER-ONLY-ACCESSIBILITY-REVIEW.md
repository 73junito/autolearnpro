# C3-R66/R67 — Sole-owner accessibility evidence, development only

**Review model:** `SOLE_OWNER_NOT_INDEPENDENT`. The project owner is permitted to test and review their own development-only accessibility evidence. This is not an independent review, a WCAG conformance certification, or production release authorization.

The sole-owner ledger `owner-review-ledger.json` is intentionally separate from authoritative R54 manual test records, the independent-review R55 ledger, and the R56 identity/custody ledger. There is **no migration or bypass** of the latter validators. The source-only CI step verifies R66 independently and continues to execute all previous R54–R57 and R8 checks.

## Record a genuine owner-reviewed case

1. Carry out an actual accessibility session for both synthetic pages using native assistive technology, noting the case ID, exact source/build, device and software versions, date, focus and speech observations, tested controls and defects. Do not backdate or invent results.
2. Save the *original* session evidence under the owner's authorized `F:\autolearnpro` project area. Redact unrelated or private information before inclusion in this repository. The R66 ledger only references regular files directly in `C3-R58-OWNER-SESSIONS/`, using unambiguous safe filenames and a 256 KiB maximum.
3. Calculate SHA-256 for the actual bytes of each included file and document the corresponding relative references. A digest establishes file identity, **not human identity or test accuracy**.
4. The human owner writes their own explicit first-person `ownerAttestation` referring to an actual dated session. Only after that statement exists may an internal `OWNER_REVIEWED` record be entered. Neither AI nor automated tests may produce a genuine owner signature.
5. The record must use the *same* pseudonymous `tester` and `reviewer` identifier, a fixed R54 case ID, chronological tested/reviewed dates, 40-hex source SHA, accurate `observations`, `outcome`, and one or more actual evidence reference+SHA-256 pairs.
6. Run `node infrastructure/scripts/c3-r66-owner-review.mjs --check` and `node --test tests/c3-r66-owner-review.test.mjs`. Review any FAIL/BLOCKED case and record real GitHub issue links if such defects are submitted to the separate R54 system.

**Meaning of successful validation:** The ledger is structurally consistent, evidence files meet path/regular-file/size/hash rules, and release status is HOLD. The checker does not prove actual device use, immutable custody or a human's signature. A successful empty-ledger check reports **0 owner reviews**, not a completed accessibility test.

## Mandatory release boundary

`releaseStatus: HOLD`, `certification: NOT_CERTIFIED`, `manualAuthorization: NOT_GRANTED`. No Cloudflare Workers publishing, hosted Supabase updates, DNS, signed/real automotive model promotion or production deployments are authorized. Existing R54/R55/R56 checks retain their original semantics until explicitly reauthorized and separately changed. R8's nine external gates remain unresolved.

## R65 owner evidence

The owner submitted spoken-text transcripts for triangle and indexed cube and reviewed the indexed-cube redacted transcript, clarifying that **Close indexed viewer was the last button tested**. These are valuable `OWNER_REPORTED` / document-reviewed observations, not proof that native original captures and full session attestations have been filed. They must not be silently inserted into `owner-review-ledger.json` or claimed as independent human evidence.
