# C3-R36F — Linux Verification and Portability Audit

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Linux target: `ubuntu-server` (`172.29.133.229`)

**Local + isolated-Linux validation only. No production change, no commit, no deployment. KCOE8006 FITMENT HOLD
remains active; GitHub and production remain on HOLD.**

## 0. Three findings that change the shape of this milestone

Read these before the tables, because two of them contradict the authorization's premises.

| # | Finding | Consequence |
| --- | --- | --- |
| **F-1** | **`ubuntu-server` is running Node `v24.22.2`, not `v22.23.4`.** No Node 22 exists anywhere on the host: `which -a node` returns only `/usr/local/bin/node`, there is no nvm tree, no `nodejs` apt package, no `/opt` runtime. | **The authorized "explicit Node.js 22" gate was NOT executed.** Every Linux run below is Node 24 and is labelled exploratory. Installing a Node runtime was not authorized. |
| **F-2** | **The R36E manifest never contained the R35 test file.** `tests/c3-build-input-contract.test.mjs` is absent from all 28 records, so that suite could not run on Linux at all — its log says `Could not find 'tests/c3-build-input-contract.test.mjs'`. | A defect in the R36E package, discovered by using it. It is not a claim about the R35 contract. |
| **F-3** | **The package is not self-contained for the R35–R36E suites.** Those suites test the real application inputs, and the manifest approves no application files (`apps/catalog`, `infrastructure/cloudflare`, root manifests). | They fail closed on `R35_ROOT_UNAVAILABLE:catalog`. This is the "could not run because the package lacks required inputs" category, not a pass and not a contract failure. |

What *did* work is substantial: **96 tests across five suites, 0 failures, 0 skips, including all four symlink cases
that Windows skips.**

## 1. Phase A — source integrity (local)

| Check | Result |
| --- | --- |
| Manifest parses | `alp-c3-r36e-linux-manifest-v1`, `executed: false` |
| Record count | **28** — as required |
| SHA-256 recomputation | **28 matched, 0 altered, 0 missing** |
| Unlisted files under `infrastructure/c3` (excluding `node_modules`) | **0** |
| Manifest fingerprint (preserved, unmodified) | `931c6f1df39726b03b3bc71dcf4850f62300025c5244808ac9f0cda639b17eb7` |
| Verification record written | `docs/c3-r36f/C3-R36F-MANIFEST-VERIFICATION.json` (per-file expected/actual/match) |

The original manifest is untouched; the verification results are preserved beside this record and inside it.

## 2. Phase B — Linux transfer

`ubuntu-server` did not resolve by name from this shell (`Could not resolve hostname ubuntu-server`), and there is no
`~/.ssh/config` entry or `/etc/hosts` line for it. The host is reachable at **`172.29.133.229`**, which is present in
the user's own `known_hosts`; `hostname` on that host returns `ubuntu-server`, and its own `hostname -I` lists
`172.29.133.229 172.17.0.1`.

| Step | Result |
| --- | --- |
| Isolated workspace | `~/c3r36f-20261104` — created new, nothing else touched |
| Transport | one tarball + one `SHA256SUMS`, both generated from the 28 manifest records only |
| Tarball | 78,073 B, SHA-256 `f8db4c6a42db21f67aed96b926f635121bb170a97dcde647558db9cd1471ff1d` |
| Tarball re-hash on Linux | **identical** — `f8db4c6a…` |
| Per-file verification on Linux | `sha256sum -c SHA256SUMS --quiet` → **exit 0** (silent = all matched) |
| Files in workspace after extraction | **30** = 28 sources + tarball + checksum file |
| Windows `node_modules` transferred | **no** |
| `.env`, credentials, production config, unrelated files | **none** |
| Dependency install | `cd infrastructure/c3/build && npm ci --ignore-scripts` → **exit 0**, `esbuild 0.28.2` resolved |

