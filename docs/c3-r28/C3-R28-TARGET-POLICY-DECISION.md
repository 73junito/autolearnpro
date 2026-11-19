# C3-R28 — Target-Path Security Decision and Immutable Generation

Date: 2026-11-04 · Local only. No commit, push, PR, workflow, settings change or deployment.
**No production or staging library path is approved by this record.**

## 1. Decision: three tiers, one issuable

| Tier | Issuable in C3-R28 | Enforcement |
| --- | --- | --- |
| `temporary` | **yes** | root must resolve **inside `os.tmpdir()`** |
| `staging` | **no** | `R28_STAGING_NOT_AUTHORIZED` — needs its own recorded decision |
| `production` | **no** | `R28_PRODUCTION_NOT_AUTHORIZED` — no authorization mechanism exists |

**The control is containment, not a denylist.** Because an authorised root must live inside the OS temp
directory, a production or staging destination cannot be *expressed*: there is no blocklist to bypass, no
substring to evade, no path that is "probably fine". A path-name blocklist would fail against a renamed
directory or an unexpected drive letter; containment fails closed by construction.

## 2. Fail-closed rules

| Code | Meaning |
| --- | --- |
| `R28_POLICY_REQUIRED` / `R28_POLICY_TIER_UNKNOWN` | no policy object, or an unrecognised tier |
| `R28_STAGING_NOT_AUTHORIZED` / `R28_PRODUCTION_NOT_AUTHORIZED` | refused before any filesystem access |
| `R28_PUBLICATION_FLAG_INVALID` | `publicationAuthorized` is not exactly `false` |
| `R28_ROOT_REQUIRED` / `R28_ROOT_UNAVAILABLE` | missing or unresolvable root |
| `R28_ROOT_NOT_TEMPORARY` | root resolves outside the OS temp directory |
| `R28_DESTINATION_REQUIRED` / `R28_DESTINATION_UNAVAILABLE` / `R28_DESTINATION_OUTSIDE_POLICY` | write targets checked against the authorised root |
| `R17_TARGETS_NOT_APPROVED` | reused from R26: absent, empty, absolute, `..`, duplicates |
| `R19_TARGET_CONFLICT` | reused from R27: nested targets are not a pair |

**Forged policies are re-derived, not trusted.** `assertPolicy` recomputes the tier, the publication flag, the
target list and the root containment from the object's *values*. A caller can construct
`{tier:'temporary', rootDir:'C:\\', targets:[...], publicationAuthorized:false}` and it will be refused with
`R28_ROOT_NOT_TEMPORARY` — tested.

## 3. Generation port — adaptation inventory

| # | Adaptation | Why |
| --- | --- | --- |
| 1 | `LIBRARY_TARGETS` → caller-supplied `allowedTargets`, revalidated in `approvedTargets` | the source closed over staging paths that do not exist in this repository |
| 2 | `inspectLibraryPair` calls now pass targets (R27 requires them, and applies realpath containment) | keeps source reads authorised and escape-checked |
| 3 | `verifyGeneration` gains `allowedTargets` | `R20_INVALID_TARGET_SET` is meaningless without the expected set |
| 4 | `materializeGeneration` requires an authorised `policy`; output must be inside the policy root **and** inside temp | a loose `outputRoot` parameter alone authorised any temp path |

Preserved unchanged: content-addressed id, `publicationAuthorized:false` in every record, immutable reuse of
an identical existing generation, `R20_IMMUTABLE_COLLISION`, staging-dir + `renameSync` atomic publish, post-write
verification, `finally` cleanup, `R20_DISABLED` gate, `assertMatchingGeneration` mismatch detection.

## 4. Filesystem side-effect review

| Operation | Where | Bounded by |
| --- | --- | --- |
| Source reads | `sourceRoot` | R27 authorization + realpath containment |
| `mkdirSync` / `writeFileSync` (`wx`) | fresh `.r20-staging-<random>` | inside `outputRoot` → inside policy root → inside temp |
| `renameSync` staging → `sha256-<id>` | `outputRoot` | same three containments; atomic, never overwrites (destination existence is checked first) |
| `rmSync` staging | `outputRoot` | only the directory this call created |
| No delete of source, journal, lock, or any generation | — | verified by before/after tree snapshot |

**Note on an inherited branch:** the source's `R20_SOURCE_BUSY` check is unreachable in both the source and
this port, because the R27 reader already refuses a pending journal (`R19_PENDING_JOURNAL`) before that line.
It is preserved rather than removed so the port stays diff-comparable, and it is recorded here rather than
claimed as an active control.

