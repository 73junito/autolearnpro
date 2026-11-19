# C3-R36B — Isolated Worker Bundle Feasibility

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local feasibility experiment only. `buildOfflineEvidence` is NOT ported, the Worker was not modified, nothing
was published or deployed, no manifest or lockfile changed, and no commit was made. KCOE8006 FITMENT HOLD
remains active.**

## 1. Outcome — B11 is answered: **yes, it bundles**

The unchanged `infrastructure/cloudflare/worker.mjs` bundles with the isolated `esbuild 0.28.2` pin into a
**579-byte, self-contained ESM module** with **zero inspection findings**, into an authorised temporary directory
only, **byte-identically across two clean builds**.

| Measurement | Value |
| --- | --- |
| Worker source | 613 B, SHA-256 `261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e` |
| Bundle output | **579 B**, SHA-256 `a955e25fbb32a6cd5677091ffe24db7a04355821ee76fd7aead547e6d234278a` |
| Toolchain | isolated `esbuild 0.28.2` from `infrastructure/c3/build/node_modules` (not the root install) |
| Inspection findings | **0** |
| Reproducible | **yes** — two independent runs, identical digest and byte count |
| Source modified | **no** — Worker and `wrangler.jsonc` verified unchanged before and after |
| Published / deployed / attested | **no** |

The bundle is not a byte-for-byte copy of the source: esbuild drops the leading comment and normalises quoting,
so 579 B < 613 B. The record carries **both** digests, so that difference is stated rather than surprising.

| Phase | Result |
| --- | --- |
| A — integrity gate | **no drift** — all ten fingerprints matched |
| B — configuration | **decided and recorded**, including why each setting exists |
| C — experiment | **ran**, under an R28 temporary policy, output confined |
| D — inspection | **valid ESM**, no Node builtins, no external specifiers, reproducible |
| E — tests | **13/13 pass**, 5/5 mutation probes caught |
| F — R36A relationship | **associable, not merged**; R36A format untouched |
| G — regression | **5 commands, all exit 0** |

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| `source-snapshot.mjs` (R36A) | `47656cf695608057…` — matches |
| `c3-multi-root-snapshot.test.mjs` | `7025534fc2faeee7…` — matches |
| `C3-R36A-MULTI-ROOT-SNAPSHOT.md` | `ecaaf5a16dd8473e…` — matches |
| `build-input-contract.mjs` (R35) | `8fc0b8ccfb7df46f…` — matches |
| R30 `package.json` / `package-lock.json` | `b33b1db8bb9ac557…` / `aee38b5df3b732c9…` — unchanged |
| Isolated toolchain installed | `esbuild 0.28.2`, `vite 7.3.7` inside `infrastructure/c3/build/node_modules` |
| `worker.mjs` / `wrangler.jsonc` | `261732ecb9accae4…` / `df6486888a42317d…` — unchanged |
| Integration HEAD / status | `ea67a03`, 29 default / 57 `--untracked-files=all`, **0 staged** |
| Parent worktree | `ea67a03`, 30 entries — untouched |
| Staging drift | **0/7** — R25 reviewer 14/14 PASS, exit 0 |

One operational note: two Phase A commands initially returned stale terminal content instead of their own output,
so I re-ran them individually rather than reading the stale buffer. No fingerprint above is from a stale read.

## 3. Phase B — the exact configuration, and why each setting exists

`BUNDLE_CONFIG_ID = 'alp-c3-r36b-worker-bundle-v1'`, `BUNDLE_FILE_NAME = 'worker.mjs'`.

| Setting | Value | Why it is needed |
| --- | --- | --- |
| `bundle` | `true` | A Worker cannot resolve bare specifiers at runtime; the artifact must be self-contained. |
| `format` | `'esm'` | The Workers module format, and what `export default { fetch }` requires. |
| `platform` | `'browser'` | **No Node builtin shims are supplied.** This is the fail-closed choice: if the Worker ever imports `node:fs`, esbuild errors here rather than quietly polyfilling a capability the Worker must not have. |
| `target` | `'es2022'` | The V8 range Workers provide. Pinned so a future esbuild default cannot silently move it. |
| `write` | `false` | Bytes are produced **in memory** first, so policy and containment are checked before anything reaches a filesystem. A failed build therefore cannot leave a partial artifact. |
| `metafile` | `true` | Records the resolved input set for inspection. Never treated as evidence. |
| `legalComments` / `charset` / `sourcemap` | `'none'` / `'utf8'` / `false` | Removes incidental variation, which is what makes two builds comparable byte-for-byte. |
| `mainFields` | `['browser','module','main']` | Explicit browser-first resolution, matching the Worker runtime's capabilities. |
| `conditions` | `['browser','import','default']` | The same, for exports-map resolution. |
| `external` | `[]` | Nothing may be left external: an external specifier would be unresolvable at runtime. |
| `absWorkingDir` | the **mapped** Worker root | Passed explicitly from the R35 mapping. The root is never inferred from this module's physical location — the exact defect R30 removed from R22. |
| `entryPoints` | the **mapped** `worker.mjs` | Taken from the validated mapping, after checking its digest equals the boundary's. |

