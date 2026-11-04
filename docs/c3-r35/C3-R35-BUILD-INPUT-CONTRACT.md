# C3-R35 — Catalog/Worker Build Input Contract

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local contract, documentation and tests only. R22 build orchestration is NOT ported. No bundler ran against
the Worker, nothing was deployed, no manifest or lockfile changed, and no commit was made. KCOE8006 FITMENT
HOLD remains active.**

## 1. Outcome

B2 is now a validated contract rather than a recommendation. `infrastructure/c3/build/build-input-contract.mjs`
validates an **explicit** three-root mapping — repository, catalog application, Worker — plus a temporary
output root under the existing R28 policy, and `assertWorkerBoundary` enforces the Worker's capability
boundary without running it. Twelve tests pass, five mutation probes prove the guards can fail, and B1 and B5
are documented with their claims retired rather than quietly edited.

| Phase | Result |
| --- | --- |
| A — baseline | **no drift** — R34 hash, both HEADs, R30 toolchain, R25 manifest all verified before any write |
| B — B1 disposition | **documented**, R32 correction appended, wording supplied by the reviewer adopted verbatim |
| C — explicit mapping | **implemented** — 9 inputs across 3 roots, fail-closed, no inference |
| D — Worker boundary | **implemented + preserved** — `worker.mjs` untouched, capability rules enforced by test |
| E — validation tests | **12/12 pass**, 5/5 mutation probes caught |
| F — B5 | **measured against a real clean checkout**, not inferred |

## 2. Phase A — baseline

| Check | Value |
| --- | --- |
| C3-R34 record | `856d9714542633cb…` — matches the reviewed fingerprint |
| C3-R33 record | `47ff13443076ce31…` — matches the post-§14 fingerprint |
| Integration HEAD / branch | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `integration/c3-r25-ci-readiness` |
| Integration status | 25 default / 51 `--untracked-files=all`, **0 staged**, modified: `.gitignore` (R30, pre-existing), `package-lock.json` (C3-R34, authorised) |
| Parent worktree | `ea67a03`, 30 / 39 entries — untouched |
| Root `package.json` | `ac8d0bec1e87459b…` — unchanged since C3-R30 |
| Root `package-lock.json` | `f805b6f77f392467…` — unchanged since C3-R34 |
| R30 toolchain package | `b33b1db8bb9ac557…` and `aee38b5df3b732c9…` — unchanged |
| Catalog files | all four match the C3-R34 record exactly |
| Worker source | `worker.mjs` `261732ecb9accae4…`, `wrangler.jsonc` `df6486888a42317d…` |
| Installed versions | `vite 7.3.7`, `three 0.180.0`, `esbuild 0.28.2` |
| R25 source manifest | **14/14 PASS**, zero drift |

### Windows skips, recorded separately from Linux verification

Four skips appear in every C3 run: `c3-library-generation` 8b, `c3-library-reader` 11,
`c3-offline-evidence` 13, and the journal symlink case. All four are **host capability** skips — Windows
refuses file symlinks without elevation. R26–R28 verified their equivalents on Ubuntu with **zero skips**
(67/67), so these are not open failures for those suites; **C3-R31's symlink case remains unverified on Linux**
and is carried into §11. C3-R35 adds no new skip: its symlink cases use directory junctions, which this host
permits, and they ran.

## 3. B1 — dependency ownership: resolved and documented

### The accepted model, as decided

`apps/catalog` owns `three@0.180.0` (runtime) and `vite@7.3.7` (build). The root workspace lockfile records
them. `infrastructure/c3/build` keeps its own manifest, lockfile and `esbuild` pin for evidence tooling. The
privileged Node service imports neither. The Worker stays filesystem-free.

### What changed in the documentation, and what did not

`docs/c3-r32/C3-R32-CATALOG-WORKER-ARCHITECTURE.md` gained **§12**, which quotes the four now-inaccurate lines
(46, 70, 80, 127–128), states what remains true *measured*, and adopts the reviewer's invariant verbatim:

