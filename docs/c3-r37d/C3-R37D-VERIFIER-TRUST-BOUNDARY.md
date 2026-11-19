# C3-R37D — Portable Verifier Trust-Boundary Hardening

**Milestone:** C3-R37D — narrow correction to B31
**Authoritative workspace:** `F:\autolearnpro-c3-r25-integration` — nothing staged, no commit
**Disposable chain:** `7d51b67f` → `2209761f` → `de72f591` → `18cf6f6e` → **`2aa13143`**
**Date:** 2026-11-04
**Status:** complete · awaiting independent review

## 1. Headline

| Result | Windows | Linux (Node 22.23.4) |
| --- | --- | --- |
| Hardened verifier (17 checks) | **17/17, exit 0** | **17/17, exit 0** |
| Negative probes | **17/17, exit 0** | (Windows-side, see §6) |
| C3 suite on the final carry commit `2aa13143` | 213 · 209 pass · 4 skip · 0 fail | **213 · 213 pass · 0 skip, exit 0 (3 consecutive runs)** |
| Your B31 probe | **REFUSED** (exit 1) | — |

**B31 reproduced, then closed.**

## 2. Phase A — your probe, reproduced before anything was changed

A disposable successor commit was created on top of `de72f591` appending one line to
`docs/c3-r37c/tools/portable-verify.mjs`, and the **unmodified R37C verifier** was pointed at `2209761f`:

```
probe HEAD: a318e7b85e758e8ca3cf0b5c4b3af8d2af7186d8
diff 2209761f..probe:  A docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json
                       M docs/c3-r37c/tools/portable-verify.mjs
PORTABLE VERIFY PASS — 15/15 checks
BASELINE_EXIT=0
```

That is the defect exactly as you described it: the check guarding post-target drift was itself inside the allowed
prefix, so editing it edited the guard. Your commit `8977438…` and mine `a318e7b8…` differ only in metadata.

## 3. Phase B — a prefix is not an authorisation

`C3-R37D-CARRY-POLICY.json` replaces the directory rule with an exact-path list. Nothing is authorised by pattern.
Each entry carries its change type, content digest, kind, and purpose:

| Path | Type | Kind | Purpose |
| --- | --- | --- | --- |
| `docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json` | A | `manifest-data` | the inventory; cannot live inside the commit it describes |
| `docs/c3-r37d/tools/portable-verify.mjs` | A | `verifier-code` | the implementation, which must itself be anchored |
| `docs/c3-r37d/tools/build-carry-policy.mjs` | A | `verification-policy` | generator for this policy and the anchor |
| `docs/c3-r37d/tools/portable-verify-tests.mjs` | — | not carried | the test driver is deliberately **not** in the policy, so changing it fails |

The policy does not list itself — a file cannot contain its own digest — and says so in a `selfExcluded` field. It is
bound by the anchor instead. Every other difference between the verified commit and HEAD is refused:
`not-in-carry-policy`, `unexpected-change-type`, `content-differs-from-policy`, or
`listed-in-policy-but-not-present-in-diff` (the deletion/reversion case).

## 4. Phase C — an independent trust anchor, not a self-assessment

Four identities are now kept distinct, and only the first is derivable from the repository:

| Identity | Where it comes from | Used for |
| --- | --- | --- |
| verified integration commit | caller (`--expect-commit`) | content verification |
| manifest-carrying / tooling commits | repository history | locating the policy and manifest |
| **trusted verification implementation** | **caller (`--trust-carry`)** | **authorising the carry set** |
| current checkout HEAD | repository | ancestry and drift |

The anchor is a SHA-256 over exactly:

```
policy|<sha256 of the policy file bytes>
carry|<length>:<path>|<sha256>      one line per carry entry, sorted by path
```

It is refused structurally when absent: `--trust-carry` missing is a **usage error** (`R37D_TRUST_CARRY_REQUIRED`),
not a failed check, because a verifier with no external input can only compare the repository with itself. The
generator that produces the anchor lives in `build-carry-policy.mjs` and is itself a carry entry — so replacing the
generator changes the carry set and is refused too.

A third check, `verification-implementation-is-anchored`, requires the **running** file to equal both the blob committed
at HEAD and the digest named in the policy. That closes the case where an attacker ships a modified verifier and runs
their own copy.

### 4.1 Your probe, re-run against the hardened verifier

| Variant | Result |
| --- | --- |
| reviewed verifier → tampered checkout (`eec180d9…`) | **exit 1**; failed: `carry-set-matches-reviewed-policy`, `carry-digest-matches-trusted-anchor`, `verification-implementation-is-anchored` |
| tampered verifier → its own checkout (attacker runs their copy) | **exit 1**; `verification-implementation-is-anchored` reports `runningSha256 == committedBlobSha256` but `anchoredSha256` differs: *"running verifier differs from the anchored digest"* |

