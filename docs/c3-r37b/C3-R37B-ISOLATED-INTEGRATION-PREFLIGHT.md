# C3-R37B — Isolated Integration Candidate and Clean-Clone Preflight

**Milestone:** C3-R37B — isolated candidate construction and clean-clone validation
**Authoritative workspace:** `F:\autolearnpro-c3-r25-integration` — **nothing staged, nothing committed, no file changed**
**Candidate location:** `F:\c3r37b-candidate-<id>` (disposable, created by this milestone)
**Date:** 2026-11-04
**Status:** preflight complete · awaiting independent review

## 1. Headline

A disposable Git commit containing the C3 integration set **reproduces the reviewed source bytes, installs, passes
every C3 suite, and builds the catalog identically — on Windows and on Linux.**

| Fact | Value |
| --- | --- |
| Candidate commit | **`7d51b67f23e03fb6ebcabdbaa9aed0164e9d2a34`** |
| Candidate tree | `ec33d0acdabfd5f2c9a969e0fa4482678f0baf02` |
| Parent | `ea67a032d94bf283ab458c45bc622e75f1a219f1` (the authoritative HEAD) |
| Tracked files in candidate | **184** (68 at HEAD + 116 additions) |
| Staged changes | **121** = 116 additions + 5 modifications |
| Blobs byte-identical to source | **116 of 116** |
| Clones reproducing the reviewed bytes | **2 of 2** (`core.autocrlf=true` and `false`) |
| Windows clean clone | foundation 0 · runtime 0 · **213 tests, 209 pass, 0 fail, 4 skip** · catalog build 0 |
| Linux clean clone (Node 22.23.4) | foundation 0 · runtime 0 · **213 tests, 213 pass, 0 fail, 0 skip** · catalog build 0 |
| Catalog build digests | `index.html` `ce46c185…`, `catalog-Bj3CNR8H.js` `47eff84e…` — **identical on both platforms and identical to C3-R34** |
| `verify-review.mjs` | **fails on both platforms** — see §7, and it is not the candidate's fault |

The candidate commit is deterministic: two independent builds produced the same hash, because both `GIT_AUTHOR_DATE`
and `GIT_COMMITTER_DATE` are pinned.

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| Authoritative HEAD | `ea67a03` |
| Status | 46 default / 128 individual, **0 staged** |
| Seven C3-R37.1 artefacts | all match their recorded digests (§9) |
| Parent worktree | `ea67a03`, 30 default entries, untouched |
| R37A inventory | 121 rows + 7 milestone additions |
| Source drift | none observed |

## 3. Phase B — the candidate, and four count changes that must be documented

Built by `docs/c3-r37b/tools/build-candidate.mjs`, which clones HEAD into a disposable directory, copies the inventory,
applies the policy, commits, then clones twice.

| Item | Count |
| --- | --- |
| Inventory rows copied (action `add`) | 104 |
| Inventory rows copied (action `modify`) | 2 — `.gitignore`, `package-lock.json` |
| C3-R37A milestone additions | 7 |
| `.gitattributes` (candidate-only, new) | 1 |
| **Reviewed logs invisible to `git status`** | **4** |
| **Total additions** | **116** |
| **Total modifications** | **5** — `.gitignore`, `package-lock.json`, and 3 rewritten representations |
| Excluded, per the retention decision | 15 |

### 3.1 Why 5 modifications rather than 2

Applying `-text` to files that already exist at HEAD **rewrites their representation**. HEAD stores LF blobs under
`core.autocrlf=true`; with `-text` the candidate stores the CRLF worktree bytes. `git status` after `git add -A`:

```
M .gitignore
M infrastructure/cloudflare/worker.mjs
M infrastructure/cloudflare/wrangler.jsonc
M package-lock.json
M package.json
```

This is the exact consequence your review warned about — *"adding `.gitattributes` does not automatically rewrite
historical Git blobs"* — confirmed by measurement rather than assumed. It is intended: it is the only way the recorded
`261732ec…`/`ac8d0bec…`/`df648688…` fingerprints can survive a clone. **A reviewer must accept that the integration
commit changes those three blobs' bytes without changing their content.**

### 3.2 The four logs were never in the inventory — finding F-9

The C3-R37A retention decision protects four console captures under `docs/c3-r36h3/logs/`. The first candidate clone
arrived **without them**, and the reason is structural:

