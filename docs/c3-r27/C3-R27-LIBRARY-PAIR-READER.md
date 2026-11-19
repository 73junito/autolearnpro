# C3-R27 — Isolated Consistent Library Pair Reader

Date: 2026-11-04 · Local only. No commit, push, PR, workflow activation, settings change or deployment.

## 1. Fingerprints

| Artifact | SHA-256 | Size |
| --- | --- | --- |
| Source baseline (staging, unchanged) | `9cd129391dd4e5af567836cacaf4957c6902362d9327bb54f19ff4017bc72c39` | 50 lines |
| **Reader port** `infrastructure/c3/library/library-pair-reader.mjs` | **`820b4d3b4964487a…`** | see file |
| Recovery port (C3-R26, unchanged) | `c23777a227a8e45769034a7b852d7d48742a2a11cea173d17005aadd97d2bce4` | 143 lines |
| Tests `tests/c3-library-reader.test.mjs` | `7cb35449f85dbb90…` | 15 tests |

**Pre-implementation integrity gate:** source hash **matched** the C3-R25 manifest exactly, the recovery port
was **unchanged** since C3-R26, and **0 of 7** reviewed modules drifted. Nothing was re-pinned or rewritten
to make verification pass.

## 2. Adaptations — four, all additive or authorization-related

### A1 — authorization delegated, not duplicated

The source imported `LIBRARY_TARGETS` directly. The port imports `assertTargetsApproved` from the C3-R26
module, so the reader **cannot** hold a second, weaker copy of the rule and **cannot bypass** the recovery
module's authorization. There is no local fallback list.

### A2 — nested targets rejected (`R19_TARGET_CONFLICT`)

`assertDistinctTargets` rejects a "pair" where one target is an ancestor of the other. Duplicates were
already refused by `assertTargetsApproved`; nesting was not, and a directory plus a file inside it is not a
pair.

### A3 — containment checked for every target parent (`R19_PATH_ESCAPE`)

The source applied `lstat` only to the target **file**, so a linked `specs/` directory would be followed
without question. The port resolves each target's parent with `realpathSync` and requires it to remain inside
the realpath of the root, before any read. An absent parent is still reported as
`R19_MISSING_OR_SYMLINK`, not as an escape.

### A4 — authorization precedes every filesystem call

Target approval runs before `realpathSync(rootDir)`, so an unapproved call cannot observe root existence,
journal state, or lock state.

### Deliberately NOT changed

The generated-module format contract keeps its two literal header lines, including the strings
`specs/asset-library.json` and `scripts/validate-asset-library.mjs`. **These are format bytes, not target
authorization.** Generalising them would make every real generated library fail the exact-byte comparison.
The failure reason for a duplicate target remains `R19_TARGETS_NOT_APPROVED` (surfaced from the recovery
module); nesting adds its own code.

## 3. Preserved guarantees

| Guarantee | Source | Port |
| --- | --- | --- |
| Never throws — every outcome is a result object | yes | yes |
| `R19_ROOT_REQUIRED`, `R19_ROOT_UNAVAILABLE` | yes | yes |
| `R19_PENDING_JOURNAL` before any read | yes | yes |
| `R19_WRITER_LOCK_PRESENT` | yes | yes |
| `R19_MISSING_OR_SYMLINK` (missing file **or** symlinked target) | yes | yes |
| `R19_INVALID_DOCUMENT` (unparsable JSON, unparsable module) | yes | yes |
| `R19_LIBRARY_MISMATCH` (canonical structure differs) | yes | yes |
| `R19_UNSTABLE_READ` (double read + checksum comparison) | yes | yes |
| `R19_TRANSACTION_STARTED_DURING_READ` | yes | yes |
| Exact-byte module reconstruction — hostile append refused | yes | yes |
| `R19_READ_FAILED` catch-all | yes | yes |
| Read-only: no write, delete, lock, journal edit, or recovery call | yes | yes |

## 4. Security review

| Concern | Position |
| --- | --- |
| Read-only | Only `existsSync`, `lstatSync`, `readFileSync`, `realpathSync`, `statSync` (tests). No write API is called anywhere in the module. |
| No recovery | A pending journal is reported, never consumed — proven by a before/after tree snapshot. |
| No writes at all | Success and failure paths both compared against a full tree snapshot (names, sizes, mtimes). |
| Worker isolation | Not imported by `infrastructure/cloudflare/*` or `apps/web/src/*` — verified by grep. |
| No shell | No `child_process`. |
| Symlink/junction | Target-file symlinks refused by `lstat`; linked parent directories refused by realpath containment (**junction case tested and passed**). |
| Authorization | Delegated to the reviewed C3-R26 gate, so there is exactly one implementation of the rule. |

