# ALP-D02-E-R8B — GitHub Main Branch Protection Proposal

**Decision: PROPOSED_UNAPPLIED / governance HOLD.** No GitHub settings mutation authorized by this source-only workstream.

## Live inspection and exact-check evidence

Authenticated read-only GitHub REST inspection on November 19, 2026 UTC found:

- `main` was unprotected; current default branch commit `c8b86a7fb9d135f961f193eefb023b568b930608`.
- Ruleset `protect-main-foundation` (ID `26665434`) still had `enforcement:disabled`; its pull-request rule required zero reviews, allowed merge/rebase/squash and had no required status checks. Existing deletion/non-fast-forward rules are ineffective while disabled.
- The GitHub Actions check-run API for PR #29 head `7acb02d73143f612d6d048ac6ff926bbc25cddc4` confirmed these exact three passing check-run contexts:
  1. `Foundation / Academic static and unit gates`
  2. `R7 Cloudflare workerd local runtime (source-only)`
  3. `R1 restricted executor (disposable database)`
- `Supabase Preview` was `skipped`; it is explicitly **not proposed as a required check**.
- GitHub Actions workflow token defaults to `read`, but no independent approving review is enforced while the ruleset is disabled.

## Proposed (not applied) ruleset change

`infrastructure/cloudflare/r8b-protection-proposal.json` holds the proposed rule structure, not an executable deployment or authorization artifact:

- Target **only the default branch** and retain ruleset ID 26665434.
- Switch enforcement to `active` **only after a separate written GO and fresh live reinspection**.
- Require PRs and **one independent approving review**, with stale review dismissal on new pushes, latest-push approval by another person, and resolved review conversations.
- Require exactly the three checked-in GitHub Actions job contexts, with strict up-to-date checks.
- Prohibit deletion, non-fast-forward updates and arbitrary bypass actors.
- Permit the existing `merge` commit method only in this proposal; no squashing/rebasing without further review.

### Important lockout preflight

Requiring an independent reviewer can prevent a sole repository maintainer from merging changes if no additional reviewer has access. **Before activating these protections**, verify an actual separate reviewer can approve and an authorized administrator can recover from unexpected lockout. Do not invent a reviewer or add a bypass role without explicit signoff. If an independent reviewer is unavailable, the strict release governance gate must remain unresolved rather than silently reducing the requirement to zero.

Check whether the repository's plan and API support all proposed rule parameter combinations and that the exact check contexts appear under current GitHub Actions runs. Review source authentication, administrative privileges, applicable organization rules and any unexpected merge queue interactions.

### Authorized execution (future action, not performed here)

After explicit owner GO and completed preflight, take a fresh JSON snapshot of the current ruleset and branch, review the precise change diff, apply a PATCH through an authorized GitHub interface, and immediately read back the effective rule and `main.protected` status. Test a valid reviewed PR against the required checks and verify that an unapproved PR, failed check, force-push and deletion are blocked. Never test force-push or deletion on `main` itself; use a disposable protected test branch or non-mutating API evidence.

### Recovery

In a documented emergency, an authorized ruleset editor can reverse the exact configuration only after capturing the incident reason, approvals, and before/after snapshots; subsequent review must restore controls. The original `disabled` status is not a desired steady-state rollback for security, and reverting it must not be automated as a response to an ordinary failing CI job.

### Source-only verification

`node infrastructure/scripts/check-r8b-protection-proposal.mjs` validates the proposed data, the exact current CI job definitions, original R8/R8A HOLD, and this decision packet. It does not authenticate to GitHub or apply rules. Its successful result means **proposal consistency**, not enabled protection.

**Current GitHub settings were NOT changed. Cloudflare Workers staging and production: HOLD. Hosted Supabase migrations: HOLD. Production student onboarding: NO-GO.**

GitHub API field reference: https://docs.github.com/en/rest/repos/rules
GitHub ruleset status-check guidance: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules
