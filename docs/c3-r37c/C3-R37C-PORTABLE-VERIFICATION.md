# C3-R37C — Portable Verification and Complete Evidence Inventory

**Milestone:** C3-R37C — isolated verifier, deterministic inventory, disposable-clone validation
**Authoritative workspace:** `F:\autolearnpro-c3-r25-integration` — no commit, no staging of existing files
**Date:** 2026-11-04
**Status:** complete · awaiting independent review
**Addresses:** B29 (`verify-review.mjs` incompatible with integration), B30 (ignored evidence absent from the inventory)

## 1. Headline

| Result | Value |
| --- | --- |
| Portable verifier | **15/15 checks, exit 0** on Windows |
| Portable verifier | **15/15 checks, exit 0** on Linux (Node 22.23.4) — same `manifestDigest` `d1da51da…` on both |
| Negative tests | **15/15**, exit 0 — each defect refused with the check that should catch it named |
| Verified commit | `2209761f3f7a24480fd43b110e4acd71adb7e499`, tree `2dfdc336…` |
| Carry commit (holds its manifest) | `de72f591448cdf35498aef8519662bff726ae073` |
| Linux suites on the carry commit | root ci 0 · toolchain ci 0 · foundation 0 · runtime 0 · **c3 0 (213/213, 0 skip)** · catalog build 0 |
| Catalog dist digests | `ce46c185…` / `47eff84e…` — identical to Windows and to C3-R34 |
| `docs/c3-r25/verify-review.mjs` | **unmodified**, still failing — deliberately |

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` — unchanged |
| Authoritative status | 47 default / 130 individual, **0 staged** |
| R37B candidate | `7d51b67f…`, tree `ec33d0ac…`, clean |
| R37B record | `80b41c4f206a8a67…` — matches the review |
| R37B tool | `c315e6f05bb56929…` — matches the review |
| Parent worktree | `ea67a03`, 30 default entries |

## 3. Phase B — the historical verifier is preserved, and why the new one exists

`docs/c3-r25/verify-review.mjs` is **untouched**. Its assertions — `HEAD === ea67a03`, branch
`integration/c3-r25-ci-readiness`, origin `https://github.com/73junito/autolearnpro.git`, and the Windows staging path
`F:/autolearnpro-meshy-staging` — are correct requirements *for reviewing the original R25 environment*, and they
guarantee failure on any integration commit. That is B29, and the answer is a second verifier, not a weakened first one.

`docs/c3-r37c/tools/portable-verify.mjs`, schema `alp-c3-portable-verify-report-v1`:

```
node docs/c3-r37c/tools/portable-verify.mjs --repo <checkout> --expect-commit <sha> [--expect-tree <sha>] [--json]
```

**The verified commit is named by the caller, and must be HEAD or an ancestor of HEAD.** This is not a convenience: a
manifest cannot describe the commit that contains it, so the reviewed manifest legitimately lives in a later commit.
Verifying "the named commit" rather than "whatever HEAD happens to be" removes that circularity *and* keeps the
checkout honest, because a fourteenth check forbids anything outside `docs/c3-r37c/` from differing between the two.

## 4. Phase C — the fifteen checks, with a fixed denominator

| Check | What it refuses |
| --- | --- |
| `expected-commit-matches-HEAD` | a commit that does not exist, or is not in this history |
| `expected-tree-matches-HEAD` | a tree that does not match the named commit |
| `manifest-schema-supported` | a missing manifest, or an unsupported schema version |
| `manifest-digest-recomputed` | any edited row: the digest is recomputed over tagged, length-prefixed rows |
| `manifest-rows-match-committed-blobs` | recorded hash ≠ committed blob, for **all 189 files** |
| `integration-set-matches-parent-diff` | an integration set that does not equal `git diff parent..target` |
| `reviewed-evidence-exceptions-present` | a missing or replaced reviewed log (the B30 evidence) |
| `required-scaffolds-present` | any of the 7 scaffold directories missing |
| `required-toolchain-manifests-present` | root, catalog or toolchain manifests missing |
| `worker-and-catalog-inputs-present` | a byte-sensitive input missing or not covered by the manifest |
| `nothing-outside-review-docs-differs` | any change on top of the verified commit that is not review documentation |
| `no-sensitive-files-tracked` | `.env`, `*.pem`, `*.key`, `*.dump` in the commit — including a force-added one |
| `release-authority-denied` | a manifest that claims publication, deployment, CI attestation or commit verification |
| `worktree-clean-except-ignored` | a dirty checkout (ignored dependencies are invisible here by design) |
| `check-count-is-fixed` | the denominator itself drifting between runs |

