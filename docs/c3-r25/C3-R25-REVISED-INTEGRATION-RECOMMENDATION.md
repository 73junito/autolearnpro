# C3-R25 — Revised Integration Recommendation

Date: 2026-11-04 · **Local corrections only. No commit, push, merge, workflow activation or deployment.**
Both of your workflow findings were real — and one was still present after I claimed to have fixed it.

## 1. Workflow corrections

| Your finding | State before | Correction |
| --- | --- | --- |
| Guard runs before checkout | **Still broken after my first pass.** The old guard was step `0`; I added a *second* guard and never deleted the first, so the pre-checkout guard was live alongside the new one | Old block deleted; guard is now step `2`, after checkout (`0`) and setup-node (`1`) |
| `\s` with `grep -E` | **Still present**, in that stale block — and again in a `git grep -E` line I had just added | Both replaced with `[[:space:]]`. The one remaining `\s` is inside a **JavaScript** regex (`/wrangler\s+deploy/`), where it is correct |

**How I nearly shipped the same defect twice.** My own portability check printed `FOUND \s — NOT
PORTABLE`. I dismissed it as a false positive, reasoning it matched the comment warning about `\s`. It was a
**true positive** on an executable line. I overrode a passing test with a narrative. The check now excludes
comment lines and prints the offending text, so that rationalisation is no longer available.

### Guard extracted to a testable script

`docs/c3-r25/tools/verify-action-pinning.sh` — POSIX `sh` + POSIX ERE; no `mktemp`, no `\s`, no GNU-only
constructs. The workflow calls this file, so the tested file *is* the executed file.

Test matrix on a real POSIX shell (`/usr/bin/sh` from Git for Windows, GNU grep 3.0):

| Case | Expected | Observed |
| --- | --- | --- |
| Proposed workflow (2 pinned refs) | PASS 0 | **PASS 0** |
| `actions/checkout@v4` (tag) | FAIL 1 | **FAIL 1** |
| Tab-indented pinned ref | PASS 0 | **PASS 0** |
| `docker://alpine:3` (no digest) | FAIL 1 | **FAIL 1** |
| `./.github/actions/build` (local composite) | PASS 0 | **PASS 0** |
| Unreadable file | FAIL 1 | **FAIL 1** |

**Not tested on Ubuntu.** MSYS2 GNU grep is a closer proxy than PowerShell but is not the runner image;
treat CI-side behaviour as unverified until it runs on `ubuntu-24.04`.

### Residual gap, stated rather than hidden

Steps `0` and `1` execute *before* the guard can read the workflow file. The guard is a **drift detector**
for future edits, not a pre-execution trust anchor. The real controls are: human review of the two SHAs, an
offline run of the same script before installation, and `sha_pinning_required` — **currently `false`**.

## 2. Dependency graph — measured, not inferred

`docs/c3-r25/tools/build-dependency-graph.mjs` → `docs/c3-r25/c3-dependency-graph.json` (read-only over staging).

```
reviewedManifestEntries : 6
reachableLocalModules   : 7
unreviewedLocalModules  : ["lib/assets/library-pair-recovery.mjs"]
externalImports         : esbuild, vite, node:child_process, node:crypto,
                          node:fs, node:os, node:path, node:url
completeGraph           : true
```

Local import chain: `pair-reader → recovery`; `generation-r20 → pair-reader, recovery`;
`provenance-r21 → generation-r20, recovery`; `build-evidence-r22 → pair-reader, generation-r20,
provenance-r21`; `release-gate-r23 → build-evidence-r22`; `ci-readiness-r24 → build-evidence-r22`.

Three consequences: exactly **one** unreviewed local module exists, so the review gap is bounded and
closable; `vite`/`esbuild` are hard runtime imports of R22, so either they become root `devDependencies` or
R22 verification stays outside the authoritative repository; and `node:child_process` in R24 confirms it
cannot run on the Worker runtime.

