# C3-R75 — Sole Human Developer and Reviewer Governance

**Owner decision:** This repository has **one human developer**, who is also its human maintainer, tester, reviewer and owner. Additional independent human developers, verifiers or reviewers are **not required for internal development, CI verification, routine PR review, source-only changes, or R66 owner-only accessibility review**.

## Current internal development policy

- **Human personnel:** 1 owner/developer/maintainer/tester/reviewer. Automated agents, Playwright, GitHub Actions and AI assistance are tools and **are not additional human reviewers**.
- **Review declaration:** `SOLE_OWNER_NOT_INDEPENDENT`. An owner may examine, approve and merge their own development changes in accordance with actual GitHub permissions and enforced branch policies; the workflow does not impersonate a second human or bypass branch protection.
- **Accessibility evidence:** The owner's historical NVDA/Chrome observations and explicit conversational attestation are preserved as `OWNER_ATTESTED_IN_CONVERSATION / PARTIAL_INTERNAL_DEVELOPMENT_REVIEW`. Neither a native unmodified NVDA Speech Viewer export nor full formal accessibility coverage has been established. Do not fabricate originals, timestamps, unperformed key actions, source-build provenance or second-person signatures.
- **R66:** Optional owner-authored genuine records are validated under the existing internal sole-owner path. Its ledger currently has **zero** completed formal records; its successful empty-ledger check is not proof of testing.
- **R54:** Six separate formal manual accessibility matrix cases are currently NOT_TESTED. The matrix remains as a future *formal conformance evidence* inventory, **not a prerequisite to routine development merges**.
- **R55/R56:** Legacy separate formal independent-evidence/custody checks still run defensively so their empty ledgers cannot be silently forged or used to claim independent signoff. They are **not an active requirement to recruit a second human** for this project's internal development. They only become relevant to a separately initiated formal independent-review process, whose existing schema enforces different human identities. Their protocol is not an assertion that such personnel exist, are hired, or must be hired for development.
- **GitHub protections:** Respect current protected branch rules and existing required CI checks. The policy cannot override any enforced GitHub ruleset or make unavailable approvals automatically appear. No `--admin`, force push, or disabling protections is authorized here.

## CI and tampering controls

`.github/workflows/r1-pr-validation.yml` runs R75's source-only policy validation and eight negative-control tests. The policy validator verifies that all R54/R55/R56/R66 and R8 source checks remain wired, that the mode is exactly `SOLE_OWNER_NOT_INDEPENDENT`, that the personnel counts are one, that neither a second person nor an independent reviewer is claimed to be required for development, and that the declared R54/R66 completed counts match the actual empty ledgers.

The R54/R55/R56/R66 scripts do **not** produce substantive manual results by merely passing with empty ledgers. The R75 control must not be used to turn a documentation-only attestation into a false test pass, bypass a GitHub approval setting, or weaken file hashes, access controls, source-only test integrity or release gates.

## Non-negotiable scope

`releaseStatus: HOLD`, `certification: NOT_CERTIFIED`, `manualAuthorization: NOT_GRANTED`. All nine external R8 release conditions remain unverified. No Cloudflare Workers publication, hosted Supabase mutations, DNS/signing changes, automotive-model promotion or production deployment is granted. A second-person review is **not being required by this internal policy**, but any legally/contractually imposed external compliance or future production authorization requirements must be separately assessed and cannot be waived by this internal document.

## Milestone decision

**C3-R75 — Sole-human internal development policy declared and CI-enforced.** Preserve the optional legacy independent path as archival formal governance, not mandatory development staffing. PR #57 (R72 test coverage) is independent and stays draft/unmerged unless separately approved.
