# ALP-D02-E-R8D — Solo-Developer GitHub Governance Decision

**Status: SOLO_GOVERNANCE_PROPOSED_UNAPPLIED. No ruleset settings have been changed.**

## Owner-confirmed operating model

The project has one human developer and owner: `73junito`. AI agents assist with reviews, code, tests, and advisory analysis but are **not independent human reviewers**. The requirement added in R8B for one independent approval, and the R8C missing-reviewer blocker, are no longer suitable as future operating policy.

R8B and R8C **remain unmodified historical observations**, demonstrating why protection was not previously activated. R8D is a new superseding proposal and does not falsify those records.

## Proposed default-branch ruleset

Target GitHub ruleset `protect-main-foundation`, ID 26665434, default branch only:

- Require pull requests for changes to `main`.
- **Zero mandatory human approving reviews**; the owner may review and merge their own PR after all mandatory checks complete successfully.
- Require all three exact observed GitHub Actions contexts, strictly up to date with the base branch:
  - `Foundation / Academic static and unit gates`
  - `R7 Cloudflare workerd local runtime (source-only)`
  - `R1 restricted executor (disposable database)`
- Do **not** require the skipped `Supabase Preview` check.
- Prohibit force-push and default-branch deletion; no bypass actors.
- Preserve review-conversation resolution and allow merge commits only.
- Preserve read-only Actions token permissions, fail-closed application approval rules, R8 release hold, and production deployment separation.

Security review by AI can provide independent *analysis*, not an approving identity. GitHub restrictions still cannot prove that changes are safe; required CI is an automated quality gate rather than a substitute for security testing or production approval.

## Read-only GitHub preflight — November 19, 2026

At `main` commit `73867c33cca4fa0f172a29d9cc2ef8108ad594ae`, GitHub reported `protected:false`, ruleset enforcement `disabled` and only one repository collaborator, `73junito` (administrator). These facts are retained as a dated snapshot, not a continuously authenticated check.

## Required before activating

1. Obtain **separate, explicit owner authorization to change GitHub ruleset #26665434**. Merging the R8D source-only PR is not activation authority.
2. Reinspect current ruleset, effective branch rules, action check runs, and default branch. Confirm GitHub API schema supports the exact zero-approval and status-check parameter combination.
3. Record a secure recovery snapshot and confirm the owner can administer and recover the ruleset. Do not include credentials in Git or in CI logs.
4. Ensure all three exact CI contexts appear on a current disposable PR and are associated with GitHub Actions. Confirm any skipped provider checks are not mandatory.
5. Apply only the approved rule modification; immediately verify effective `main.protected=true`, correct checks, no bypass, and zero required reviews.
6. On a disposable PR, demonstrate green required checks permit the owner merge and missing/failed checks block it. Do not actually force-push or delete `main` as a test.
7. Record the outcome and only then update R8A/R8C historical conclusions in a *new* dated validation record rather than rewriting past evidence.

## Release authorization stays separate

Source merges do not authorize Cloudflare staging, production Workers, production secrets, DNS changes, hosted Supabase migrations, or student onboarding. R8's nine hosted release gates remain unverified. Full managed Supabase disaster recovery remains a separate workstream.

## Source-only deliverables

`infrastructure/cloudflare/r8d-solo-governance-proposal.json` is a **proposal**, not a deployable change. `npm run check:r8d-solo` validates proposal integrity and rejects fabricated activation, missing checks, zero-review policy drift, bypass rights, and lost production HOLD. The CI check makes no GitHub API calls and changes no settings.

**GitHub branch protection: INACTIVE. Proposed solo-developer model: SOURCE-ONLY. Production release: NO-GO.**