Deliberately absent: no `minify` (the artifact must be inspectable by a human reviewer), no `define` (nothing may
be substituted in), no `inject`/`banner`/`footer` (nothing may be appended), no plugin array (no transform may
run), and no `loader` overrides.

## 4. Phase C — the experiment, against the ten required conditions

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Output inside a fresh disposable temporary directory | `mkdtempSync` under `os.tmpdir()`; each fixture removed in `t.after` |
| 2 | Nonempty output rejected | `R35_OUTPUT_NOT_EMPTY` (test 6), and the existing file is left untouched |
| 3 | Staging and production targets rejected | `R28_STAGING_NOT_AUTHORIZED`, `R28_PRODUCTION_NOT_AUTHORIZED` (test 5) |
| 4 | Original Worker preserved byte-for-byte | `261732ec…` before and after every build (test 10) |
| 5 | `wrangler.jsonc` unmodified | `df648688…` before and after (test 10) |
| 6 | No routes or API handlers added | Worker untouched; the harness cannot edit source |
| 7 | No generated library data imported | `lib/assets` remains an R36A exclusion; bundle contains no such reference |
| 8 | No database dependency | `pg` import refused by the boundary before esbuild runs (test 4) |
| 9 | No Cloudflare credentials or APIs | module contains no `fetch`, no HTTP client, no `api.cloudflare` (test 11) |
| 10 | Nothing published, deployed or uploaded | no such call exists; `artifactPublished`/`deployed` are `false` |

**If esbuild could not bundle the Worker, this milestone would report the failure rather than change the Worker.**
That path is exercised deliberately: test 9 injects a relative import the boundary permits but the resolver cannot
satisfy, and asserts `R36B_BUNDLE_FAILED` with an **empty output directory** afterwards.

## 5. Phase D — inspection and reproducibility

### Inspection (`inspectBundle`, static; the bundle is never executed)

| Check | Method | Result |
| --- | --- | --- |
| Valid ESM | top-level `export` present; `node --check` on the emitted `.mjs` (parses as ESM, does not run) | pass |
| No Node builtins | scans for `require(`, `from "node:`, `import("node:` | none |
| No CommonJS | `module.exports`, `__dirname`, `__filename` | none |
| No credentials | `process.env` | none |
| No privileged dependency | `apps/web`, `infrastructure/c3` | none |
| No external specifier | every remaining `from "…"` must be relative | none remain |
| Digest recomputed independently | SHA-256 over the on-disk bytes, compared to the record | equal |

`inspectBundle` was itself validated against six synthetic contaminated texts (a `require` call, a `node:` import,
a bare `pg` specifier, `process.env`, `__dirname`, and a non-ESM file) — it reported a finding for each. That
matters because a checker that finds nothing everywhere is indistinguishable from one that finds nothing.

### Reproducibility

```
run1 entry=261732ecb9accae4 output=a955e25fbb32a6cd5677091ffe24db7a04355821ee76fd7aead547e6d234278a bytes=579 findings=0
run2 entry=261732ecb9accae4 output=a955e25fbb32a6cd5677091ffe24db7a04355821ee76fd7aead547e6d234278a bytes=579 findings=0
IDENTICAL=true
```

Two separate temporary directories, two separate builds, identical bytes. No difference was normalised away,
because there was none to normalise.

### What this does not establish

That the Worker *runs*, that `/health` responds, that Cloudflare accepts the artifact, or that the bundle fits a
plan limit. **No runtime verification was performed**, and none is claimed.

## 6. Phase E — the security and regression tests

`tests/c3-worker-bundle-feasibility.test.mjs`. The positive cases bundle the **real** Worker; negative cases copy
the real inputs into a temporary tree and change exactly one thing.

