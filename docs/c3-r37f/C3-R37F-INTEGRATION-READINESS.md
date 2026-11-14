# C3-R37F — Source Hygiene and Integration Readiness

**Milestone:** C3-R37F — correct B33, refresh verification trust, prepare the proposed integration
**Authoritative workspace:** `F:\autolearnpro-c3-r25-integration` — nothing staged, no commit
**Date:** 2026-11-04
**Status:** complete · awaiting independent review

## 1. Headline

| Result | Value |
| --- | --- |
| B33 | **Corrected** in a new successor commit — two unintended control bytes replaced with printable comment text |
| Executable code | **byte-identical** before and after (17,386 B of non-comment code; comments +14 B) |
| Control-byte scan | **0 unexpected bytes** across 181 text files (Windows) and 182 (Linux) |
| New trust anchor | **`6603c59779e875957401f34035ae49ebc784ef0c0b63032864d687effee67460`** |
| Portable verifier | **17/17 exit 0** on both platforms with the new anchor |
| Old R37E anchor | **refused**, exit 1 (`carry-digest-matches-trusted-anchor`) |
| Unauthorised change to the verifier | **refused**, exit 1 (self-anchor + dirty worktree) |
| Regression | Windows 213 · 209 pass · 4 skip · 0 fail; Linux 213 · 213 pass · 0 skip — parallel ×3 and serialized |
| B32 probes | **8/8** unchanged |

## 2. Phase A — baseline preserved

| Check | Value |
| --- | --- |
| R37E record / policy / tools | `0d605964…` / `7117fcbc…` / `809b3a44…`, `fd9fef67…`, `3e2ee05b…` — all match |
| R37E anchor | `b20ceaeebc93be5f42438e0be2134b891efe84a2a6ce0fd42d270d0227f0bc70` — preserved, and now correctly rejected |
| Candidate at start | `bb1e0416c7f9b61721977edbd494c1776fc5d880` — **preserved, not amended** |
| Authoritative HEAD / status | `ea67a03`, 50 default / 147 individual, 0 staged |
| Authoritative test file | `f0179407…` — untouched |

## 3. Phase B — B33 corrected, with one correction to the finding

The two bytes are **0x07 (BEL)** and **0x0B (VT)** — not 0x08 (backspace). Measured by scanning the candidate file
byte by byte:

```
idx=4540 byte=7   …build output is not source. <0x07>pps/catalog/dist is produced…
idx=4608 byte=11  …catalog-build suite (and by
                  // <0x0b>ite build at any time), it is git-ignored…
```