## 5. Test results — 13 tests, 12 pass, 0 fail, 1 skipped

| Required area | Result |
| --- | --- |
| Valid content-addressed generation | **pass** — record schema, `publicationAuthorized:false`, file hashes match |
| Deterministic identifiers | **pass** — two describes identical; second materialize `created:false` |
| Matching / mismatched hashes | **pass** — `R20_TAMPERED` on file edit, restored state re-verifies |
| Forged generation id | **pass** — `R20_INVALID_MANIFEST` (directory name no longer matches) |
| Existing identical generation | **pass** — reused, never rewritten |
| Conflicting existing generation | **pass** — `R20_IMMUTABLE_COLLISION`, pre-existing bytes untouched |
| Incomplete generation | **pass** — missing artifact, missing manifest, and missing target set all fail |
| Invalid root / policy | **pass** — production, staging, unknown tier, non-temp root, empty and absent targets; forged object and forged flag both refused; nothing written |
| Traversal / realpath escape | **pass** — `..` and absolute targets, nesting, non-scratch output, outside-policy output |
| Symlink / junction | **junction escape passes**; symlinked manifest **skipped** (host refuses file symlinks) |
| No unintended mutations | **pass** — source tree snapshot identical; exactly one generation dir; no `.r20-staging-*` |
| No production-path access | **pass** — structurally impossible for an authorised policy; all attempts refused |
| No implicit publication | **pass** — `R20_DISABLED` without `enabled:true`; no `published`/`url` fields |
| Interoperability R26/R27 | **pass** — reader accepts the same pair; refused target sets stop generation; pending journal reported and not consumed; mismatched pairing detected |

## 6. Skip inventory — now three, all visible

| Suite | Skipped case | Reason |
| --- | --- | --- |
| C3-R26 recovery | `R17_TARGET_SYMLINK` | host refuses file symlinks without elevation |
| C3-R27 reader | symlink target branch | same |
| C3-R28 generation | `R20_SYMLINK` (8b) | same |

All three appear as `# SKIP` in TAP output. **None is claimed verified.** An earlier draft of test 8 reported
PASS while the symlink path was never exercised (`t.diagnostic` then early return); it was split into 8a/8b
so the skip is machine-visible. Junction-based escape tests **do** run and pass on this host.

Linux expectations after elevation-free symlinks are available:

```bash
node --test tests/c3-recovery.test.mjs         # 39 tests, 0 skipped expected
node --test tests/c3-library-reader.test.mjs   # 15 tests, 0 skipped expected
node --test tests/c3-library-generation.test.mjs  # 13 tests, 0 skipped expected
```

## 7. Verification

| Command | Exit | Result |
| --- | --- | --- |
| `node --test tests/c3-library-generation.test.mjs` | **0** | 12 pass / 0 fail / 1 skip |
| `node --test tests/c3-library-reader.test.mjs` | **0** | 14 pass / 0 fail / 1 skip |
| `node --test tests/c3-recovery.test.mjs` | **0** | 38 pass / 0 fail / 1 skip |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass |

State after testing: no `generation.json`, `sha256-*`, `.r20-staging-*` or `.r16-*` artefacts anywhere in the
repository; staging drift **0/7**; parent `ea67a03` with **30 entries untouched**; workflows unchanged;
nothing staged; **28 untracked files**.

## 8. Fingerprints

| Artifact | SHA-256 (prefix) |
| --- | --- |
| Source baseline `library-generation-r20.mjs` (staging) | `0bbca48e29988e46…` (unchanged, matches manifest) |
| Port `infrastructure/c3/library/library-generation-r20.mjs` | `7003b7b34e8320e3…` |
| `infrastructure/c3/library/target-policy.mjs` | `b07ff9a988cf99cf…` |
| `tests/c3-library-generation.test.mjs` | `fe53cf6034fea166…` |

## 9. Remaining issues

1. Three symlink-dependent cases unverified on this platform (§6).
2. **No staging or production path is authorised, by design.** Temporary generation is not publication.
3. `R22`/`R23`/`R24` unported; `vite`/`esbuild` still absent from the root manifest.
4. `R20_SOURCE_BUSY` is an inherited unreachable branch (§4).
5. The C3-R26 test-hook environment gate remains a heuristic.

## 10. Next milestone

**C3-R29 — port `build-provenance-r21.mjs`.** It consumes the generation contract without writing, so it can
be ported without a staging/production authorization decision. A real staging target decision should stay
blocked until the history-wide sensitive-data review and protected-CI work are settled, because an authorised
staging path is the first step toward persistent publication.
