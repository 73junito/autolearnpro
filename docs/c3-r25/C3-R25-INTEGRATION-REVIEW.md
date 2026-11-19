# C3-R25 — Isolated GitHub CI Integration Review

Date: 2026-11-04
Disposition: PREPARATION ONLY — NO C3 CODE MERGE / NO REMOTE PUSH / NO DEPLOYMENT

## Authoritative repository and branch
- Parent: `F:\autolearnpro`, remote `https://github.com/73junito/autolearnpro.git`.
- Existing parent worktree: `foundation/07-identity-authorization`, commit `ea67a032d94bf283ab458c45bc622e75f1a219f1`.
- Parent worktree had 30 modified/untracked status entries at review. It was not cleaned, staged or committed.
- Independent worktree: `F:\autolearnpro-c3-r25-integration`.
- Review branch: `integration/c3-r25-ci-readiness`, created from the exact committed HEAD above. It excludes uncommitted academic/auth changes by design.

## CI currently committed
- `.github/workflows/cloudflare-foundation-staging.yml` already exists.
- Existing workflow is manual validation-only, has `contents: read`, installs Node 22 and invokes a Wrangler **dry-run**.
- Existing deployment job is intentionally disabled with `if: ${{ false }}`. Leave it unchanged.
- This worktree's committed package is a different architecture from the separate C3 engineering studio: it does not have `lib/assets`, Vite catalog entry points or C3 R10–R24 scripts. A standalone C3 validation command will fail if those are not reviewed and ported.
- No trusted OIDC workload identity, GitHub repository environment protection, branch protection, artifact signer or runtime publication gate was proven by local inspection.

## Integration blockers and safeguards
1. C3 staging has its own `package.json`, `package-lock.json`, Vite application and Cloudflare Worker. Do not replace the authoritative monorepo's root package/lockfile, apps, infrastructure or workflows.
2. C3 R12 source integrity pins and R13 write authorization depend on canonical paths and a staging-only directory name. Directly copying those scripts breaks assumptions; redesign module boundaries and regenerate reviewed pins in this branch first.
3. R20/R21/R22/R23/R24 are currently local prototype evidence contracts. R22 uses a local source snapshot as a `sourceCommit` surrogate, and no trusted CI provenance exists yet.
4. The isolated worktree must preserve the parent branch's existing academic/auth work. No `git clean`, branch reset, force push, or merge is authorized.
5. No TorqueMind legacy source-tree migration, live database change, Cloudflare publish, R2 operation or KCOE8006 fitment action.

## Review deliverables in this branch
- `docs/c3-r25/c3-integration-source-manifest.json`: SHA-256 identifiers for selected reviewed staging modules. These are references, NOT copied source or attestations.
- `docs/c3-r25/c3-validation.example.yml`: an intentionally uninstalled, validation-only GitHub Actions workflow proposal.
- `docs/c3-r25/verify-review.mjs`: an offline review sanity check that rejects deployment commands and checks proposed source file integrity when the staging workspace is present.

## Proposed integration sequence — future gates
1. Obtain approval of source/module mapping between standalone C3 staging and the parent monorepo. Identify the exact catalog and Worker integration points.
2. Review each C3 module, including its absolute-root and environment assumptions, licenses and dependencies; port incrementally under new module boundaries, not by overwriting project roots.
3. Add a real version-controlled validation-only workflow to a separate review PR; pin third-party actions to immutable commits and use minimum permissions.
4. Produce actual bundles under the same verified Git commit; replace source snapshot surrogates with independently verified commit evidence.
5. Require protected branch review, an independent workload attestation and verified release-gate wiring before contemplating any deployment.

## Newly confirmed foundation checkout gap
- The C3-R25 review verifier passed 14/14 checks, but running `node infrastructure/scripts/validate-foundation.mjs` against the clean committed worktree FAILED.
- The validator requires `apps/simulator`, `apps/classroom`, `packages/ui`, `packages/core`, `packages/curriculum`, `packages/diagnostics` and `supabase/functions`.
- Those seven directories exist in the original parent working directory but are completely empty and contain no Git-tracked files. A fresh worktree does not recreate empty Git directories.
- This is a pre-existing repository reproducibility/CI blocker, not a C3 migration failure. Do not claim the current workflow is ready for a clean checkout. No placeholder folders, tracked sentinel files or validator relaxation were introduced here.
- Proposed remediation for a separately reviewed change: add appropriately owned tracked placeholders/real package structure or redesign validation to check only the committed structure; retest from a fresh clean worktree.

## Decision
C3-R25 worktree setup: COMPLETE.
CI design draft: PREPARED BUT NOT INSTALLED.
C3 sources integrated: NO.
Remote branch pushed: NO.
Production deployment and KCOE8006 fitment: HOLD.