That install is worth noting on its own: **R30's standalone-toolchain claim now holds on Linux**. The workspace has
no root `package.json` at all, and `npm ci` still resolved `vite 7.3.7` / `esbuild 0.28.2` from the isolated lockfile.
R30 §9 listed "Windows-only evidence" as a limitation; the install half of it is now verified on Linux.

## 3. Phase C — execution, with the four categories kept separate

All runs below used `node v24.22.2` — **exploratory, not the authorized Node 22 gate** (F-1).

### Ran and passed — 96 tests, 0 failed, 0 skipped

| Suite | Tests | Pass | Fail | Skip | Exit |
| --- | --- | --- | --- | --- | --- |
| `c3-recovery` (R26) | 39 | **39** | 0 | **0** | 0 |
| `c3-library-reader` (R27) | 15 | **15** | 0 | **0** | 0 |
| `c3-library-generation` (R28) | 13 | **13** | 0 | **0** | 0 |
| `c3-build-provenance` (R29) | 15 | **15** | 0 | **0** | 0 |
| `c3-offline-evidence` (R31) | 14 | **14** | 0 | **0** | 0 |
| **Total** | **96** | **96** | **0** | **0** | **0** |

**The four cases Windows skips all execute and pass here** — this is the substantive B6 result:

```
c3-offline-evidence.log   :: ✔ 13. symlinked artifacts are refused (3.96ms)
c3-library-reader.log     :: ✔ 11. symlink target is refused (skips only when the host cannot create symlinks) (0.62ms)
c3-library-generation.log :: ✔ 8b. symlinked generation manifest is refused (2.70ms)
c3-recovery.log           :: ✔ symlink destination is refused (0.60ms)
```

R27's case keeps its "skips only when the host cannot create symlinks" wording and did **not** skip; R26's journal
symlink case ran for the first time anywhere. All four are the exact cases the Windows runs report as `# SKIP`.


### Could not run — package lacks the inputs (F-2, F-3)

| Suite | Exit | Reason |
| --- | --- | --- |
| `c3-build-input-contract` (R35) | 1 | `Could not find 'tests/c3-build-input-contract.test.mjs'` — **the test file is not in the manifest** |
| `c3-multi-root-snapshot` (R36A) | 1 | 15 fail — `R35_ROOT_UNAVAILABLE:catalog` (no `apps/catalog`) |
| `c3-worker-bundle-feasibility` (R36B) | 1 | 13 fail — `R35_ROOT_UNAVAILABLE:catalog` |
| `c3-offline-evidence-persistence` (R36C) | 1 | 1 pass / 17 fail — `R35_ROOT_UNAVAILABLE:catalog` |
| `c3-evidence-rehearsal` (R36D) | 1 | 1 fail — `R35_ROOT_UNAVAILABLE:catalog` |
| `c3-process-boundary` (R36E) | 1 | 2 pass / 17 fail — `R35_ROOT_UNAVAILABLE:catalog` |

None of these is a contract failure. Each one is the mapping gate correctly refusing a tree that has no application
inputs, and each would need a wider, separately-approved manifest to be meaningful.

### Skipped / failed / could not run — summary

| Category | Count |
| --- | --- |
| Ran and passed | **96** |
| Ran and failed | **0** |
| Skipped (platform capability) | **0** |
| Could not run (missing package inputs) | **6 suites** |

No case was counted as a pass for a skip or a non-run.

## 4. Phase D — cross-platform comparison

