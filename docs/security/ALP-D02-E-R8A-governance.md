# ALP-D02-E-R8A — GitHub Release Governance Evidence and Decision

**Decision: GOVERNANCE_HOLD.** This is a source-only investigation, not an authorization to deploy or change repository settings.

## Read-only observations (GitHub REST API, November 19, 2026 UTC)

Repository: `73junito/autolearnpro`. Observed default branch commit:
`73f3e18c66a6c80e0e0f37a47370757cb0b47bdf`.

- `GET /repos/73junito/autolearnpro/branches/main` returned `protected:false`.
- The classic branch protection endpoint reported HTTP 404 `Branch not protected`.
- `GET /repos/73junito/autolearnpro/rulesets` returned rule set
  `protect-main-foundation` (ID `26665434`) with `enforcement:"disabled"`.
  Its default-branch target and deletion/non-fast-forward/pull-request rule definitions
  are present, but **none are enforced while disabled**.
- The disabled pull-request rule requires **zero** approving reviews.
  It has review-thread resolution enabled, but that is not an enforced constraint.
  No required-status-check rule appears in that ruleset.
- Actions `default_workflow_permissions:"read"` and
  `can_approve_pull_request_reviews:false` are favorable observations.
  However, `allowed_actions:"all"` and
  `sha_pinning_required:false` remain supply-chain governance gaps.
- `GET /repos/73junito/autolearnpro/environments` reported
  `total_count:0`: no configured deployment environment protection.
- Existing source-level GitHub PR CI contains three jobs including
  the restricted disposable Supabase and workerd tests. **A passing
  source-only PR job does not constitute branch protection**.

These are *observations at the recorded date*, not assurances that
the settings remain unchanged. To certify resolution, inspect the live
GitHub settings again after authorized changes.

## Required decisions and changes (not executed)

1. Enable enforced protection for `main` (ruleset or classic protection).
2. Require at least one truly independent approving review; prevent self-approval and address stale approvals.
3. Make all three existing CI jobs required status checks, verifying their exact GitHub check names and any workflow rename behavior.
4. Prevent forced updates and deletion of `main`.
5. Review administrator bypass permissions and emergency break-glass criteria.
6. Restrict trusted Actions and pin third-party actions to vetted immutable SHAs, maintaining an approved upgrade process.
7. Define staging and production GitHub environments with appropriate protected reviewers and deployment branch restrictions.
8. Approve narrowly scoped credentials, identity rotation, audit trails, and a separate secret-provisioning control.
9. Complete hosted Hyperdrive TLS, GoTrue, rollback, and full managed Supabase disaster recovery validations under separate authorization.
10. Obtain a new written security/release-owner GO only after the evidence is verified.

## Source-only R8A enforcement

`infrastructure/cloudflare/r8a-governance-observation.json` retains the
read-only observations and ten outstanding remediations.
`node infrastructure/scripts/check-r8a-governance.mjs` verifies that
this record honestly represents **GOVERNANCE_HOLD**, the R8 source-only
deployment policy is still HOLD, and the original three CI jobs are
retained with read-only permissions. It deliberately **does not claim
to be an authenticated live check on each CI run**.

This snapshot checker fails on a fabricated claim of enabled branch
protection, required reviews, required status checks, or staging environments.
Future permitted changes require a fresh API inspection and a deliberate
update to the observation schema and policy, not a simple boolean change.

No GitHub settings were changed. No Cloudflare or Supabase infrastructure
or secrets were read, deployed, or mutated.

**GitHub main branch: protection NOT ENFORCED at observation time.**
**Source merge review: permitted subject to explicit user authorization.**
**Cloudflare staging/production and hosted Supabase: HOLD.**
**Production student onboarding: NO-GO.**