| # | Required case | Result |
| --- | --- | --- |
| 1 | Valid build-input mapping | pass — real Worker bundles; entry digest equals the pinned `261732ec…`; all seven config assertions hold; `write:false` touches nothing |
| 2 | Deterministic Worker bundle | pass — two independent builds byte-identical; on-disk digest recomputed; `node --check` parses the output as ESM |
| 3 | Missing Worker input | pass — `R35_INPUT_MISSING:worker/worker.mjs`, output directory still empty |
| 4 | Changed Worker input hash | pass — a one-token edit moves the artifact digest; a bare `pg` import and a `node:fs` import are each refused before esbuild runs |
| 5 | Invalid temporary policy | pass — null, production, staging and a forged publication flag all refused |
| 6 | Nonempty output refusal | pass — the pre-existing file is neither deleted nor overwritten |
| 7 | Traversal and symlink/junction escape | pass — output outside the policy, a junction inside the Worker root, and cleanup outside the policy are all refused |
| 8 | Forbidden imports | pass — six synthetic contaminated texts each produce a finding; the real bundle produces none |
| 9 | Build failure without partial publication | pass — `R36B_BUNDLE_FAILED`, empty output directory, source left as written |
| 10 | Unchanged Worker and Wrangler source | pass — pinned before and after |
| 11 | No network or deployment activity | pass — no `fetch`/`http`/`https`/`net`/`child_process`/`spawn`/`exec` in the harness; publish/deploy claims false; a record cannot be edited into an attestation |
| 12 | Cleanup confined to owned disposable directories | pass — an unexpected occupant blocks cleanup entirely; only the harness's own file is removed |
| 13 | (added) R36A association | pass — a bundle can carry a snapshot's combined digest while the snapshot object gains no field |

### Mutation probes — the guards are not vacuous

| Probe | Weakened | Caught by |
| --- | --- | --- |
| M1 | cleanup's "unexpected occupant" refusal deleted | test **12** |
| M2 | `require(` removed from the inspection list | test **8** |
| M3 | the trusted-flag re-derivation deleted | test **11** |
| M4 | `if (write)` forced to `if (true)` | tests **1 and 4** |
| M5 | cleanup's policy-containment check deleted | test **7** |

Every probe restored **byte-identically** (`75528944152e61ce…` before and after the sequence).

## 7. Phase F — relationship to C3-R36A, and to B12

**A bundle can be associated with a multi-root snapshot, and it is not merged with one.**

`bundleWorker({ …, snapshot })` copies `{ schema, combinedSha256 }` onto the **bundle record**. The snapshot
itself gains no field, and test 13 asserts exactly that: the snapshot's key set and its JSON are identical before
and after a bundle references it. The R36A record format was **not** modified to make this experiment convenient.

What the association means, and what it does not:

| It does mean | It does not mean |
| --- | --- |
| these input bytes (snapshot) produced this artifact (bundle) | that a Git commit contains them |
| the pair can be re-derived and compared later | that a CI system ran, or who ran it |
| a changed input moves both digests | that anything was approved, signed or published |

**B12 stays deferred.** No offline-evidence file format was created, no evidence file was written, and no schema
for one was proposed here. R36's job — deciding whether a snapshot or bundle is persisted as JSON, and where —
is untouched.

The four trusted claim flags remain `false` in every record this milestone produces:
`sourceCommitVerified`, `ciAttested`, `publicationAuthorized`, `deployAllowed`. `assertFeasibilityRecord` refuses a
record in which any of them is `true`, and refuses an unknown `configId`.

## 8. Temporary-directory and cleanup assessment

| Question | Answer |
| --- | --- |
| Where does output go? | A directory the caller creates inside an R28 temporary-policy root, which itself must resolve inside `os.tmpdir()` |
| Is it removable? | Yes — `removeBundleOutput` deletes only `worker.mjs`, and refuses outright if the directory contains anything else |
| Does a failed build leave residue? | No — output is produced in memory and written with flag `wx` only after successful inspection (test 9) |
| Can it overwrite an existing artifact? | No — `wx` fails on an existing file, and the output directory must be empty |
| Does anything survive the test run? | No — every fixture is removed in `t.after`, including the junction cases |
| Is any build output produced inside the repository? | No — no `dist/`, no `bundle/`, nothing under `infrastructure/cloudflare/` |
| Does the experiment create a publishable target? | No — the temporary tier cannot express one, by construction in R28 |

## 9. Phase G — regression, exact exit codes

Run **sequentially**, in this order, from `F:\autolearnpro-c3-r25-integration`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm run validate:foundation` | **0** | `Foundation 1 validated: 13 directories…` |
| `npm run test:runtime` | **0** | 3 pass / 0 fail / 0 skipped |
| `node --test "tests/c3-*.test.mjs"` | **0** | **158 tests · 154 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 86ms` |

Dependency installation was **not** run: no manifest or lockfile changed, and it must never run concurrently with
tests. C3 totals moved from 145 tests (C3-R36A) to **158** because this milestone adds 13.

