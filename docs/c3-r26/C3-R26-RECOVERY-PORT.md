# C3-R26 — Isolated Library Recovery Port

Date: 2026-11-04 · Local only. No commit, push, merge, workflow install, or dependency change.

## 1. Fingerprints

| Artifact | Path | SHA-256 | Size |
| --- | --- | --- | --- |
| Source baseline (unmodified) | `lib/assets/library-pair-recovery.mjs` (staging) | `eb9bac60dfb23d630888538484ee01e0711be2d76ab1d441740e7ffa17336e3c` | 4030 B / 72 lines |
| **Port** | `infrastructure/c3/library/library-pair-recovery.mjs` | **`c23777a227a8e45769034a7b852d7d48742a2a11cea173d17005aadd97d2bce4`** | 7743 B / 143 lines |
| Tests | `tests/c3-recovery.test.mjs` | 39 tests | 14564 B |

The baseline is **unchanged on disk** (re-hashed after porting). The port is not byte-identical by design:
the difference is the three adaptations below plus formatting.

## 2. Adaptations — exactly three

### A1 — the staging allow-list became provenance, not a default

`LIBRARY_TARGETS` → `STAGING_LIBRARY_TARGETS`, frozen, **never used as a default**. `allowedTargets` is a
required parameter; omitting it throws before any filesystem read. Reason: the two staging paths
(`specs/asset-library.json`, `cloudflare/api/src/asset-library.generated.js`) **do not exist** in the
authoritative repository, so a default would key the write-authorization boundary to paths that never exist.

The instruction not to silently substitute authoritative Cloudflare paths is honoured by refusing to choose
any path: the caller must supply an approved list.

`assertTargetsApproved` rejects absent, null, non-array, empty, non-string, empty string, absolute POSIX
path, absolute Windows path, any `..` segment, and duplicates after backslash normalisation. It returns a
frozen copy, so a caller cannot widen the list after approval.

### A2 — the test hook is gated on two independent conditions

`onRestored` now requires `allowTestHooks === true` **and** a set `process.env.NODE_TEST_CONTEXT`; a
non-function is rejected as `R17_TEST_HOOK_INVALID`. The source's comment ("Do not supply it from the
operational recovery CLI") was documentation. This is enforcement.

**Honest limit:** the environment variable is a heuristic — a production process can set it. It raises the
cost of accidental use and makes intent visible at the call site; it is not a security boundary.

### A3 — target authorization runs before state is observed

Both gates execute before `fs.realpathSync(rootDir)`, so an unauthorized call cannot read the journal or the
lock, or even confirm the root exists.

## 3. Preserved without weakening

| Property | Source | Port |
| --- | --- | --- |
| `R17_ROOT_REQUIRED` | yes | yes |
| `R17_EXPLICIT_STALE_LOCK_OVERRIDE_REQUIRED` | yes | yes |
| `R17_JOURNAL_INVALID` (schema, hashes, duplicates, allow-list membership) | yes | yes |
| `R17_PATH_ESCAPE` (realpath containment) | yes | yes |
| `R17_TARGET_SYMLINK` | yes | yes |
| `R17_DESTINATION_DRIFT` | yes | yes |
| `R17_BACKUP_INVALID` (including the already-restored branch) | yes | yes |
| Durability statements: `wx` exclusive create, `0o600`, `fsyncSync` | **4** | **4** |
| Validation completes before any mutation | yes | yes |
| Journal → lock → backup → staged cleanup order | yes | yes |

## 4. Tests — 39 total, 38 pass, 0 fail, 1 skipped

| Group | Cases |
| --- | --- |
| Valid recovery | pair restored; journal, lock, backup and staged files cleared; a target that did not previously exist is removed |
| Missing journal | `NO_JOURNAL`, and an existing lock is **left untouched** — documents that R20A orphan-lock behaviour is not in this module |
| Malformed journal | 9 shapes (not JSON, wrong version, bad nonce, empty entries, >2 entries, bad `newSha`, `existed` with null `oldSha`, `oldSha` set when `existed:false`, non-boolean `existed`) plus duplicate entries |
| Escape | realpath escape through a linked parent → `R17_PATH_ESCAPE` — **ran and passed** (junction needs no admin) |
| Symlink | destination symlink → `R17_TARGET_SYMLINK` — **SKIPPED: this host refuses file symlinks without elevation** |
| Drift | content matching neither hash → `R17_DESTINATION_DRIFT` |
| Backup | tampered backup → `R17_BACKUP_INVALID` |
| Stale lock | refused without override, and the journal is not consumed; allowed with `allowStaleLock` |
| Allow-list | 9 refusal cases; frozen list; **no implicit default even for a staging target**; unapproved journal target refused |
| Partial state | backup already removed + destination at `oldSha` recovers; backup gone + destination at `newSha` → `R17_BACKUP_INVALID` |
| Idempotency | second run returns `NO_JOURNAL`; destination byte-identical |
| Test hook | requires opt-in; refused without a runner context; non-function rejected; authorised hook fires once per entry |
| Durability | `syncFile` writes then refuses to overwrite (`EEXIST`); `syncExisting` fsyncs |

All fixtures are `mkdtemp` directories under `os.tmpdir()`, removed via `t.after`. **No library, Cloudflare or
production file is read or written by any test.**

## 5. Unresolved issues

1. **`R17_TARGET_SYMLINK` is unproven on this platform.** The behaviour is preserved verbatim from the
   reviewed source, but the test cannot run here. It needs a Linux CI run (or an elevated Windows session)
   before that property is claimed as verified.
2. **No approved target path exists yet.** The authoritative repository has no `specs/` directory and no
   generated library artifact, so with this port *nothing is recoverable* until an approved list is defined
   by a separate decision. That is the intended fail-closed behaviour, not a defect.
3. `R22`/`R23`/`R24` are not ported; `vite` and `esbuild` remain absent from the root manifest.
4. The test-hook environment gate is a heuristic (A2).

## 6. Verification

| Check | Result |
| --- | --- |
| `node --test tests/c3-recovery.test.mjs` | **38 pass / 0 fail / 1 skip**, exit 0 |
| `node --test tests/runtime-health.test.mjs` | **1/1 pass** |
| `npm run test:runtime` | **3/3 pass**, exit 0 |
| `node docs/c3-r25/verify-review.mjs` | **14/14 PASS**, exit 0 |
| `npm run validate:foundation` | **PASS**, exit 0 |
| `npm ci --ignore-scripts` (the workflow's own step) | **exit 0**, 15 packages, manifest and lockfile unchanged |
| Worker / request-path imports of `c3/library` | **none** |
| `package.json` / `package-lock.json` modified | **no** |
| Nothing staged; HEAD | `ea67a03` |

`npm ci` succeeded because the lockfile is consistent with the committed manifest — evidence the proposed
workflow's install step is sound, on Windows. It does not verify the Linux runner.

## 7. Next milestone

**C3-R27 — port `library-pair-reader.mjs`** under the same `tests/*.test.mjs` convention, keeping
`infrastructure/c3/library/` flat. The reader depends only on this module and `node:*`, so it can proceed
without resolving the approved-target decision that blocks operational recovery.
