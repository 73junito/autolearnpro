# ALP-D02-E-R8E — Solo-Maintainer Branch-Protection Live Readiness

**Status: READ-ONLY PRE-ACTIVATION. No GitHub settings have been changed.**

## Owner and policy

The sole human developer and repository administrator is `73junito`. The R8D proposal supersedes R8B/R8C's future independent-review requirement: 0 mandatory human approvals, a required pull request, three required green checks, default-branch deletion/force-push denial, no bypass actors, and owner-managed merge. AI reviews may advise, but cannot satisfy independent human review. Cloudflare/hosted Supabase remain under a separate production HOLD.

## Verified live preflight (November 19, 2026)

- Current `main`: `169310a663787089dd1946311366a03a51248679`; `protected:false`.
- Ruleset `protect-main-foundation`, ID 26665434: `enforcement:disabled`.
- Effective rules on `main`: empty array.
- Repository collaborators: one administrator, `73junito`; collaborator permission endpoint separately verified `admin`.
- GitHub Actions default token permissions: `read`; cannot approve PRs.
- PR #32 check-run head: `6a29a0cbc3a2e9a8bf204252c6b97c7c7958080e`, with three successful `github-actions` checks:
  - `Foundation / Academic static and unit gates`
  - `R7 Cloudflare workerd local runtime (source-only)`
  - `R1 restricted executor (disposable database)`
- The unrelated `Supabase Preview` check was skipped and must not become a required security gate.

## Executable GET-only preflight

Run `node infrastructure/scripts/check-r8e-activation-readiness.mjs` for the dated fixture-integrity check executed by CI.

Run `node infrastructure/scripts/check-r8e-activation-readiness.mjs --live` **manually** to re-inspect the actual GitHub REST endpoints using already-authenticated `gh api`. The script executes **only fixed GETs**, has no PATCH/POST/PUT/DELETE operation, does not modify rulesets, and exits nonzero on missing credentials, API errors, invalid rules, access drift, unexpected checks, or partial collaborator/check-run pagination. The script does not output tokens.

The `--live` check does not run in public PR CI. A green fixture test does **not** certify current branch protection; it only confirms the dated observation is internally consistent.

Even a green live preflight is **READY_FOR_OWNER_DECISION_ONLY**, not activation or deployment authorization. R8E records that the proposed solo-developer policy is feasible at the inspected baseline, **not** that GitHub protection is enabled.

## Before authorizing branch ruleset activation

1. Obtain explicit written owner GO **for GitHub ruleset #26665434**, separate from a source PR merge.
2. Re-run the GET-only live preflight on the most recent `main` and revalidate the three required current CI check contexts.
3. Validate the current GitHub Rulesets update schema, the exact ruleset diff, administrator permission, and no extra conflicting organization rules.
4. Capture a local access-restricted recovery snapshot of the old ruleset and owner-controlled restore procedure. Do not commit secrets or recovery tokens.
5. Activate only the approved target branch ruleset, read it back, and require GitHub to report `main.protected:true`.
6. Test a disposable PR: after three green checks, the sole owner can merge without an approving review; missing/failed checks block merge. Verify deletion and force-push prohibition from GitHub's effective rules rather than attempting destructive operations on `main`.
7. Record post-activation evidence in a **new** security decision artifact; leave R8A–R8D's historical observation files unchanged.

## Strict HOLD

PR #33, if merged, adds a read-only verification tool and proposal evidence; it does **not** authorize updating the GitHub ruleset, Cloudflare Workers, hosted Supabase, DNS, credentials, or student production accounts.

**Branch protection not active. Production release and onboarding NO-GO.**
