# C3-R37E — Deterministic C3 Test Isolation

**Milestone:** C3-R37E — correct B32 in disposable working copies
**Authoritative workspace:** `F:\autolearnpro-c3-r25-integration` — nothing staged, no commit, `tests/` untouched
**Chain:** `2209761f` → `18cf6f6e` → `2aa13143` → `677faa44` (test fix) → **`bb1e0416`** (carry policy)
**Date:** 2026-11-04
**Status:** complete · awaiting independent review

## 1. Headline

| Result | Windows | Linux (Node 22.23.4) |
| --- | --- | --- |
| C3 suite, parallel | **213 · 209 pass · 0 fail · 4 skip, exit 0** | **213 · 213 pass · 0 fail · 0 skip** — **8 of 8 consecutive runs** with `dist` removed before each |
| C3 suite, `--test-concurrency=1` | 213 · 209 · 4 skip, exit 0 (31 s) | 213 · 213 · 0 skip, exit 0 |
| Portable verifier, **new** anchor | 17/17, exit 0 | 17/17, exit 0 |
| Failure probes | **8/8** as expected (6 must fail, 2 must pass) | — |

The race is fixed by excluding generated build output from the source-mutation snapshot, not by serializing the suite.
**B32 is resolved inside the candidate and remains open for the authoritative repository**, which still contains the
racy test because this milestone may not modify it.

## 2. Phase A — baseline

