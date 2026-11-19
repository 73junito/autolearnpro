# ALP-D02-E-R8C — Branch Protection Activation Preflight

**Decision: ACTIVATION_BLOCKED.** This is a read-only source-only governance phase; no GitHub, Cloudflare, or Supabase settings were changed.

## Authenticated GitHub evidence (November 19, 2026 UTC)

At default-branch commit `24924670926bd35825ed80116461ae6a5c4999c1`, GitHub returned `main.protected=false`. Ruleset `protect-main-foundation` (ID 26665434) remained disabled; it contained no required status checks and required zero approvals.

The GitHub repository collaborators API returned **one collaborator**: `73junito`, with administrator access. It returned no second account eligible to give an independent PR review. This is an observed access limitation, not proof that an external reviewer could never be added. Enabling the R8B candidate with one independent approval and last-push approval at this stage could block normal merges.

The PR #30 source head check-run API returned the exact three successful GitHub Actions checks already referenced in the R8B proposal:
- `Foundation / Academic static and unit gates`
- `R7 Cloudflare workerd local runtime (source-only)`
- `R1 restricted executor (disposable database)`

The separately reported `Supabase Preview` check was **skipped**, not a required success. GitHub Actions default workflow permissions remain `read`; Actions cannot approve PRs. Allowed action sources remain `all`, and mandatory SHA pinning remains disabled. No GitHub Environments are configured.

## Blocking decisions

1. Assign a trusted **second GitHub collaborator** who can approve pull requests independently, or retain the activation HOLD. Do not reduce the approval count to zero merely to make the rule easy to enable.
2. Authorize and document ruleset administration, an emergency recovery operator, and a non-destructive lockout test plan. No emergency bypass account is authorized.
3. Confirm the required three GitHub Actions check contexts and integration source on a fresh test PR, approve a precise ruleset diff, and give a **separate explicit GO** for changing rule #26665434.

The proposed R8B source file is **not** an activation instruction. A successful source PR merge does not authorize changing GitHub settings.

## Authorized follow-up sequence (future, only after explicit GO)

Reinspect the current repository collaborator and ruleset state; capture an encrypted, access-restricted current-ruleset recovery snapshot; verify a distinct reviewer can approve; validate the ruleset schema and required check contexts; apply only the authorized settings; read back effective `main.protected`; verify review and CI block/allow behavior on disposable PRs; and store the final evidence.

Do not attempt real branch deletion or force-pushing on `main`. Reversion of rules should be a documented, authorized emergency exception, not an automatic reaction to failing tests.

## Source-only evidence

`infrastructure/cloudflare/r8c-activation-preflight.json` records the dated live observations and blockers.
`node infrastructure/scripts/check-r8c-activation-preflight.mjs` verifies the **snapshot's honesty and preserved R8/R8A/R8B HOLD**, rather than making network calls on every CI run. It must not be interpreted as evidence that protection is active.

**Branch protection: not active. R8C activation: BLOCKED. Cloudflare staging/production: HOLD. Hosted Supabase migration: HOLD. Production student onboarding: NO-GO.**