The four skips are the unchanged host-capability cases — library generation 8b, library reader 11, offline
evidence 13, and the journal symlink case — all Windows refusals of file symlinks without elevation. R26–R28
passed on Ubuntu with zero skips; **R31's and R35's link cases remain unverified on Linux (B6)**. This milestone
adds no skip: its link case uses a directory junction, which this host permits, and it ran.

## 10. B11 and B12 status

| Blocker | Status | Basis |
| --- | --- | --- |
| **B11 — actual Worker bundling** | **Resolved for feasibility** | The unchanged Worker bundles reproducibly with the pinned toolchain, into an authorised temporary directory, with zero inspection findings. **Not** resolved for deployment: nothing was run, deployed, attested or size-checked against Cloudflare limits. |
| **B12 — evidence-file format** | **Still deferred** | No format was created. §7 records only that a bundle can carry a snapshot's digest, not that either should be persisted yet. |

Remaining, unchanged: **B5** (untracked scaffolds — a clean checkout still fails `validate:foundation`), **B6**
(Linux link cases), **B7** (no browser harness), and the deployment questions B11 deliberately left open.

## 11. Artifact fingerprints and changed-file inventory

### Created — 3 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/worker-bundle.mjs` | 11,103 | `75528944152e61cec1424f0558da4b658752cac7137ce1ccc6615f735947da2d` |
| `tests/c3-worker-bundle-feasibility.test.mjs` | 18,169 | `c92f6a9e1228e14a8b98adb0a0840d1663ab1a9fadc063fc539594861400d653` |
| `docs/c3-r36b/C3-R36B-WORKER-BUNDLE-FEASIBILITY.md` | this file | reported with the handoff, not inside itself |

### Build artifacts (ephemeral, not committed, not evidence)

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| bundled Worker (`worker.mjs`, temporary directory only) | 579 | `a955e25fbb32a6cd5677091ffe24db7a04355821ee76fd7aead547e6d234278a` |

### Modified — none

No existing file was edited. Verified unchanged: `worker.mjs` (`261732ec…`), `wrangler.jsonc` (`df648688…`),
`build-input-contract.mjs` (`8fc0b8cc…`), `source-snapshot.mjs` (`47656cf6…`), `build-root-guard.mjs`
(`40d856d5…`), `target-policy.mjs`, R30 `package.json` / `package-lock.json` (`b33b1db8…` / `aee38b5d…`), all
four `apps/catalog` sources, root `package.json` (`ac8d0bec…`), root `package-lock.json` (`f805b6f7…`) and the
R35/R36A test suites.

### Dependency and manifest state

No dependency installed, added or removed; no lockfile written; the isolated toolchain resolved `esbuild 0.28.2`
from its own `node_modules`, not the root install; R28 temporary-tier restrictions unchanged.

## 12. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **31** default / **60** `--untracked-files=all` (was 29 / 57) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare settings, Supabase, R2, Docker, parent repo, TorqueMind systems | **none touched** |

## 13. Acceptance criteria

- [x] All R36A, R35, R30 and Worker fingerprints verified before any write; no unexplained drift (§2).
- [x] Configuration decided and justified setting by setting; no plugin, no define, no inject, no minify (§3).
- [x] Root and entry point taken from the R35 mapping, never inferred from module location (§3).
- [x] Esbuild is the isolated 0.28.2 pin, not the root install's transitive copy (§1, test 1).
- [x] All ten Phase C conditions checked and recorded (§4).
- [x] Bundle inspected rather than assumed: valid ESM, no Node builtins, no external specifiers, digest recomputed (§5).
- [x] Two clean builds byte-identical, with no normalisation of unexplained differences (§5).
- [x] 13 focused tests pass; 5 mutation probes prove they can fail; all restored byte-identically (§6).
- [x] R36A record format unmodified; association recorded on the bundle side only (§7).
- [x] B12 not started; no evidence format created; the four trusted flags remain false (§7).
- [x] Cleanup confined to owned disposable directories, with an unexpected occupant blocking it (§8).
- [x] Regression captured with exact exit codes, run sequentially, without installing dependencies (§9).
- [x] No bundler run against a staging or production target, no deploy, no commit, no parent-repo change (§4, §12).

**Status: BUNDLE FEASIBILITY CONFIRMED · LOCAL VERIFICATION PASSED · AWAITING INDEPENDENT REVIEW.** B11 resolved
for feasibility only; B12 still deferred; B5, B6 and B7 unchanged. The full R22 `buildOfflineEvidence` port stays
blocked pending the evidence-format decision. KCOE8006 FITMENT HOLD, GitHub and production remain on HOLD.