> The foundation validation and privileged runtime dependency boundaries remain protected. The root development
> workspace now installs catalog build tooling, while individual runtime dependency graphs remain isolated and
> independently audited.

Sections 1–11 of R32 are unmodified; the record's hash changed by addition only (`6ddd697b128cc35f…` →
`a66678a53d0f6ffc…`).

**No dependency moved and no lockfile was rewritten in this milestone.** `package.json` and
`package-lock.json` are byte-identical to their C3-R34 values (§2).

## 4. B2 — the explicit build-input mapping

Four roots, each named by the caller, none derived:

| Root | Location in this repository | Role | Authorisation |
| --- | --- | --- | --- |
| **repository** | `F:\autolearnpro-c3-r25-integration` | the reviewed source structure and the root lockfile | read-only |
| **catalog** | `apps/catalog` | the browser application | read-only |
| **worker** | `infrastructure/cloudflare` | the Cloudflare Worker source of truth | read-only |
| **output** | caller-supplied, inside an R28 temporary policy root | ephemeral build destination | temporary tier only |

### The nine inputs, by root

| Root | Input | Kind |
| --- | --- | --- |
| repository | `package.json` | file |
| repository | `package-lock.json` | file |
| catalog | `package.json` | file |
| catalog | `index.html` | file |
| catalog | `vite.config.js` | file |
| catalog | `src` | directory |
| catalog | `src/main.js` | file |
| worker | `worker.mjs` | file |
| worker | `wrangler.jsonc` | file |

### Correspondence with R22's nine historical names

| R22 input | Now | Note |
| --- | --- | --- |
| `package.json` | repository/`package.json` | same name, different root |
| `package-lock.json` | repository/`package-lock.json` | **the reason a single prefix cannot work** — a workspace app has no lockfile of its own |
| `vite.config.js` | catalog/`vite.config.js` | same name, application root |
| `catalog.html` | catalog/`index.html` | R22 expected two HTML entries; C3-R34 built one, deliberately |
| `index.html` | catalog/`index.html` | same entry |
| `cloudflare/api/wrangler.jsonc` | worker/`wrangler.jsonc` | the directory does not exist in this repository |
| `src/` | catalog/`src` | application root |
| `cloudflare/api/src/` | worker/`worker.mjs` | reduced to the single tracked entry point |
| `lib/assets/` | **absent** | generated library data does not exist and is not invented here |

`R22_CORRESPONDENCE` in the module carries this table as data, so the mapping cannot drift from its
documentation without a test noticing.

### What the validator refuses, in order

1. `R28_*` — policy is not a re-derivable temporary policy (`R28_POLICY_REQUIRED`,
   `R28_STAGING_NOT_AUTHORIZED`, `R28_PRODUCTION_NOT_AUTHORIZED`, `R28_ROOT_NOT_TEMPORARY`,
   `R28_PUBLICATION_FLAG_INVALID`). **Reused, not reimplemented.**
2. `R35_ROOTS_REQUIRED`, `R35_ROOT_REQUIRED:<role>`, `R35_ROOT_NOT_ABSOLUTE:<role>` — no root is inferred, and
   a relative path is never resolved against the working directory.
3. `R35_ROOT_UNAVAILABLE`, `R35_ROOT_NOT_DIRECTORY`, `R35_ROOT_SYMLINK:<role>` — a root may not be a redirect.
4. `R35_ROOTS_IDENTICAL`, `R35_ROOTS_NESTED:catalog-in-worker` / `:worker-in-catalog`,
   `R35_CATALOG_OUTSIDE_REPOSITORY`, `R35_WORKER_OUTSIDE_REPOSITORY` — nesting is refused, never resolved by
   precedence.
5. `R35_ROOT_NOT_REVIEWED_LOCATION:<role>` — opt-in (`requireReviewedLocations`) assertion that the roots are
   the reviewed ones, so a caller cannot label an arbitrary directory "the catalog".
6. `R35_OUTPUT_*` — outside the policy, inside or containing a source root, not empty, absent, or missing.
7. `R35_INPUT_PATH_INVALID` / `_ABSOLUTE` / `_TRAVERSAL` — checked as text before any filesystem access.
8. `R35_INPUT_MISSING`, `R35_INPUT_SYMLINK`, `R35_INPUT_KIND_MISMATCH`, `R35_INPUT_KIND_INVALID`,
   `R35_INPUT_UNSUPPORTED`, `R35_INPUT_ESCAPES_ROOT` — `lstat` per input, so a link is refused even when it
   points inside the root.
9. `R35_WORKER_*` — see §6.

The returned object is frozen and carries `claims` (`buildExecuted`, `workerBundled`, `networkUsed`,
`evidenceProduced`, `publicationAuthorized`, `deploymentAuthorized`, `gitCommitVerified` — all `false`) plus
`notEstablished` (`actualBuild`, `sourceCommitProvenance`, `trustedCiAttestation`, `publicationAuthority`).
Describing inputs never becomes a claim about building them.

### What this contract does not do

It does not build, snapshot, hash-sign, attest, or write evidence. It hashes the bytes it reads so a later
milestone has a substrate, and it says so little about them that C3-R31's `verifyOfflineEvidence` would refuse
its output as malformed evidence — correctly.

## 5. Phase D — the Worker boundary

`infrastructure/cloudflare/worker.mjs` remains the tracked source of truth: **613 bytes**, 14 lines, **zero
imports**, one `GET /health` route and a 404, with `cache-control: no-store` and `x-robots-tag: noindex` on
both. Its fingerprint (`261732ecb9accae4…`) is pinned in the test suite, so any change to it is a deliberate
act rather than a drifting edit.

### What `assertWorkerBoundary` enforces

| Rule | Error |
| --- | --- |
| Entry exists, is a regular file, is not a link, resolves inside the Worker root | `R35_WORKER_ENTRY_MISSING` / `_SYMLINK` / `_NOT_FILE` / `_ESCAPES_ROOT` |
| Configuration exists, is not a link, and parses (comments tolerated in `.jsonc`) | `R35_WORKER_CONFIG_MISSING` / `_SYMLINK` / `_UNREADABLE` |
| `main` must be exactly `./worker.mjs` — the config may not point away from the reviewed entry | `R35_WORKER_CONFIG_MAIN_MISMATCH` |
| No `node:`, `require(`, `process.env`, `infrastructure/c3`, `apps/web`, `lib/assets`, `wrangler deploy` in code (comments stripped first) | `R35_WORKER_FORBIDDEN:<token>` |
| Every import specifier must start `./` and resolve inside the root | `R35_WORKER_IMPORT_FORBIDDEN` / `_ESCAPES_ROOT` |

The import rule is the load-bearing one: **any** bare specifier is refused, so `pg`, `node:fs`, a CDN URL or
the privileged C3 library cannot be reached even if a future token list is incomplete.

### How a future esbuild bundle may use this file without changing its responsibilities

1. Entry is `infrastructure/cloudflare/worker.mjs`, unmodified, as the bundled entry point.
2. Output goes to the caller's **temporary** output root — never into the repository, never into
   `infrastructure/cloudflare/`.
3. No Node builtins are polyfilled and no `nodejs_compat` flag is introduced; a bundle that needed either would
   have failed `assertWorkerBoundary` first.
4. `wrangler.jsonc` `main` keeps pointing at `./worker.mjs` — the **source**, not a generated bundle — until a
   separate, reviewed milestone decides otherwise. This record does not change deployment configuration.

### How generated data could enter later, without privileged Node code in the Worker

A generated asset module would arrive as a **relative sibling inside the Worker root** (for example
`infrastructure/cloudflare/generated/asset-library.mjs`), imported as `./generated/asset-library.mjs`. That is
the only channel the boundary admits, and it means:

- the data is inert JSON or a plain ES module — no filesystem read, no database, no `infrastructure/c3` import;
- the generator stays in `infrastructure/c3/library`, where it is Node-only and never bundled;
- the Worker's capability set does not change, so the security argument in R32 §4 survives.