The count is asserted, not reported: a verifier whose check count can shrink hides failures. On the malformed-input
path the count still reports 15, because the checks run and fail rather than being skipped.

## 5. Phase D — B30 closed by naming ignored evidence explicitly

The C3-R37A inventory was derived from `git status`, which **cannot report a file `.gitignore` hides**. The four
reviewed console captures under `docs/c3-r36h3/logs/` were therefore absent from it — discovered in C3-R37B when a
clone arrived without them.

`C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json` fixes the method:

| Exception (exact path) | SHA-256 | Ignored by | Disposition |
| --- | --- | --- | --- |
| `docs/c3-r36h3/logs/b23-trials-prefix.log` | `31a77c23…` | `*.log` | tracked in the integrated commit |
| `docs/c3-r36h3/logs/b23-trials-postfix.log` | `0948146b…` | `*.log` | tracked |
| `docs/c3-r36h3/logs/injection-run-postfix-a.log` | `a3276751…` | `*.log` | tracked |
| `docs/c3-r36h3/logs/injection-run-postfix-b.log` | `1696586f…` | `*.log` | tracked |

Nothing is included by pattern or directory: every exception carries an exact path, an expected digest, the rule that
hid it, a justification, and its intended Git disposition. The allowlist also **enumerates the exclusions** with
reasons — `node_modules/`, `apps/catalog/dist/`, the toolchain install, per-run browser output, duplicate screenshots,
and secret-bearing files — so "absent" is a recorded decision rather than an omission.

The inventory is now built from `git ls-tree` (**authoritative for the commit**, not for the working tree) plus the
allowlist. The verifier then checks all four exceptions against the committed blobs, so a missing *or* replaced log
fails.

## 6. Phase E — the two installs, and the Node 22 invocation

Both are required; the first alone leaves the C3 build toolchain absent.

```
npm ci --ignore-scripts                              # root workspace: catalog (vite 7.3.7, three 0.180.0)
cd infrastructure/c3/build &&
  npm ci --ignore-scripts                            # isolated toolchain: esbuild 0.28.2 from its own reviewed lockfile
```

On Linux, `npm` must be invoked **through** Node 22. The `npm22` alias is a symlink to npm's CLI whose shebang is
`#!/usr/bin/env node`, which resolves to the system Node 24 — and the root `engines` field (`>=22.0.0 <23`) then
refuses the install with `EBADENGINE`:

```
node22 /home/rod/.local/opt/node-v22.23.4-linux-x64/lib/node_modules/npm/bin/npm-cli.js ci --ignore-scripts
```

Verified: esbuild `0.28.2` after the second install, and `git status` clean afterwards in both platforms.

## 7. Phase F — negative tests, 15/15

`portable-verify-tests.mjs` clones the carry commit per case, commits exactly one defect, and asserts the verifier
refuses **and names a check that should catch it**. Asserting only "exit 1" would let any failure satisfy any test.