Both variants are refused, including the one where the attacker controls the executing code.

## 5. Phase D — seventeen negative probes, all refused with a named check

Each case clones the carry commit, commits exactly one defect, and asserts refusal **and** the check that should catch
it. `ALL_EXPECTATIONS_MET=true`, digest `d176ec49…`.

| # | Probe | Exit | Caught by |
| --- | --- | --- | --- |
| 1 | clean reviewed checkout | **0** | — (17/17) |
| 2 | **verifier source modified** (B31) | 1 | carry-set, anchor, self-anchor |
| 3 | integration manifest modified | 1 | carry-set, anchor |
| 4 | reviewed-evidence allowlist modified | 1 | carry-set, anchor |
| 5 | policy generator modified | 1 | carry-set, anchor |
| 6 | negative-test driver changed | 1 | carry-set, anchor |
| 7 | extra file under `docs/c3-r37d/` | 1 | carry-set, anchor |
| 8 | carry-policy file deleted | 1 | carry-set, anchor, self-anchor |
| 9 | carry file renamed | 1 | carry-set, anchor |
| 10 | Worker altered | 1 | carry-set, anchor |
| 11 | reviewed log altered | 1 | carry-set, anchor |
| 12 | incorrect trust anchor supplied | 1 | anchor only |
| 13 | commit outside this history | 1 | `expected-commit-matches-HEAD` |
| 14 | dirty worktree | 1 | `worktree-clean-except-ignored` |
| 15 | trust anchor omitted | 1 | usage refusal `R37D_TRUST_CARRY_REQUIRED` |
| 16 | **locally edited, uncommitted verifier** | 1 | self-anchor + dirty worktree |
| 17 | count across pass and fail runs | — | both **17** |

## 6. Phase E — cross-platform, on the same commit for the first time

The R37C scope discrepancy is closed: **both platforms now run the final carry commit `2aa13143`.**

| | Windows | Linux (Node 22.23.4) |
| --- | --- | --- |
| Clone / checkout HEAD | `2aa13143…` (193 files) | `2aa13143…` (193 files) |
| `git status` | clean | clean |
| Portable verifier (target `2209761f…`) | **17/17, exit 0** | **17/17, exit 0** |
| `manifestDigest` | `d1da51da…` | `d1da51da…` |
| Root `npm ci` | exit 0 | exit 0 |
| Toolchain `npm ci` | exit 0 | exit 0 (esbuild 0.28.2) |
| `validate:foundation` | — | exit 0 |
| C3 suite | **213 · 209 pass · 4 skip · 0 fail, exit 0** | **213 · 213 pass · 0 skip, exit 0** ×3 |
| Catalog build | (unchanged from C3-R37C) | `ce46c185…` / `47eff84e…` |

### 6.1 One transient failure, identified rather than ignored

The first Linux run of the full suite reported **212 pass / 1 fail**:

```
not ok 65 - 16. the rehearsal never mutates the source tree
  + dist/assets/catalog-Bj3CNR8H.js  - dist/index.html   (present in "before", absent in "after")
```

Cause: `c3-catalog-skeleton.test.mjs` runs the catalog build, which writes `apps/catalog/dist`, while
`c3-evidence-rehearsal.test.mjs` snapshots the catalog tree — the two test files run **in parallel** and race over
that directory. Evidence:

- `c3-evidence-rehearsal.test.mjs` alone: **18/18 pass**.
- `c3-catalog-skeleton.test.mjs` alone: **12/12 pass**, leaving `apps/catalog/dist` behind.
- Full suite, three consecutive runs afterwards: **213/213, 0 fail** each time.

So it is latent, timing-dependent, and **pre-existing** — not introduced by this milestone. Recorded as **B32**. I did
not modify the tests: adjusting them to hide a race is exactly the class of change this milestone exists to prevent.


## 7. Dispositions

| ID | Blocker | Status |
| --- | --- | --- |
| **B31** | unrestricted review-directory changes accepted | **Closed** — exact-path carry policy + caller-supplied anchor + running-verifier self-anchor. Both variants of your probe are refused. |
| **B32** | *(new)* parallel test interference over `apps/catalog/dist` | **Open** — latent, pre-existing, timing-dependent; identified by evidence, not reproducible in three subsequent runs; tests untouched. |
| B29 / B30 | portable verifier; ignored evidence | Unchanged from C3-R37C, still candidate-scope. |
| B5 / B13 / B18 / B28 | reproducibility and attribution | **Still candidate-only.** Nothing here touches the authoritative repository. |
| B14, B19, B20, B21, B23, B26, B27 | unchanged | Open. |

## 8. Honest limits of this design

1. **The anchor is only as trustworthy as the channel that carries it.** If the reviewer takes `--trust-carry` from the
   same commit being verified, the protection collapses. The value is published below, in this record, outside the
   candidate.
2. **The policy file is not self-describing.** It cannot list its own digest, so its integrity rests on the anchor. An
   attacker who changes both the policy and the supplied anchor is outside what any in-repository check can detect.
3. **`--expect-commit` remains a comparison value.** It says the checkout is that commit; it says nothing about who made
   it. The report still carries `doesNotEstablish` with all seven non-claims.
4. **The carry set must be re-generated whenever the review documentation grows.** Adding a review document without
   updating the policy will now fail, which is the intended friction and also a real maintenance cost.

## 9. Artefact fingerprints

| Artefact | SHA-256 |
| --- | --- |
| `docs/c3-r37d/tools/portable-verify.mjs` | recorded in the handoff |
| `docs/c3-r37d/tools/portable-verify-tests.mjs` | recorded in the handoff |
| `docs/c3-r37d/tools/build-carry-policy.mjs` | recorded in the handoff |
| `docs/c3-r37d/C3-R37D-CARRY-POLICY.json` | `e298a7f1f3b08c961fccbc97e40c88f827adc1ac22ce8ba44c14f666ca2f9f3b` |
| **Trust anchor** | **`5121456938223c48e72f6116282b1cf4bd31d3585255364a73d256af9f952230`** |
| Verified commit / tree | `2209761f3f7a24480fd43b110e4acd71adb7e499` / `2dfdc336ef4370366c59570e8a7fda9c256b2b8a` |
| Tooling commit (D) | `18cf6f6e51defc000dafe19c4129e310cd2ef701` / `f901ef29ff3af05db96ccef6c6a8d37371126a21` |
| Carry commit (E) | `2aa13143b93e83fe8b06268055681b642d78d6f0` / `cc1a8e59ec7c832ae20038eabc969540d4e1a6b3` |
| Your B31 probe locus | `89774382625d4dc56ec19a00993537fc43bdb2eb` |
| My reproduction of it | `a318e7b85e758e8ca3cf0b5c4b3af8d2af7186d8` |
| Tampered-verifier probe | `eec180d99ad3397119091df8e62d44e38a42fd57` |
| Negative-test digest | `d176ec49430a4e194e6952dd229943a82c2edfb3f435db1f58f10568bd70a64c` |
| Linux bundle | `609675fcbfc11d0b40a65be88dcf8062c3573aadcfb18b09ca6c655492a28c45` |

## 10. Two mistakes of mine in this milestone

1. **A fixture that proved nothing.** Case 13 ("unrelated history") created an orphan commit and then passed *that same
   commit* as the expected target — so it was HEAD, ancestry held, and the case failed for the wrong reason. Fixed by
   detaching back to the reviewed line before verifying, so the orphan exists but is not an ancestor.
2. **A first anchor computed against the wrong head.** The policy was generated when HEAD was the tooling commit `D`,
   before the policy itself was carried in `E`. Because the policy excludes itself, the entries are identical in both
   commits and the anchor is valid — but `reviewedChain.head` in the policy names `D`, not `E`. The verifier does not
   depend on that field; it derives the carry set from the actual diff. Noted so the field is not mistaken for an
   assertion.

## 11. Final state

| Item | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` — **unchanged** |
| Parent HEAD | `ea67a03`, 30 default entries — unchanged |
| Staged | **0** |
| Authoritative status | 49 default / 142 individual (137 before this milestone's files) |
| Modified tracked | `.gitignore`, `package-lock.json` — pre-existing, untouched |
| Disposable material | `F:\c3r37d-*`, `F:\c3r37c-*`, `F:\c3r37b-*`, `~/c3r37d-*`, `~/c3r37c-*` — all reproducible from the tools |
| Commits / pushes / merges / PRs / workflows / deployments (authoritative) | **none** |

## 12. What this does not establish

It does not authorise integration. Nothing was staged or committed in the authoritative repository; the historical R25
verifier is untouched; no C3 security contract, Worker, catalog or test file was modified. Passing the hardened verifier
establishes that a checkout is the named commit, that its committed content matches the reviewed manifest, and that the
verification implementation matches a digest supplied independently of the repository. It establishes nothing about
authorship, CI, or approval. B32 is open. B5/B13/B18/B28 remain candidate-only.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