| Check | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03`, 49 default / 142 individual, **0 staged** |
| Candidate HEAD at start | `2aa13143b93e83fe8b06268055681b642d78d6f0` |
| R37D record / policy / verifier | `51d588eb…` / `e298a7f1…` / `3c812947…` — match |
| R37D anchor | `5121456938223c48e72f6116282b1cf4bd31d3585255364a73d256af9f952230` — **not reused** (see §6) |
| Authoritative `tests/c3-evidence-rehearsal.test.mjs` | `f0179407e9a00034795549e2076e377df96b1aeeccf9893bafc63f34472d824f` — untouched |

## 3. Phase B — diagnosis: one directory, two owners

| Question | Answer |
| --- | --- |
| Who creates `apps/catalog/dist`? | `tests/c3-catalog-skeleton.test.mjs` test 11: `fs.rmSync(DIST)` then `viteBuild()` twice |
| Who deletes it? | The same test, on every run, before rebuilding |
| Who depends on a stable `apps/catalog` tree? | `tests/c3-evidence-rehearsal.test.mjs` test 16, which snapshots the **whole** app before and after |
| Does the snapshot intentionally include generated output? | **No — it included it by omission.** `digestTree` walks `readdirSync` recursively with no filter, so `dist/` was compared like source |
| Which is authoritative for build output? | The skeleton test; its test 4 asserts the build **must** be confined to `apps/catalog/dist` |

That last row is why the obvious fix — give the build an owned temporary `outDir` — is not available: it would
contradict a reviewed contract assertion. `emptyOutDir: true` and `new URL('dist/', import.meta.url)` are both pinned
by test 4.

Root cause, in one sentence: **a recursive snapshot of a source directory included a generated subdirectory that another
test file deletes and recreates while both run in parallel.**

## 4. Phase C — reproduction

### 4.1 The real occurrence, preserved

The failure first appeared during C3-R37D's Linux regression and is still on the host at `/tmp/c3.log`:

```
not ok 65 - 16. the rehearsal never mutates the source tree
# tests 213
# pass 212
# fail 1
```

with `dist/assets/catalog-Bj3CNR8H.js` and `dist/index.html` present in the "actual" snapshot and absent from
"expected" — `dist` appeared *between* the two snapshots.

### 4.2 Attempts to reproduce by luck, and why they failed

| Configuration | Attempts | Failures |
| --- | --- | --- |
| Parallel full suite, `dist` present | 10 | **0** |
| Parallel full suite, `dist` removed before each run | 6 | **0** |

The window in test 16 is only as long as one rehearsal call and must straddle the build test's rm+build. Rarity is not
resolution, so the mechanism was demonstrated directly instead of inferred from silence.

### 4.3 Deterministic interleaving probe

`docs/c3-r37e/tools/b32-interleave-probe.mjs` forces the interleaving in a fixed order and timestamps every step with a
monotonic clock:

| t (ms) | Event | State |
| --- | --- | --- |
| 1.541 | dist removed | absent |
| 4.541 | **snapshot before** | 4 rows |
| 4.607 | skeleton removes dist | |
| 330.610 | skeleton build ends (535.5 ms) | **dist present** |
| 333.755 | **snapshot after** | 6 rows |

Window **535.7 ms**; rows that appeared: `dist/assets/catalog-Bj3CNR8H.js`, `dist/index.html`.

| Assertion | Verdict |
| --- | --- |
| Snapshot including `dist` (current behaviour) | **MISMATCH — this is B32** |
| Snapshot excluding generated output (proposed fix) | **MATCH** |

Probe exit 0; artefact `docs/c3-r37e/b32-interleave-probe.json`.

## 5. Phase D — the correction

One test file changed, in the candidate only:

```diff
+const GENERATED_OUTPUT = [path.join(CATALOG, 'dist')];
+const GENERATED_TOP_LEVEL = ['dist'];
+
-function digestTree(dir) {
+function digestTree(dir, skip = []) {
     for (const name of fs.readdirSync(current).sort()) {
       const absolute = path.join(current, name);
+      if (skip.includes(absolute)) continue;
```

```diff
-  const before = { catalog: digestTree(CATALOG), worker: digestTree(WORKER) };
+  const before = {
+    catalog: digestTree(CATALOG, GENERATED_OUTPUT),
+    catalogTopLevel: fs.readdirSync(CATALOG).filter((n) => !GENERATED_TOP_LEVEL.includes(n)).sort(),
+    worker: digestTree(WORKER)
+  };
```

Design notes, including one mistake:

1. **A top-level layout comparison was added** so creating a new file or directory beside the sources still fails even
   though one directory name is filtered.
2. **My first version of that addition reintroduced the race** — it compared the *unfiltered* listing, so when `dist` did
   not exist beforehand, the build test creating it failed the assertion again. My own probe (case 7) caught it.
3. **Why not an owned temporary `outDir`:** the authorization prefers it and it is unavailable here. Test 4 pins the
   build to `apps/catalog/dist` with `emptyOutDir: true` and an `import.meta.url`-derived path; relocating it would mean
   editing a reviewed contract to make a test pass, which is forbidden.
4. **What is preserved:** production build behaviour (still `vite build` into `apps/catalog/dist`), every expected
   SHA-256 contract, the source-snapshot contract and all release-authority flags. Only the comparison scope of one
   assertion narrowed, by exactly one generated directory.


## 6. Phase F — cross-platform regression with a NEW anchor

The commit carrying the test change is new, so the C3-R37D anchor is **not** reused. A new exact-path policy
(`C3-R37E-CARRY-POLICY.json`, 5 carry entries, the test fix as `M`) produced a new anchor:

| | Value |
| --- | --- |
| Target (verified integration commit) | `2209761f3f7a24480fd43b110e4acd71adb7e499` |
| Test-fix commit | `677faa44ba6a6592876ed1c799481d4e5005f880` |
| Carry commit | `bb1e0416c7f9b61721977edbd494c1776fc5d880` (194 files) |
| **New trust anchor** | **`b20ceaeebc93be5f42438e0be2134b891efe84a2a6ce0fd42d270d0227f0bc70`** |
| Carry policy | `7117fcbcc9924ed04e9d94fd35b6f04c64e22661df7982a89c02e13ed4de97a1` |

| Step | Windows | Linux |
| --- | --- | --- |
| Portable verify (17 checks, new anchor) | 17/17 exit 0 | 17/17 exit 0 |
| `manifestDigest` | `d1da51da…` | `d1da51da…` |
| Root / toolchain `npm ci` | exit 0 / exit 0 | exit 0 / exit 0 |
| `validate:foundation` | exit 0 | (unchanged from C3-R37D) |
| `test:runtime` | exit 0 | — |
| Catalog build | exit 0 | exit 0, `ce46c185…` / `47eff84e…` |
| C3 parallel | 213 · 209 · 4 skip, exit 0 | **213 · 213 · 0 skip — 8 of 8 runs, exit 0** |
| C3 serialized | 213 · 209 · 4 skip, exit 0 (31 s) | 213 · 213 · 0 skip, exit 0 |

Each of the eight Linux parallel runs removed `apps/catalog/dist` first — the condition that produced the original
failure. The four Windows skips are the symlink-capability cases and are unrelated.

## 7. Phase E — the repaired assertion still bites

`docs/c3-r37e/tools/b32-negative-probes.mjs` installs dependencies **once** in a single clone, then per probe injects one
mutation into the snapshot window, runs test 16, and requires the failure to be attributed to
`16. the rehearsal never mutates the source tree` with no environment error.
`ALL_EXPECTATIONS_MET=true`, digest `97ad2112…`.

| # | Injected inside the window | Expected | Observed |
| --- | --- | --- | --- |
| 1 | tracked source file modified (`src/main.js`) | fail | **fail**, attributed to test 16 |
| 2 | tracked source file deleted | fail | **fail** |
| 3 | new file beside the sources | fail | **fail** |
| 4 | new directory at the top of the app | fail | **fail** |
| 5 | root `package.json` modified | fail | **fail** |
| 6 | Worker source modified | fail | **fail** |
| 7 | `dist/injected.txt` written after the rehearsal | **pass** | **pass** |
| 8 | `dist/index.html` corrupted after the rehearsal | **pass** | **pass** |

Probes 7–8 are the **accepted cost** of the exclusion, asserted rather than assumed. A rehearsal writing into `dist`
would no longer be caught here; it is still refused elsewhere — the rehearsal's own quarantine tests assert in-source
destinations are rejected, and the R35/R36A root guards refuse them independently. A change that muted the *source*
comparison itself is caught, because probes 1–6 are that comparison.


## 8. Four mistakes of mine in this milestone

1. **A vacuous harness.** My first probe driver cloned a fresh directory per probe. Every clone lacked `node_modules`,
   so every probe "failed" — with `ERR_MODULE_NOT_FOUND`, not with the assertion. Six false passes. The rewrite installs
   once, reuses one clone, and asserts both the failing subtest name and the absence of environment errors.
2. **No reset between probes.** Probe 2 deletes `apps/catalog/src/main.js`; without `git checkout -- . && git clean -fd`
   after each case, every later probe ran against a damaged tree and failed for the wrong reason.
3. **Marker matched the wrong occurrence.** The comparison line appears twice in test 16 (before and after snapshots);
   anchoring the injection on the first occurrence put it *before* the call. Fixed by searching backwards from the last.
4. **A probe that misattributed its own failure.** The dist-write probes were injected before `rehearse()`, so the
   rehearsal refused with `R35_INPUT_MISSING` and the failure looked like snapshot detection. They now inject after the
   call, which isolates the snapshot comparison.

## 9. Artefact fingerprints

| Artefact | SHA-256 |
| --- | --- |
| `C3-R37E-DETERMINISTIC-TEST-ISOLATION.md` | reported in the handoff (cannot contain its own digest) |
| `docs/c3-r37e/C3-R37E-CARRY-POLICY.json` | `7117fcbcc9924ed04e9d94fd35b6f04c64e22661df7982a89c02e13ed4de97a1` |
| `tools/b32-interleave-probe.mjs` | `809b3a44eb7692e1a180e58f00390617bb88a64eafe28699434bc35510aecc98` |
| `tools/b32-negative-probes.mjs` | `fd9fef67742208f327b8c3f6ffa6e882167e1f22be301450d18c65bd09a624c7` |
| `tools/build-r37e-carry-policy.mjs` | `3e2ee05bffe984e6baf313d3741129aa43a321b0b5c667054736f4867b71088a` |
| Patched test (candidate) | `910da7fcaffb22fac84d19e4f9021b7673a3be0f1def500cbf862883a1f38645` |
| Original test (authoritative, untouched) | `f0179407e9a00034795549e2076e377df96b1aeeccf9893bafc63f34472d824f` |
| Interleave probe result | `docs/c3-r37e/b32-interleave-probe.json` — written inside the **candidate** checkout, not the authoritative worktree |
| Negative-probe result digest | `97ad2112f90ed3aeccf242e28be5be89a3f842dc442b7f5b972ce78f00245dbd` |
| Linux bundle | `c91c0d1a3b2cf6e5dce18266047cbcaea92a93a8554b35e9a05160e901f84fa5` |

## 10. B32 disposition

**Resolved in the candidate; open for the authoritative repository.** Sixty-plus suite executions across both platforms
and both concurrency modes produced no recurrence, and the mechanism that caused the single observed failure is
demonstrated on demand and now excluded by construction.

It is not "proven resolved" in an exhaustive sense: the fix removes one specific overlap, and no claim is made that
`apps/catalog/dist` is the only shared resource in the suite. Serialization remains available as extra CI safety
(`--test-concurrency=1` passes on both platforms; 31 s on Windows) — recommended *in addition to* the isolation fix, not
instead of it.

## 11. Final state

| Item | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` — unchanged |
| Parent HEAD | `ea67a03`, 30 default entries — unchanged |
| Staged | **0** |
| Authoritative status | 50 default / 147 individual (142 before this milestone's files) |
| Authoritative `tests/` | **untouched** — the racy test remains until an authorised integration |
| Disposable material | `F:\c3r37e-*`, `F:\c3r37d-*`, `~/c3r37e-*` — reproducible from the tools |
| Commits / pushes / merges / PRs / workflows / deployments (authoritative) | **none** |

## 12. What this does not establish

It does not authorise integration: the authoritative worktree still holds the racy test, so B32 is **not** closed for
the repository. It does not claim the suite has no other shared mutable state. It does not relocate the build — test 4's
contract is intact and the exclusion is on the snapshot side. It does not reuse the R37D anchor; new code carries a new
anchor. It touches no R25 verifier, no C3 security contract, no Worker, no catalog application, no root manifest and no
release flag.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