**Unresolved, and stated as unresolved:** Worker bundle-size limits against a real generated library, and
whether generated data should be a module or a fetched R2 object. Both belong to a later milestone; R2 writes
remain prohibited today.

### What was deliberately not done

No route added, no binding added, no `wrangler` install, no deploy, no credentials, no database client, no
change to `wrangler.jsonc`. One honest observation: `wrangler.jsonc`'s `$schema` points at
`../../node_modules/wrangler/config-schema.json`, which does not exist because `wrangler` is not installed. The
validator deliberately does **not** require that path — a schema pointer is documentation, not a capability —
and the omission is recorded rather than silently tolerated.

## 6. Phase E — the validation tests

`tests/c3-build-input-contract.test.mjs` (23,819 B). **The positive case runs against the real repository, the
real application and the real Worker.** Negative cases copy those real inputs into a temporary tree and then
remove or corrupt exactly one thing, so no placeholder is ever accepted in place of an application input.

| # | Case | Result |
| --- | --- | --- |
| 1 | Valid explicit repository/catalog/Worker mapping | pass — 9 inputs, lockfile attributed to `repository`, `src` digested with named entries, reviewed locations confirmed, all seven claim flags `false`, R22 correspondence complete |
| 2 | Missing catalog entry point | pass — `R35_INPUT_MISSING:catalog/index.html` |
| 3 | Missing root lockfile | pass — `R35_INPUT_MISSING:repository/package-lock.json` |
| 4 | Missing Worker entry point | pass — refused by the mapping *and* by the boundary |
| 5 | Incorrect or nested roots | pass — identical, nested, outside-repository, relative, and a decoy app accepted only when reviewed-location checking is off |
| 6 | Traversal and realpath escape | pass — `..`, `src/../../`, absolute, `./`, invalid kind, linked input, link nested inside an input directory, linked root |
| 7 | Invalid temporary output root | pass — outside policy, inside source root, absent, required, not empty |
| 8 | Forged staging/production authorization | pass — production, staging, forged root, forged publication flag, forged tier, null policy |
| 9 | Worker import-boundary violation | pass — real Worker clean; `node:fs`, relative path into C3, `pg`, `process.env`, escaping relative import, wrong `main`, missing config |
| 10 | No changes to application or Worker source | pass — all six pinned fingerprints match, and both source trees digest identically before and after a full validation |
| 11 | No build execution, network access or deployment | pass — no write/spawn/network API, no bundler import; imports are exactly `node:crypto`, `node:fs`, `node:path`, `../library/target-policy.mjs` |
| 12 | Deterministic validation | pass — two validations describe the same tree identically; Worker validation likewise |

### Mutation probes — the guards are not vacuous

| Probe | Weakened | Test that caught it |
| --- | --- | --- |
| M1 | traversal segment check replaced with `if (false)` | **6** |
| M2 | `R35_ROOT_SYMLINK` renamed away, permitting a linked root | **6** |
| M3 | the `config.main !== './worker.mjs'` check removed | **9** |
| M4 | the `R35_CATALOG_OUTSIDE_REPOSITORY` guard deleted | **5** |
| M5 | the `R35_OUTPUT_NOT_EMPTY` guard deleted | **7** |

Every probe was restored **byte-identically**: `8fc0b8ccfb7df46f…` before and after the whole sequence.

**What these tests do not prove:** that a bundler can build anything, that the Worker runs, that generated
library data exists, or that the mapping is correct for any repository other than this one.

## 7. Phase F — B5, measured against a real clean checkout

B5 claimed the scaffold READMEs are untracked. Rather than infer the consequence, I exported the committed
tree and ran the real validator against it:

```powershell
git -C "F:\autolearnpro-c3-r25-integration" archive --format=tar HEAD -o $tmp\head.tar
tar -xf $tmp\head.tar -C $tmp
# then, from $tmp:
node infrastructure/scripts/validate-foundation.mjs
```

| Result | Value |
| --- | --- |
| Exit code | **1** — the validator throws |
| Required directories present | **6 of 13** |
| Required directories absent | **7 of 13** |