**Root cause: my own shell escaping.** The comment was written through a PowerShell double-quoted string, where
`` ` `` is the escape character — `` `a `` is BEL and `` `v `` is vertical tab. The intended markdown backticks
(`` `apps/catalog/dist` `` and `` `vite build` ``) were consumed as escapes. Your diagnosis of the mechanism was right;
only the second byte differs from your report.

The correction, in a **new** successor commit `fa89629272f80c2b9774159f4bc343964f014fab` (the R37E commit is untouched):

```
-// Generated build output is not source. \x07pps/catalog/dist is produced by the catalog-build suite (and by
-// \x0bite build at any time), it is git-ignored, and it is legitimately deleted and recreated by another test file
+// Generated build output is not source. the apps/catalog/dist directory is produced by the catalog-build suite (and by
+// vite build at any time), it is git-ignored, and it is legitimately deleted and recreated by another test file
```

Two comment lines, nothing else. `docs/c3-r37f/tools/comment-only-check.mjs` proves the executable code is identical
by stripping comment lines from both versions and comparing:

```
executableCodeIdentical: true     executableBytes: 17386
commentBytes: 3757 → 3771 (+14)   totalBytes: 21143 → 21157
```

`docs/c3-r37f/tools/control-char-scan.mjs` then reports **0 unexpected bytes** in 181 text files, with TAB/LF/CR as
the only allowed control bytes — the distinction you asked for is enforced by the tool, not asserted in prose.

## 4. Phase C — refreshed verification trust

The correction is a new commit, so the R37E anchor is **not** reused. A new exact-path carry policy carries 6 entries,
including the corrected test file as `M` and both earlier policies as retained history:

| Path | Type | Kind |
| --- | --- | --- |
| `docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json` | A | `manifest-data` |
| `docs/c3-r37d/C3-R37D-CARRY-POLICY.json` | A | `verification-policy` (history) |
| `docs/c3-r37d/tools/build-carry-policy.mjs` | A | `verification-policy` |
| `docs/c3-r37d/tools/portable-verify.mjs` | A | `verifier-code` |
| `docs/c3-r37e/C3-R37E-CARRY-POLICY.json` | A | `verification-policy` (history) |
| `tests/c3-evidence-rehearsal.test.mjs` | M | `test-code` (B32 fix + B33 comment correction) |

| | Value |
| --- | --- |
| Verified integration commit | `2209761f3f7a24480fd43b110e4acd71adb7e499` |
| Corrected test commit | `fa89629272f80c2b9774159f4bc343964f014fab` |
| Carry commit (policy) | `fc64286076a83372ca21c6a9c53bddbe493a3d19` (195 files) |
| Carry policy | `fef48ef74515fdb118cb3735c9087a1121c59d1e86a9d636958f40ce8b45cd61` |
| **New trust anchor** | **`6603c59779e875957401f34035ae49ebc784ef0c0b63032864d687effee67460`** |

Refusal behaviour confirmed on both platforms:

| Probe | Exit | Failed check |
| --- | --- | --- |
| **old R37E anchor** (`b20ceaee…`) against the new chain | **1** | `carry-digest-matches-trusted-anchor` (16/17) |
| verifier modified in the worktree, new anchor | **1** | `verification-implementation-is-anchored`, `worktree-clean-except-ignored` (15/17) |
| new anchor, clean checkout | **0** | — (17/17) |

The R37E policy is preserved as history in the carry set, not deleted.

## 5. Phase D — regression on the corrected commit

| Step | Windows | Linux (Node 22.23.4) |
| --- | --- | --- |
| Clone HEAD | `fc642860…` (195 files, clean) | `fc642860…` (195 files, clean) |
| Portable verify, new anchor | **17/17 exit 0** | **17/17 exit 0** |
| Portable verify, old anchor | exit 1 | exit 1 |
| Root / toolchain `npm ci` | exit 0 / exit 0 | exit 0 / exit 0 |
| `validate:foundation` | exit 0 | exit 0 |
| `test:runtime` | exit 0 | — |
| C3 parallel | **213 · 209 pass · 4 skip · 0 fail, exit 0** | **213 · 213 pass · 0 skip — 3 of 3 runs, exit 0** |
| C3 serialized | (covered in R37E) | **213 · 213 pass · 0 skip, exit 0** |
| Catalog build | exit 0 | exit 0, `ce46c185…` / `47eff84e…` |
| B32 mutation probes | **8/8** expected outcomes | — |
| Control-byte scan | 181 files, 0 unexpected | 182 files, 0 unexpected |

The four Windows skips are the symlink-capability cases, reported separately and unrelated to this milestone. The bundle
digest is identical at both ends: `723d1c76507c026f1656f8e78f54f1feebd74078b1c929f3f812197d7aac406d`.


## 6. Phase E — proposed authoritative integration

**Nothing is staged. This is a proposal for a separate authorization decision.**

### 6.1 What a reviewed integration commit would introduce

| Class | Count | Notes |
| --- | --- | --- |
| Additions (tracked rows) | **135** | documentation, source, evidence, tests, tooling |
| Additions (reviewed-but-ignored) | **4** | the C3-R36H.3 console logs, reached only through the `!docs/c3-r36h3/logs/*.log` negation |
| Additions (this milestone's files) | **2** | the inventory and this record |
| **Total additions** | **141** | |
| Modifications | **5** | `.gitignore`, `package-lock.json`, plus 3 representation-only changes — §6.2 |
| Exclusions | **15** | 12 duplicate screenshots + 3 per-run `runs/*/gate-results.json` |

Inventory: `docs/c3-r37f/C3-R37F-INTEGRATION-INVENTORY.json` — 152 rows, **0 duplicate paths, 0 deferred**, and all
four reviewed-ignored exceptions match their recorded digests. Generated by
`docs/c3-r37f/tools/build-integration-inventory.mjs`; the C3-R37A generator stays untouched as history.

### 6.2 The modification count is 5, not 2 — measured, not assumed

Two files are modified in the worktree. Applying the C3-R37B line-ending policy (`-text` on byte-sensitive paths) also
rewrites three tracked blobs from LF to CRLF **without changing their content**:

| File | Change type | Why it is required |
| --- | --- | --- |
| `infrastructure/cloudflare/worker.mjs` | representation only | preserves the reviewed `261732ec…` fingerprint across clones |
| `infrastructure/cloudflare/wrangler.jsonc` | representation only | preserves `df648688…` |
| `package.json` | representation only | preserves `ac8d0bec…` |

This is the consequence C3-R37.1 warned about and the candidate preflight measured: three blobs change bytes without
changing content, and that is precisely what lets the recorded fingerprints survive a clone on either platform.

### 6.3 What integration would not introduce

Generated output (`node_modules/`, `apps/catalog/dist/`, toolchain installs), per-run browser output, duplicate
screenshots, and every secret-bearing pattern. No workflow change, no publication, no deployment.


## 7. Remaining blockers

| ID | Blocker | Status |
| --- | --- | --- |
| **B33** | control characters in committed comments | **Resolved** — corrected commit `fa896292`, scan clean, comment-only proof |
| **B32** | catalog build / rehearsal snapshot race | **Resolved in the candidate** (`fc642860`); still open in the authoritative `tests/` |
| B5 / B13 / B18 / B28 | clean-checkout reproducibility, independent checkout, git-attributable results | **Candidate-only** |
| B21 | canonical deterministic findings digest | **Open** — decision recorded at C3-R36H.3, not implemented |
| B23 | intermittent browser navigation timeout | **Open** — host-level, roughly one case per eight-case run |
| B26 | cleanup after externally terminated runs | **Open** — internal paths clean up; SIGKILL cannot be handled in-process |
| B27 | report-writer overwrite protection | **Open** — 10 of 12 writers overwrite; policy proposed at C3-R37 §6.2 |
| B14 / B19 / B20 | snapshot friction, keyboard/focus, cross-browser | **Open**, unchanged |

## 8. Artefact fingerprints

| Artefact | SHA-256 |
| --- | --- |
| `C3-R37F-CARRY-POLICY.json` | `fef48ef74515fdb118cb3735c9087a1121c59d1e86a9d636958f40ce8b45cd61` |
| `C3-R37F-INTEGRATION-INVENTORY.json` | `390b76e10c048d13e298958a95ede3ea64b1c6d7e48de3a87297de6923cac3e7` |
| `tools/comment-only-check.mjs` | `a58f81a5071da99815df138326bba666f40bbbbec2aa4f81238de60b5c8a1259` |
| `tools/control-char-scan.mjs` | `83dc213988e097f99587aab8d497d1e64927029bd16d3449a6ca55bda360b15b` |
| `tools/build-r37f-carry-policy.mjs` | `b5d92ffe3ab6350138871e3ca6f67a5a2dd151ed7dba6b608fea8324cd60f393` |
| `tools/build-integration-inventory.mjs` | `97c678f42abdb981b8242814efcbdc4e7b2ada025af55c6ca8bc1f03261ee8e5` |
| Corrected test file | `780a887cf7ddea451c0331f66a123b66d21a27b7f99956c4f18d13bdaef5a6b2` |
| R37E test file (superseded, preserved) | `910da7fcaffb22fac84d19e4f9021b7673a3be0f1def500cbf862883a1f38645` |
| Authoritative test file (untouched) | `f0179407e9a00034795549e2076e377df96b1aeeccf9893bafc63f34472d824f` |
| Linux bundle | `723d1c76507c026f1656f8e78f54f1feebd74078b1c929f3f812197d7aac406d` |
| `C3-R37F-INTEGRATION-READINESS.md` | reported in the handoff — a file cannot contain its own digest |

## 9. Three mistakes of mine in this milestone

1. **B33 was my own shell escaping.** Backticks in a PowerShell double-quoted string became BEL and VT. The correction
   was written with a Node script, so no shell evaluated the text.
2. **My first correction was itself mangled** — replacing only the control bytes left residual words
   ("…directorypps/catalog/dist…", "vite buildite build"). That intermediate commit (`79be6811`) was discarded by
   amending the successor; the R37E commit `bb1e0416` was never touched, as required.
3. **Two harness details hid results**: `set -e` in the Linux script aborted the moment the old anchor correctly
   returned 1, cutting off the regression output; nested-quote `grep` calls printed errors instead of counts. Both were
   re-run through script files.

## 10. Final state

| Item | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` — unchanged |
| Parent HEAD | `ea67a03`, 30 default entries — unchanged |
| Staged | **0** |
| Authoritative status | 51 default / 154 individual (147 before this milestone's files) |
| Candidate chain | `2209761f` → `18cf6f6e` → `2aa13143` → `bb1e0416` (R37E, preserved) → `fa896292` (B33 fix) → `fc642860` (policy) |
| Disposable material | `F:\c3r37e-*`, `F:\c3r37d-*`, `~/c3r37f-*`, `~/c3r37e-*` — reproducible from the tools |
| Commits / pushes / merges / PRs / workflows / deployments (authoritative) | **none** |

## 11. What this does not establish

It does not authorise integration — that needs a separate decision, and nothing is staged. It does not close B32 for
the authoritative repository, whose `tests/` still holds the racy version. It does not claim the suite has no other
shared mutable state, does not implement B21, and does not address B23, B26 or B27. Passing the verifier with the new
anchor establishes that the checkout is the named commit and matches the reviewed manifest and carry policy; it
establishes nothing about authorship, CI or approval.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