| # | Item | Windows | Linux | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Source-snapshot digest | `58d5eccc1babe486…` | **not comparable** | the package contains no application inputs, so no snapshot can be taken on Linux (F-3) |
| 2 | Worker bundle digest | `a955e25fbb32a6cd…` (579 B) | **not produced** | same reason; the bundler is installed but has no Worker to bundle |
| 3 | Evidence-envelope digest | `f03921ace88f8f6c…` | **not produced** | same reason |
| 4 | Persisted evidence-file digest | `1f46a2570f91d44c…` (1,231 B) | **not produced** | same reason |
| 5 | Artifact byte count | 579 | **not produced** | same reason |
| 6 | Process exit codes | 0 / 1 per case | **0** for all five runnable suites; **1** for all six un-runnable ones | compared; the Linux failures are input-absence, not behaviour |
| 7 | Filesystem containment | traversal and realpath cases pass | **pass** — same cases, same refusals, on ext4 | **matches** |
| 8 | Symlink refusal | **skipped** (no file symlinks without elevation) | **passes, 4 of 4 cases** | **expected difference, resolved in Linux's favour** |
| 9 | Durability reporting | `file fsync only (directory fsync unsupported on this platform)` | **not exercised** | the envelope path needs application inputs; the POSIX branch remains untested |

**Expected differences:** item 8 — Windows cannot create file symlinks without elevation, so it skips; Linux creates
them and the refusals fire. That is a capability difference, not a divergence in behaviour.

**Unexpected differences:** none observed in the areas that ran. Items 1–5 and 9 are **gaps, not matches**: the
approved package cannot produce them on Linux, and reporting them as "identical" would be a fabrication. A wider
manifest (F-3) is the prerequisite.

Digest agreement across platforms would in any case be a statement about input bytes and a pinned toolchain, **not**
about Git provenance, CI identity or release authority. Nothing here establishes those.

## 5. Phase E — confinement, footprint, cleanup

| Check | Result |
| --- | --- |
| Writes on Linux confined to `~/c3r36f-20261104` | **yes** — the only other write is the `npm ci` inside `infrastructure/c3/build/node_modules` in that same workspace |
| Workspace size | **23 MB** (22 MB of it the isolated `node_modules`) |
| Pre-existing user files | **none touched** |
| Windows parent repository | **unmodified** (§7) |
| Logs and reports preserved | all 11 suite logs + `EXITCODES.txt` copied back to `docs/c3-r36f/logs/` |
| Removal, if the reviewer wants the footprint gone | `rm -rf ~/c3r36f-20261104` — **not run by me**, so the evidence stays inspectable |

## 6. B6 and B13 dispositions

| Blocker | Before | Now | Why not closed |
| --- | --- | --- | --- |
| **B6** — Linux verification | Open | **Partially closed** | The four symlink cases and 96 tests pass on Linux with zero skips, and R30's isolated install is verified on Linux. **Still open** because (i) the Node 22 gate was not executed (F-1), and (ii) the R35–R36E link/junction cases could not run (F-2, F-3), so those cases remain Windows-only. |
| **B13** — cross-machine | Addressed for processes on one machine | **Unchanged, narrowed** | Linux proves the code runs on a second filesystem, but not that evidence produced on one machine verifies on another: the digest comparison that would show it (Phase D items 1–5) was not producible. |

Two new entries:

| # | Blocker | Note |
| --- | --- | --- |
| **B15** | Linux Node runtime mismatch | The host has only `v24.22.2`. The C3 toolchain declares `>=22.12 <23`, so **the authorized Node 22 validation cannot be run there until a 22.x runtime is installed**. Installing one is a decision for the reviewer, not a side effect of this milestone. |
| **B16** | Manifest incompleteness | `C3-R36E-LINUX-MANIFEST.json` omits `tests/c3-build-input-contract.test.mjs` and all application inputs. Any future transfer package needs a v2 manifest; the v1 record stays untouched at its verified fingerprint. |

## 7. Windows regression (unchanged by this milestone)

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | 213 tests · 209 pass · 0 fail · 4 skipped |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass / 0 fail |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files |

The four Windows skips are exactly the four cases that pass on Linux — which is now demonstrated rather than assumed.

## 8. Artifact fingerprints and changed-file inventory