The seven missing paths, all of which exist in the working tree only as untracked `README.md` files:

```
apps/simulator/README.md
apps/classroom/README.md
packages/ui/README.md
packages/core/README.md
packages/curriculum/README.md
packages/diagnostics/README.md
supabase/functions/README.md
```

**So: a clean checkout of `HEAD` does not pass `validate:foundation`, and this local worktree's passing result
must not be cited as proof that it does.** These seven files, plus
`infrastructure/c3/build/README.md` (needed for that package to exist at all in a clone), are the minimum set a
reviewed commit must include. That commit is not authorised in this milestone, and B5 stays open.

Note the mismatch in provenance: C3-R25 attributed the failure to "7 of 13 required paths missing from a fresh
worktree" and C3-R32 called them "tracked placeholders". They are neither tracked nor, in the parent worktree,
present. The count 7 matches; the word "tracked" was wrong and is corrected here.

## 8. Regression — exact exit codes

Run sequentially from `F:\autolearnpro-c3-r25-integration`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | **0** | added 31 packages, audited 34, 0 vulnerabilities |
| `npm run validate:foundation` | **0** | `Foundation 1 validated: 13 directories…` |
| `npm run test:runtime` | **0** | 3 pass / 0 fail / 0 skipped |
| `node --test "tests/c3-*.test.mjs"` | **0** | **130 tests · 126 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 82ms` |

C3 totals moved from 118 tests (C3-R34) to **130** because this milestone adds 12. The four skips are the same
host-capability symlink cases as before; none is new and no test file was modified to produce them.

### One transient failure, disclosed rather than buried

In an intermediate run I batched `npm ci` and the test suites as parallel command strings. `npm ci` deletes
`node_modules` while reinstalling, so a test run racing it failed (`test:runtime` exited 1 once). Re-running the
same gate **sequentially** — the run recorded above — returns exit 0 for every command. The failure was an
artefact of how I invoked the commands, not a repository defect; it is recorded because a reviewer comparing raw
logs would otherwise find an unexplained exit 1.

## 9. Changed-file inventory and fingerprints

### Created — 3 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/build-input-contract.mjs` | 16,814 | `8fc0b8ccfb7df46fdc60cfbb3da34d608dcbb212b8f6bcf435100ecb2ad3edf8` |
| `tests/c3-build-input-contract.test.mjs` | 23,819 | `f6dd6c8e6034289521ba690f623fe81fecbec111b3e15dd62a705bba858ad190` |
| `docs/c3-r35/C3-R35-BUILD-INPUT-CONTRACT.md` | this file | reported with the handoff, not inside itself |

### Modified — 1 file

| Path | Before → after | Change |
| --- | --- | --- |
| `docs/c3-r32/C3-R32-CATALOG-WORKER-ARCHITECTURE.md` | `6ddd697b128cc35f…` → `a66678a53d0f6ffc…` (19,237 B) | §12 appended; Sections 1–11 unmodified |

### Unchanged — verified by fingerprint

| Path | SHA-256 | Note |
| --- | --- | --- |
| `package.json` (root) | `ac8d0bec1e87459b…` | **no manifest change**, as required |
| `package-lock.json` (root) | `f805b6f77f392467…` | **no lockfile change**, as required |
| `infrastructure/c3/build/package.json` | `b33b1db8bb9ac557…` | R30 toolchain untouched |
| `infrastructure/c3/build/package-lock.json` | `aee38b5df3b732c9…` | R30 toolchain untouched |
| `infrastructure/cloudflare/worker.mjs` | `261732ecb9accae4…` | Worker source of truth, untouched |
| `infrastructure/cloudflare/wrangler.jsonc` | `df6486888a42317d…` | untouched |
| `apps/catalog/*` (4 files) | unchanged | match the C3-R34 record exactly |
| `tests/c3-catalog-skeleton.test.mjs` | `c424e12b5fc2853b…` | C3-R34 suite untouched |
| `docs/c3-r33`, `docs/c3-r34` | `47ff1344…`, `856d9714…` | unchanged |
| `infrastructure/c3/build/build-root-guard.mjs` | `40d856d5941f9a18…` | R30 guard untouched — extended, not edited |