```
.gitignore:10:*.log    docs/c3-r36h3/logs/*.log
```

`git status --untracked-files=all` cannot report an ignored file, so an inventory derived from Git **cannot see
reviewed evidence that Git is ignoring**. The R37A manifest was therefore correct about every row it had, and
incomplete about the evidence it was asked to protect.

The candidate fixes this explicitly — the four paths are named in `REVIEWED_IGNORED`, copied by name, hashed, and
carried by a scoped negation (`!docs/c3-r36h3/logs/*.log`) rather than by un-ignoring logs generally. Verified:
`31a77c23…` on Linux equals the hash recorded in the C3-R36H.3 record.

**This is a defect in the inventory method, not in the file list, and it is recorded as B30.**

## 4. Phase C — Git byte-representation test

Two properties were tested separately, because conflating them is what hid the scaffold gap in the first run:

- **A. blobIsVerbatim** — the staged blob equals the file's bytes, i.e. `-text` actually applied (`git cat-file blob
  :path`, hashed).
- **B. cloneReproducesReviewed** — the checked-out file equals the SHA-256 recorded in the inventory.

| Measurement | Result |
| --- | --- |
| Evidence-sensitive files checked | 116 |
| Blobs verbatim (A) | **116 / 116** |
| `clone-autocrlf=true` reproducing reviewed bytes (B) | **116 / 116** |
| `clone-autocrlf=false` reproducing reviewed bytes (B) | **116 / 116** |
| `node_modules` in either clone | absent |
| `apps/catalog/dist` in either clone | absent |
| Unrelated files converted | none — the policy is scoped and root-anchored |

### 4.1 The policy needed one correction, found by measurement

The first candidate used the approved rule list verbatim and **failed**: the seven scaffold READMEs
(`apps/classroom`, `apps/simulator`, `packages/{ui,core,curriculum,diagnostics}`, `supabase/functions`) were not covered,
so they were LF-normalised into the blob. On Windows that was invisible (autocrlf restored CRLF); with
`core.autocrlf=false` the clone produced LF and **could not reproduce the reviewed bytes**.

The candidate therefore adds four scaffold rules — the "expanded to cover every byte-sensitive file" decision you made,
where the approved list was one category short. Policy as applied:

```
infrastructure/c3/**                      -text
tests/c3-*.test.mjs                       -text
tests/fixtures/**                         -text
docs/c3-r2*/**                            -text
docs/c3-r3*/**                            -text
apps/catalog/**                           -text
/apps/classroom/**                        -text
/apps/simulator/**                        -text
/packages/**                              -text
/supabase/functions/**                    -text
/infrastructure/cloudflare/worker.mjs     -text
/infrastructure/cloudflare/wrangler.jsonc -text
/package.json                             -text
/package-lock.json                        -text
```

### 4.2 Cross-platform byte proof

The same files, checked out on Linux from the candidate commit:

```
261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e  infrastructure/cloudflare/worker.mjs
ac8d0bec1e87459b7c779eca70f9ff0c7b021ecf0855f2d576ed09c9b9bfb4ad  package.json
a1d340cc27c4edfc4c16715ee498884eb910f47f85880fe8f0278bb0fb9d612a0  apps/catalog/index.html
0504de53bb147e6dc73b3a3899288e4570d561f374775fecd68918f6f7aa5425  docs/c3-r37a/C3-R37A-FILE-INVENTORY.json
31a77c23b9ffe460fcefc9e9c667da69a131ca186a9ec07f706be2b187d27c33  docs/c3-r36h3/logs/b23-trials-prefix.log
```

`od -An -c` on `package.json` shows `\r\n` on Linux. Every hash equals its reviewed Windows value. **This is the first
time a reviewed C3 fingerprint has been reproduced from a Git clone on a different operating system** — which is what
B28 was about.


## 5. Phase D — Windows clean clone

`clone-autocrlf-true`, `git status` empty, HEAD `7d51b67f`, Node v22.23.1 / npm 10.9.8.

| Step | Exit | Result |
| --- | --- | --- |
| `npm ci --ignore-scripts` (root) | **0** | 31 packages, 0 vulnerabilities |
| `npm ci --ignore-scripts` (`infrastructure/c3/build`) | **0** | esbuild **0.28.2** |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 tests, 3 pass |
| `node --test "tests/c3-*.test.mjs"` | **0** | **213 tests · 209 pass · 0 fail · 4 skip** |
| `node docs/c3-r25/verify-review.mjs` | **1** | 13/14 — §7 |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 4.48 kB + 1.23 kB |

### 5.1 One install the root lockfile does not perform — finding F-10

The first clean clone failed `c3-evidence-rehearsal`, `c3-offline-evidence-persistence` and `c3-process-boundary`
outright, and 52 tests never ran, with:

```
ENOENT: infrastructure/c3/build/node_modules/esbuild/package.json
```

The isolated toolchain is a **separate package with its own lockfile**, so the root `npm ci` never installs it. The
documented validation sequence needs **two** installs. With the second, every suite is green and `git status` stays
empty because `node_modules/` is ignored at any depth.

This was invisible until a genuine clean clone was tried — every earlier run happened in a worktree where the toolchain
was already present.

## 6. Phase E — Linux clean clone, real Git metadata

Not a transferred tarball: `git bundle create` → `scp` → `git clone` on `ubuntu-server`.

| Check | Value |
| --- | --- |
| Bundle digest | `a6958c7f7f6312f0dd35a12f6858429488f04aa818c5206fa41103662c41613b`, identical both ends |
| Clone HEAD | `7d51b67f23e03fb6ebcabdbaa9aed0164e9d2a34` — **same commit as Windows** |
| Parent / tree | `ea67a03…` / `ec33d0ac…` |
| Tracked files | 184 |
| `git status` | clean |
| Logs present | 4 |
| Node / npm | v22.23.4 / 10.9.9 |

| Step | Exit | Result |
| --- | --- | --- |
| `npm ci --ignore-scripts` (root, **under node22**) | **0** | 31 packages |
| `npm ci --ignore-scripts` (toolchain) | **0** | esbuild 0.28.2 |
| `validate:foundation` | **0** | 13 directories |
| runtime tests | **0** | 3 tests, 3 pass |
| `node22 --test tests/c3-*.test.mjs` | **0** | **213 tests · 213 pass · 0 fail · 0 skip** |
| catalog build | **0** | 73 ms, `ce46c185…` + `47eff84e…` |
| `verify-review.mjs` | **1** | 9/13 — §7 |

Catalog digests are **byte-identical to Windows and to C3-R34**. Linux runs all 213 tests with **zero skips**; the four
Windows skips are the symlink-capability cases.

### 6.1 `npm22` does not select the Node runtime — finding F-11

`npm22 ci` failed with `EBADENGINE`: `~/.local/bin/npm22` symlinks npm's CLI, whose shebang is `#!/usr/bin/env node`,
resolving to the **system Node 24**. The root manifest's `engines: node ">=22.0.0 <23"` then refuses the install. It
works only when npm runs *under* the pinned runtime:

```
node22 /home/rod/.local/opt/node-v22.23.4-linux-x64/lib/node_modules/npm/bin/npm-cli.js ci
```

C3-R36G's "npm22 ci → exit 0" was the **isolated toolchain**, which has no `engines` field, so the mismatch went
unnoticed. Future instructions should name the invocation, not the alias.

## 7. Phase F — `verify-review.mjs` cannot pass on any integration commit

Both platforms fail, and neither failure is caused by the candidate. The verifier hard-codes authoring-workstation
facts:

| Check | What it requires | Windows clone | Linux clone |
| --- | --- | --- | --- |
| `expected-committed-base` | `HEAD === ea67a032…` | **FAIL** — HEAD is `7d51b67f` | **FAIL** |
| `isolated-integration-branch` | branch `integration/c3-r25-ci-readiness` | pass (clone of a branch tip) | **FAIL** — detached HEAD |
| `authoritative-origin` | remote URL `https://github.com/73junito/autolearnpro.git` | **FAIL** — origin is the local candidate; **passes when the URL is set** | **FAIL** |
| `staging-source-available-for-review` | `F:/autolearnpro-meshy-staging` exists | pass | **FAIL** — a Windows-only path |
| remaining checks | contracts, manifests, fingerprints | pass | pass |

Isolated results: **Windows 13/14** with only the base-commit pin failing (after correcting origin in the disposable
clone), **Linux 9/13** because the staging path and the branch are additionally absent. Note the Linux run reports 13
checks, not 14, because `staging-sources-match-review-fingerprints` only runs when the staging workspace exists — a
**conditional check that silently changes the denominator**.

`expected-committed-base` is the decisive one: it asserts HEAD *is* the pre-integration commit, so **the act of
integrating guarantees the verifier fails**. This is recorded as **B29** and it needs an explicit decision: either the
verifier gains an authorised post-integration base (a change to a reviewed artefact, requiring your approval), or the
integration milestone accepts that R25 verification is superseded by the C3 suites plus this preflight.

I did **not** modify the verifier.

## 8. What the candidate does not do

- It is **not** the authoritative repository: `F:\autolearnpro-c3-r25-integration` still has HEAD `ea67a03`, 0 staged,
  and exactly the same two modified tracked files as before this milestone.
- It is **not** published, pushed, merged, or referenced by any workflow.
- Its commit identity is synthetic (`C3 candidate <candidate@local>`, date `2026-11-04T00:00:00+0000`) and is **not**
  attributable to any person.
- Candidate test results are **candidate results**, not authoritative-HEAD results. Nothing here should be read as
  `ea67a03` passing anything.


## 9. Artefact fingerprints

| Artefact | SHA-256 |
| --- | --- |
| `docs/c3-r37b/tools/build-candidate.mjs` | `c315e6f05bb569292854790b614b91b024f441e4093ab5646b396eebc26ef1d6` |
| `C3-R37B-ISOLATED-INTEGRATION-PREFLIGHT.md` | reported in the handoff — this file cannot contain its own digest |
| Candidate commit | `7d51b67f23e03fb6ebcabdbaa9aed0164e9d2a34` |
| Candidate tree | `ec33d0acdabfd5f2c9a969e0fa4482678f0baf02` |
| Git bundle | `a6958c7f7f6312f0dd35a12f6858429488f04aa818c5206fa41103662c41613b` |
| Candidate `.gitignore` | `a9cd6ec6…` (inventory value `42e74886…` plus the scoped log negation) |

## 10. Blocker register

| ID | Blocker | Status after C3-R37B |
| --- | --- | --- |
| **B5** | Clean-checkout reproducibility | **Resolved *in the candidate*** — a clone installs, passes 213/213 (Linux) and builds identically. **Open for the authoritative repository**, which still has no integration commit. |
| **B13/B18** | Independent-checkout evidence | **Resolved *in the candidate*** — Linux ran from a real `git clone` of commit `7d51b67f`, not a tarball. Open for the authoritative commit. |
| **B28** | Tests attributable to a Git revision | **Resolved *in the candidate*** — both platforms report the same commit, tree and parent. |
| **B29** | *(new)* `verify-review.mjs` pins the pre-integration base commit, branch, origin URL and a Windows staging path | **Open** — guaranteed to fail on any integration commit; needs your decision (§7). |
| **B30** | *(new)* Git-derived inventory cannot see ignored evidence | **Open** — the 4 reviewed logs are outside the inventory; the candidate carries them explicitly. The R37A method needs amending. |
| F-10 | Root `npm ci` does not install the isolated toolchain | **Documented** — the validation sequence needs two installs. |
| F-11 | `npm22` alias does not pin the Node runtime | **Documented** — invoke npm under `node22`. |
| B14, B19, B20, B21, B23, B26, B27 | unchanged | **Open** — untouched by this milestone. |

## 11. Final authoritative Git state

| Item | Value |
| --- | --- |
| Integration HEAD | `ea67a03` — **unchanged** |
| Parent HEAD | `ea67a03`, 30 default entries — **unchanged** |
| Staged | **0** |
| Integration status | 46 default / 130 individual (128 before this milestone's two files) |
| Modified tracked | `.gitignore`, `package-lock.json` — pre-existing, untouched |
| Commits, pushes, merges, PRs, workflows, deployments | **none** |

## 12. What this milestone does not establish

It does not authorise the integration. The candidate is disposable, synthetic and unpushed; its tests are **candidate**
results and must never be reported as `ea67a03` results. It does not resolve B5/B13/B18/B28 for the authoritative
repository — only for a throwaway commit. It does not resolve B29, B30, F-10, F-11, B14, B19–B21, B23, B26 or B27.

Two of its own first attempts were wrong and are recorded rather than quietly repaired: the candidate lived under
`%TEMP%`, where the C3 policy cannot distinguish "temporary" from "inside a checkout that happens to sit in temp",
which flipped six expected refusals; and the approved `.gitattributes` list was one category short. Both were found by
running the thing.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

