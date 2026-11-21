# C3-R55 — Manual evidence integrity and independent human review

**Current C3-R75 project policy:** One human owner is the only developer, maintainer, tester and reviewer. A second independent human is **not required for internal development**. The R55 independent-review path below is optional and applies only if the owner separately seeks formal independent evidence acceptance; its current empty ledger must remain truthful. The R66 sole-owner internal review operates separately. See `docs/c3-r75/SOLE-HUMAN-DEVELOPMENT-POLICY.md`.

**Scope:** development-only synthetic viewers. **Release stays HOLD; certification NOT_CERTIFIED; manualAuthorization NOT_GRANTED.** No Cloudflare Workers production deployment, DNS, hosted Supabase modifications, real vehicle geometry, release or signing authority.

## A–B: Actual file integrity and boundaries
`infrastructure/scripts/c3-r55-evidence-integrity.mjs --check` first invokes the existing R54 schema gate, then reads every evidence file for each non-`NOT_TESTED` check and compares the SHA-256 **of its bytes** to the R54 manifest. References must live inside `docs/c3-r54/evidence/`, be normal bounded files, and use strictly scoped path characters. It rejects traversal, symlinks at each path component, missing files, duplicate evidence references and size violations. This does not prove authenticity of human observations or establish cryptographic identity.

## C–D: Separate review ledger
`docs/c3-r55/manual-reviews.json` is a separate source-controlled ledger with `reviews: []` initially. Completed cases must have exactly one independent reviewer record, with `checkId`, `reviewer` identifier, `reviewedOn`, `decision` (`APPROVED` / `REJECTED`), ordered `evidenceSha256` and substantive `notes`. A reviewer may not be the recorded tester; review date cannot precede testing; decisions must be consistent with PASS / FAIL / BLOCKED. No review is permissible for an `NOT_TESTED` case.

The validator checks record structure and file hashes; it cannot cryptographically prove the human identity, actual manual execution, or independent reviewer inspection. Real review must verify these aspects independently, including the meaning of the observations. Do not use synthetic fixtures as actual evidence.

## E–F: Automated adversarial gate
`tests/c3-r55-evidence-integrity.test.mjs` uses disposable fixtures for positive-path testing and exercises file tampering, missing evidence, symlink file/parent, traversal, duplicate references, missing/same-person/duplicate reviewers, altered attestation hashes, forged authority, untested reviews, incompatible decisions and malformed dates. Fixtures are explicitly not real test outcomes.

Protected Foundation / Academic CI executes the R55 source-only verifier and Node tests alongside all existing R53 and R54 checks, protected browser matrix, strict Firefox Mesa/Xvfb, and release HOLD gate. No new upload or deployment permission is added.

## Acceptance / remaining work
The infrastructure PR can merge only after all three protected jobs pass, review of the diff, and confirmation that evidence and review ledgers remain empty / `NOT_TESTED`. Real NVDA, VoiceOver, TalkBack, high-contrast, zoom and error-recovery tests remain undone. No amount of CI passes is evidence that a human tested the UI or authorization to publish it.