### Created — 14 files (1 record, 1 verification record, 12 log files)

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `docs/c3-r36f/C3-R36F-LINUX-VALIDATION.md` | this file | reported with the handoff, not inside itself |
| `docs/c3-r36f/C3-R36F-MANIFEST-VERIFICATION.json` | Phase A record | `7ff6e38c8cddaa21a33b9e28fde03f2a905a58400ea1d34aa944f936ab1922b9` |
| `docs/c3-r36f/logs/EXITCODES.txt` | 333 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-recovery.log` | 2,952 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-library-reader.log` | 1,248 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-library-generation.log` | 1,112 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-build-provenance.log` | 1,282 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-offline-evidence.log` | 1,072 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-build-input-contract.log` | 56 | the `Could not find` record of F-2 |
| `docs/c3-r36f/logs/c3-multi-root-snapshot.log` | 17,524 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-worker-bundle-feasibility.log` | 15,126 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-offline-evidence-persistence.log` | 19,550 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-evidence-rehearsal.log` | 17,277 | retrieved from Linux |
| `docs/c3-r36f/logs/c3-process-boundary.log` | 16,994 | retrieved from Linux |

### Modified — none

No existing file was edited. Verified unchanged: the R36E manifest (`931c6f1d…`, still `executed: false`), both CLIs
(`d1155d89…`, `d9d14620…`), the R36E tests and fixture (`e45e9b33…`, `2fcc9af8…`), every R35–R36D module, the Worker
and `wrangler.jsonc` (`261732ec…`, `df648688…`), the R30 toolchain manifest and lockfile (`b33b1db8…`,
`aee38b5d…`), all four `apps/catalog` sources, both root manifests (`ac8d0bec…`, `f805b6f7…`), and every C3 suite.

### Linux-side state left behind (deliberate, documented)

`~/c3r36f-20261104` — 23 MB, containing the 28 verified sources, 11 logs, the transferred payload and the isolated
`node_modules` from the authorised `npm ci`. No pre-existing user file was touched, and nothing outside that
directory was written.

## 9. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **39** default / **75** `--untracked-files=all` (was 38 / 72 before this milestone) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, production infrastructure | **none touched** |
| KCOE8006 | FITMENT HOLD untouched |

## 10. Acceptance criteria

- [x] R36E fingerprints verified; manifest parsed; **28 records confirmed**; every file re-hashed (**28/28**); no missing, added, altered or unlisted file; original manifest and results preserved (§1).
- [x] Isolated Linux workspace created; only manifest-approved files transferred; **no** Windows `node_modules`, `.env`, credentials or unrelated files (§2).
- [x] Every transferred file verified on Linux with `sha256sum -c` → **exit 0**, plus an independent tarball hash match (§2).
- [x] Dependencies installed only from the reviewed lockfile (`npm ci --ignore-scripts`, exit 0) (§2).
- [x] R31 symlink case executed on Linux and passed; the other three previously-skipped symlink cases executed and passed; **96 tests, 0 fail, 0 skip** (§3).
- [x] Passed / failed / skipped / could-not-run kept explicitly separate, with no skip or non-run counted as a pass (§3).
- [x] Cross-platform comparison covers all nine requested items, with gaps named as gaps rather than reported as matches (§4).
- [x] Operations confined to the authorized Linux workspace; logs and reports preserved; no pre-existing file modified; nothing deleted (§5).
- [x] Windows regression re-run at this state: all five commands exit 0 (§7).
- [x] No R22 port, no deployment, no commit/push/merge/PR/workflow, no Cloudflare/Supabase/R2/Docker change, KCOE8006 untouched (§9).

**Status: LINUX VALIDATION EXECUTED FOR FIVE SUITES · AUTHORIZED NODE-22 GATE NOT EXECUTED · AWAITING
INDEPENDENT REVIEW.** B6 is partially closed: the symlink gap is real and now demonstrated on Linux, but the Node 22
requirement (F-1 / B15) and the manifest's missing inputs (F-2 / F-3 / B16) keep it open. KCOE8006 FITMENT HOLD,
GitHub and production remain on HOLD.