## 5. Tests — 15 total, 14 pass, 0 fail, 1 skipped

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Valid consistent pair | **pass** — `ok:true`, 2 hashes of 64 hex, `assetCount` 2, hash equals real file digest |
| 2 | Missing first / second file | **pass** — `R19_MISSING_OR_SYMLINK` both ways; absent and non-string root also covered |
| 3 | Malformed JSON / malformed module | **pass** — `R19_INVALID_DOCUMENT` |
| 4 | Mismatched generation identifiers | **pass** — `R19_LIBRARY_MISMATCH` |
| 5 | Hash/byte divergence | **pass** — appended code after the export → `R19_INVALID_DOCUMENT` |
| 6 | Noncanonical serialization | **pass** — re-indented module and missing trailing newline rejected; compact JSON still accepted (documents that the source compares structure for JSON and bytes for the module) |
| 7 | Journal vs lock | **pass** — `R19_PENDING_JOURNAL` before lock, journal wins when both present |
| 8-9 | Explicit target authorization | **pass** — no list, empty, absolute, traversal, duplicate, nested all refused; a valid pair on disk is still refused without approval |
| 10 | Path traversal / realpath escape | **pass** — junction parent → `R19_PATH_ESCAPE` (ran, not skipped) |
| 11 | Symlink target | **SKIPPED** — host refuses file symlinks without elevation |
| 12-13 | No auto-recovery, no mutation | **pass** — journal, staged and backup files untouched; tree snapshot identical on both paths |
| 14 | Repeated deterministic reads | **pass** — three deep-equal results |
| 15 | Recovery-module interoperability | **pass** — accepts exactly what `assertTargetsApproved` approves; refuses what it refuses |
| 16 | Partially completed transaction | **pass** — refused, staged/backup bytes preserved, snapshot identical |

All fixtures are `mkdtemp` directories removed via `t.after`.

## 6. Platform gap and Linux readiness

Two tests in this repository are **skipped on this Windows host** because it refuses file symlinks without
elevation: C3-R26 `R17_TARGET_SYMLINK` and C3-R27 `R19_MISSING_OR_SYMLINK` (symlink branch). **Neither
behaviour is claimed as verified.** No assertion was replaced with a passing one.

Both remain visible as `# SKIP` in TAP output, so CI reporting cannot silently lose them.

**Linux verification path — prepared, not performed.** On Linux no elevation is needed, so both should run:

```bash
node --test tests/c3-recovery.test.mjs        # expected: 39 tests, 0 skipped, 0 fail
node --test tests/c3-library-reader.test.mjs  # expected: 15 tests, 0 skipped, 0 fail
```

Tests are POSIX-safe: `mkdtemp`/`rmSync`, no Windows paths, and `'junction'` is a no-op type on POSIX where a
real directory symlink is created — which is what the escape test needs. No workflow was installed to run
this; it must be executed manually or in a separately reviewed CI change.

## 7. Verification (exit codes captured immediately, not from early-terminating pipelines)

| Command | Exit | Result |
| --- | --- | --- |
| `node --test tests/c3-recovery.test.mjs` | **0** | 38 pass / 0 fail / 1 skip |
| `node --test tests/c3-library-reader.test.mjs` | **0** | 14 pass / 0 fail / 1 skip |
| `node --test tests/runtime-health.test.mjs` | **0** | 1 pass |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories validated |
| `npm run test:runtime` | **0** | 3 pass |

Post-test state:

| Check | Result |
| --- | --- |
| Stray journal / lock / `.r16-*` artifacts in the repository | **none** |
| Staging source drift (7 modules) | **0** |
| Parent worktree | `foundation/07…`, `ea67a03`, **30 entries untouched** |
| Workflows in `.github/workflows` | only `cloudflare-foundation-staging.yml` (unchanged) |
| `package.json` / `package-lock.json` | **not modified**; no dependency added |
| Nothing staged; HEAD | `ea67a03` |
| Production Cloudflare / Supabase / R2 / Docker / TorqueMind | untouched |

## 8. Changed-file inventory (all untracked, nothing staged)

New in C3-R27: `infrastructure/c3/library/library-pair-reader.mjs`,
`tests/c3-library-reader.test.mjs`, `docs/c3-r27/C3-R27-LIBRARY-PAIR-READER.md`.

Retained from earlier: `infrastructure/c3/library/library-pair-recovery.mjs`,
`tests/c3-recovery.test.mjs`, `docs/c3-r26/C3-R26-RECOVERY-PORT.md`, `docs/c3-r25/*` (11 files), and the
7 scaffold `README.md` files. Total untracked after this milestone: **24 files** (verified by
`git status --short --untracked-files=all`, not counted by hand).

## 9. Remaining issues

1. Two symlink-dependent tests remain unverified on this platform (§6).
2. **No approved target paths exist** — the reader is fail-closed until a list is approved, by design.
3. `R22`/`R23`/`R24` not ported; `vite`/`esbuild` still absent from the root manifest.
4. The C3-R26 test hook's environment gate remains a heuristic (unchanged this milestone).

## 10. Next milestone

**C3-R28 — approve the target-path decision, then port `library-generation-r20.mjs`.** Generation inherits
both contracts and is the first module that *writes*, so it cannot proceed until the approved list and the
write-authorization design are settled.