Nothing under `apps/`, `src/`, `specs/`, `engineering/`, `supabase/`, `infrastructure/c3/library/`, `.github/`
or `infrastructure/cloudflare/` was created, modified or deleted.

## 10. Final Git state and remaining blockers for C3-R36

| Item | Value |
| --- | --- |
| HEAD (integration) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` — unchanged |
| HEAD (parent) | `ea67a03`, 30 / 39 entries — untouched |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **27** default / **54** `--untracked-files=all` (was 25 / 51) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, parent-repo changes | **none** |

### Blockers for C3-R36

| # | Blocker | Why it matters for R36 |
| --- | --- | --- |
| **B5** | **Still open.** 7 scaffold READMEs plus `infrastructure/c3/build/README.md` are untracked; a clean checkout of `HEAD` fails `validate:foundation` with exit 1 (§7). | Any CI job R36+ proposes inherits this. Fixing it needs a reviewed commit, which is not authorised. |
| **B6** | Windows-only evidence. The new suite's junction cases ran here; they have never run on Linux. | R31's symlink case and this milestone's link cases need a Linux run before being called verified. |
| **B7** | No browser-level verification exists in this repository (no Playwright, no axe-core). | The catalog's accessibility remains asserted by construction only. |
| **B8** | `three@0.180.0` is declared and imported by nothing. | Unchanged from R34; the mapping digests `src/` only, so the dependency stays a contract, not a capability. |
| **B9** | **New.** The mapping is validated but nothing consumes it: R22's `sourceSnapshot` still takes one root. | R36 must decide whether the snapshot becomes per-root digests plus a combined digest, or a single manifest of `(role, path, sha256)` rows. |
| **B10** | **New.** `lib/assets` is absent, and `R22_CORRESPONDENCE` records it as deliberately absent rather than silently empty. | R36 must decide whether R22-shaped evidence is legal with a declared-absent input, or whether that gate blocks evidence entirely. |
| **B11** | **New.** Bundling feasibility is unproven: nothing shows `worker.mjs` bundles cleanly under any esbuild platform/format combination, and the Worker digest is not yet part of any evidence record. | That is precisely what R36's `buildOfflineEvidence` port has to establish — without deploying. |

## 11. Acceptance criteria

- [x] C3-R34 record hash verified before any write; no unexplained baseline drift (§2).
- [x] B1 documented; the reviewer's invariant adopted verbatim; the four now-inaccurate R32 lines identified by line number.
- [x] No dependency moved and no lockfile rewritten — both fingerprints identical to C3-R34.
- [x] Build-input contract implemented with four explicit roots and nine declared inputs, with no path inferred.
- [x] Traversal, symlinks, nested/identical/mislabelled roots, missing inputs and unapproved destinations all refused, in a documented order.
- [x] R28/R30 authorisation contracts reused; no parallel policy invented.
- [x] Worker source of truth preserved byte-for-byte; capability rules enforced by test; `wrangler.jsonc` unmodified.
- [x] Worker boundary analysis covers how a future bundle and future generated data may proceed without privileged Node code.
- [x] 12 focused tests pass, and 5 mutation probes prove they can fail.
- [x] B5 measured against a real clean checkout of `HEAD` (exit 1, 7 of 13 required paths absent), with the exact files listed.
- [x] No R22 orchestration ported, no bundler run against the Worker, no build evidence claimed.
- [x] Every regression command captured with its exit code, including a disclosed transient failure.
- [x] No commits, pushes, merges, PRs, workflow activation, deployment, Supabase, R2, Docker or parent-repo changes.

**Status: CONTRACT DEFINED AND VALIDATED · LOCAL VERIFICATION PASSED · AWAITING INDEPENDENT REVIEW.**
B1 and B2 resolved; B5 open. KCOE8006 FITMENT HOLD remains in force; GitHub and production remain on HOLD.





