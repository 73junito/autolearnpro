# C3-R25 — GitHub State Findings (Phase A)

Date: 2026-11-04 · Read-only. No token printed, exported or modified. Evidence from authenticated GitHub
API + `git ls-remote`, not inferred from local YAML.

## 1. Three findings that differ from the handoff

| Handoff statement | What the API actually reports |
| --- | --- |
| "Existing workflow: `.github/workflows/cloudflare-foundation-staging.yml`" | On `main` the **only** workflow is `ai-readonly-review.yml`. `cloudflare-foundation-staging.yml` returns **404** at the remote — it exists only in the local worktree on an **unpushed** branch. |
| Branch `foundation/07-identity-authorization` at `ea67a032…` is the working base | The remote has **no `foundation/*` branch at all**. Remote branches: `main`, `chore/ai-readonly-actions-pilot`, `cline/vfzbmj1a`, `docs/primary-repo-migration-plan`, four `fix/ai-review-*` / `fix/clinepass-*`. |
| The authoritative repository is where foundation work lives | Remote `main` = `952e236a…` "Support wrapped ClinePass completions (#6)", 2026-10-27 — AI-review-pilot history. The entire 7-gate foundation line (`ea67a03`) is **local-only and never pushed**. |

**Consequence for the push decision (not acted on):** pushing `integration/c3-r25-ci-readiness` would upload
a base commit that the remote does not have, creating a parallel history line rather than a small delta
branch. That changes what "push" means and must be decided by a human, not inferred here.

## 2. Repository configuration (verified)

| Setting | Value | Implication |
| --- | --- | --- |
| Default branch | `main` | — |
| Visibility | **public** | Any pushed branch, workflow file and commit is world-readable immediately |
| Branch protection, `main` | **not protected** (404) | No required checks, no review requirement |
| Rulesets | **`[]`** (none) | No org/repo ruleset gates merges |
| Environments | **`total_count: 0`** | **No environment exists, so no required reviewers anywhere** |
| Actions | enabled, `allowed_actions: all` | Any action from any publisher may be used |
| `sha_pinning_required` | **false** | Unpinned action refs are permitted by policy, not merely by convention |
| Default workflow token | `read`, `can_approve_pull_request_reviews: false` | Good baseline, not a substitute for per-workflow `permissions` |
| Open PRs | **#7** `docs/primary-repo-migration-plan` | Unrelated to C3 |
| Recent runs | "AI Repository Review (Manual, Read-only)" — 1 success, 2 failures, 2026-10-27 | The Cloudflare workflow has **never run**, because it is not on the remote |

## 3. What this means for CI readiness

1. `if: ${{ false }}` on a deployment job is **defence in depth only**. With no environments and no
   protection rules, nothing in the GitHub configuration prevents a future workflow from deploying.
2. Setting `sha_pinning_required: true` and adding a `main` ruleset with a required status check are the two
   repository-level controls that would make the proposed workflow meaningful. **Neither is enabled, and
   enabling them is a remote change requiring approval.**
3. A green workflow on an unprotected branch proves the code runs, not that change is controlled.
4. The public visibility means the proposed workflow must never print environment contents or secrets —
   a constraint already met, since it uses no secrets at all.

## 4. Unverified — must not be claimed

- Whether the two action SHAs embedded in the proposal are the ones a human reviewer will approve.
- Whether `npm ci` succeeds in CI: the root lockfile was never exercised on a Linux runner, and this
  worktree cannot prove it without network access.
- Any claim of trusted CI identity, OIDC attestation, branch protection or release authority.

## 5. Local state (unchanged, preserved)

- Parent `F:\autolearnpro`: branch `foundation/07-identity-authorization`, HEAD `ea67a03`, **30**
  modified/untracked entries — untouched, not staged, not cleaned.
- Integration `F:\autolearnpro-c3-r25-integration`: branch `integration/c3-r25-ci-readiness`, HEAD
  `ea67a03`, nothing staged.
- Free space `F:` ≈ **114.3 GiB**.