| # | Case | Exit | Caught by |
| --- | --- | --- | --- |
| 1 | clean candidate | **0** | — (15/15) |
| 2 | nonexistent expected commit | 1 | `expected-commit-matches-HEAD` + 7 others |
| 3 | commit outside the history (orphan) | 1 | `expected-commit-matches-HEAD` |
| 4 | Worker bytes changed | 1 | `nothing-outside-review-docs-differs` |
| 5 | C3 module deleted | 1 | `nothing-outside-review-docs-differs` |
| 6 | reviewed log deleted | 1 | `nothing-outside-review-docs-differs` |
| 7 | reviewed log replaced | 1 | `nothing-outside-review-docs-differs` |
| 8 | lockfile modified | 1 | `nothing-outside-review-docs-differs` |
| 9 | required scaffold removed | 1 | `nothing-outside-review-docs-differs` |
| 10 | extra unreviewed source file | 1 | `nothing-outside-review-docs-differs` |
| 11 | unauthorised deploy workflow | 1 | `nothing-outside-review-docs-differs` |
| 12 | manifest removed | 1 | `manifest-schema-supported` + 6 others |
| 13 | **force-added** `credentials.pem` | 1 | `nothing-outside-review-docs-differs` (tracked: true) |
| 14 | `--expect-commit` omitted | 1 | usage refusal `R37C_EXPECT_COMMIT_REQUIRED` |
| 15 | check count across pass and fail runs | — | both runs report **15** |

`ALL_EXPECTATIONS_MET=true`, digest `dbb2a832716e9ad8aaed082df2a092a0386d0caf5c6538554e50224176d8869b`.

## 8. Phase G — cross-platform results

| | Windows | Linux (Node 22.23.4) |
| --- | --- | --- |
| Clone HEAD | `de72f591…` (190 files) | `de72f591…` (190 files) |
| `git status` | clean | clean |
| Portable verify (target `2209761f…`) | **15/15, exit 0** | **15/15, exit 0** |
| `manifestDigest` | `d1da51da…` | `d1da51da…` |
| Forged `--expect-commit` | refused | refused (7/15) |
| Root `npm ci` | (candidate 7d51b67f: exit 0) | **exit 0** |
| Toolchain `npm ci` | — | **exit 0**, esbuild 0.28.2 |
| `validate:foundation` | — | **exit 0** (13 directories) |
| runtime tests | — | **exit 0** (3/3) |
| C3 suite | 213 · 209 pass · 4 skip (candidate 7d51b67f) | **213 · 213 pass · 0 skip, exit 0** |
| catalog build | exit 0, `ce46c185…` / `47eff84e…` | **exit 0**, identical digests |

**Scope note, stated rather than smoothed:** the C3/foundation/runtime/catalog suites were run on Windows against
`7d51b67f` (the R37B candidate) and on Linux against `de72f591` (this chain). The delta between those commits is
documentation plus the C3-R37C tooling, and `nothing-outside-review-docs-differs` is the check that enforces exactly
that claim — but the Windows suite was not re-run on `de72f591`, and this record does not claim it was.

### 8.1 The historical R25 failure stays visible

On both platforms `verify-review.mjs` still exits **1** (`expected-committed-base`, plus origin/branch/staging checks
depending on platform). It is reported separately and is **not** a precondition of the portable verifier passing. The
two answer different questions; neither replaces the other.


## 9. Blocker dispositions

| ID | Blocker | Disposition |
| --- | --- | --- |
| **B29** | R25 verifier incompatible with integration | **Resolved by construction** — a separate portable verifier accepts any commit the caller names, with no branch, origin, drive-letter or staging-path assumption. The historical verifier is untouched and still fails as it must. |
| **B30** | Ignored evidence omitted from the inventory | **Closed** — explicit allowlist with exact paths, digests, justification and disposition; the verifier checks all four against the committed blobs, and a deleted or replaced log fails. |
| B5 / B13 / B18 / B28 | reproducibility and attribution | **Still candidate-only.** Demonstrated in a disposable commit; the authoritative repository has no integration commit and therefore still cannot reproduce this work. |
| B14, B19, B20, B21, B23, B26, B27 | unchanged | **Open** — untouched here. |
| **B31** | *(new)* the manifest cannot describe the commit that contains it | **Mitigated, not removed** — solved operationally by the carry commit plus `nothing-outside-review-docs-differs`, which forbids any change outside `docs/c3-r37c/` on top of the verified commit. A reviewer should confirm that prefix is the right allowance. |