`c3-integration-source-manifest.json` and `verify-review.mjs` are **unchanged** — the verifier asserts
exactly six fingerprints, so extending the manifest changes reviewed evidence and must be its own reviewed
change, not a side effect of this one.

## 3. History analysis — the two lines are related

Performed in a throwaway repository under `%TEMP%`, so neither real worktree was fetched into or altered.

| Fact | Value |
| --- | --- |
| Common ancestor | `bdf6302589bc36e02632469227f416fe959111fc` "Initial commit" |
| Root commit(s) | one, shared by both sides — **not unrelated histories** |
| Local `foundation/07-identity-authorization` | 38 commits from root, **37 ahead** of the ancestor |
| Remote `main` | 7 commits from root, **6 ahead** |
| Is the local tip an ancestor of `main`? | **No** — the lines diverged |
| Paths changed, local side | 68 |
| Paths changed, remote side | 3 |
| **Paths changed by both** | **NONE — disjoint file sets** |

The remote-side changes are exactly `.github/scripts/ai_readonly_review.py`,
`.github/workflows/ai-readonly-review.yml` and `docs/ai-actions-pilot.md`. The foundation line touches
`apps/`, `supabase/`, `infrastructure/`, `tests/`. **A merge should be conflict-free on content**, and no
force-push, rebase or history rewrite is required or recommended.

## 4. Proposed Git operations — for approval, NOT executed

```powershell
# 1. make remote main visible locally (single ref update, no worktree change)
git -C F:\autolearnpro fetch origin main

# 2. separate worktree on a reconciliation branch; parent worktree untouched
git -C F:\autolearnpro worktree add F:\autolearnpro-c3-reconcile `
    -b integration/foundation-merge-main ea67a032d94bf283ab458c45bc622e75f1a219f1

# 3. TRIAL merge, not committed — proves the disjoint-path claim before any decision
git -C F:\autolearnpro-c3-reconcile merge --no-commit --no-ff `
    952e236a1fa8b0a98e6527d8077b4f377556f564

# 4. validate in the reconciliation worktree, then either commit there or `git merge --abort`
cd F:\autolearnpro-c3-reconcile; npm run validate:foundation
```

Then a single reviewed PR into `main`. **No `--force`, no `reset --hard`, no `git clean`, no history
rewrite** — consistent with preserving both histories.

## 5. Remaining blockers before publication

1. `library-pair-recovery.mjs` is unreviewed → extend manifest **and** verifier in one reviewed change.
2. Destination tier undecided (`packages/core` vs `infrastructure/scripts`) → decides whether the root
   lockfile must change.
3. No branch protection, no rulesets, **zero environments**, `sha_pinning_required: false` → nothing in
   the repository gates a merge.
4. `npm ci` has never run on Linux.
5. These files are untracked and uncommitted. **Commit remains unauthorized.**

## 6. Decision

**Preserve both histories.** Recommend the merge path in §4, executed only after your approval. Publishing
the foundation line does not require overwriting `main`, and the disjoint-path analysis indicates it should
not require conflict resolution either.

## 7. Files added or changed this pass

| File | Change |
| --- | --- |
| `docs/c3-r25/c3-validation.example.yml` | Stale pre-checkout guard deleted; guard moved after checkout; POSIX classes; calls the external script |
| `docs/c3-r25/tools/verify-action-pinning.sh` | **New** — POSIX guard, tested 6/6 |
| `docs/c3-r25/tools/build-dependency-graph.mjs` | **New** — read-only transitive graph builder |
| `docs/c3-r25/c3-dependency-graph.json` | **New** — generated artifact (7 modules, 1 unreviewed) |
| `docs/c3-r25/C3-R25-REVISED-INTEGRATION-RECOMMENDATION.md` | **New** — this document |

Unchanged by design: `c3-integration-source-manifest.json`, `verify-review.mjs`, both historical reviews,
every foundation file, and the whole staging workspace.