## 10. Artefact fingerprints

| Artefact | SHA-256 |
| --- | --- |
| `docs/c3-r37c/tools/portable-verify.mjs` | recorded in the handoff |
| `docs/c3-r37c/tools/build-integration-manifest.mjs` | recorded in the handoff |
| `docs/c3-r37c/tools/portable-verify-tests.mjs` | recorded in the handoff |
| `docs/c3-r37c/tools/build-candidate-2.mjs` | recorded in the handoff |
| `C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json` | recorded in the handoff |
| `C3-R37C-INTEGRATION-MANIFEST.json` | `5578d2e5a849cdbab27c4d4a12258966515799e6b3734223789deb2e140dbdb4` |
| Manifest content digest | `d1da51da96a334bebcca5c623700f06aeb040b3e2a3f449f3534145e07656143` |
| Verified commit / tree | `2209761f3f7a24480fd43b110e4acd71adb7e499` / `2dfdc336ef4370366c59570e8a7fda9c256b2b8a` |
| Carry commit / tree | `de72f591448cdf35498aef8519662bff726ae073` / `f190c032e36343dd28927e739d125cc779c7656b` |
| Negative-test digest | `dbb2a832716e9ad8aaed082df2a092a0386d0caf5c6538554e50224176d8869b` |
| Linux bundle | `fa186bd0f235795ea550bb5f7b8962f3c1be855e08a939a98561eae68840d846` |

## 11. Four mistakes of mine, found by running the thing

1. **A 65-character hash constant.** I hardcoded `apps/catalog/index.html`'s expected digest by typing it, and the
   string had one extra character — it printed identically to a correct 64-character hash and compared unequal. The
   fix was not a correction but a removal: constants are gone, and the check now reads hashes from the manifest rows,
   which are themselves verified against the committed blobs. Single source of truth, no second place for a typo.
2. **A stale chain.** The first carry commit still contained a 14-check verifier from before the drift check existed,
   so Linux reported "14/14 PASS" while Windows reported 15/15. Rebuilding the whole chain from `7d51b67f` made both
   platforms report the same fifteen checks and the same manifest digest.
3. **A vacuous negative test.** Case 13 originally wrote `credentials.pem` and expected refusal; Git ignored it, so it
   never reached the commit and the verifier correctly passed — the test was asserting nothing. It now force-adds,
   and `no-sensitive-files-tracked` / drift detection catch it.
4. **A manifest that could not exist.** The first design had the verifier require `HEAD === expected`, which is
   unsatisfiable when the manifest lives inside the repository it describes. B31 records the compromise.

## 12. Final state

| Item | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` — unchanged |
| Parent HEAD | `ea67a03`, 30 default entries — unchanged |
| Staged (authoritative) | **0** |
| Authoritative status | 48 default / 137 individual (130 before this milestone's seven files) |
| Modified tracked | `.gitignore`, `package-lock.json` — pre-existing, untouched |
| Disposable repositories | `F:\c3r37b-candidate-*`, `F:\c3r37c-b2-*`, `F:\c3r37c-b3-*`, `F:\c3r37c-tests-*`, and `~/c3r37c-*` on Ubuntu — all disposable, all reproducible from the tools |
| Commits, pushes, merges, PRs, workflows, deployments | **none** in the authoritative repository |

## 13. What this does not establish

It does not authorise the integration. Nothing was staged or committed in the authoritative repository. The verified
commit is disposable and its identity is synthetic. Passing this verifier establishes that a checkout is the named
commit **and** that its content matches the reviewed manifest — nothing about who produced it, whether CI ran, or
whether a human approved a release; the report says so in `doesNotEstablish`. B5/B13/B18/B28 remain candidate-only.
B31 is a mitigation, not a proof that a self-referential manifest is safe in general.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

