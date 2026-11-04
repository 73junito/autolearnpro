# C3-R36D — Integrated Offline Evidence Rehearsal

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local integration rehearsal only. `buildOfflineEvidence` is NOT ported, no reviewed contract was modified, no
catalog or Worker source changed, no manifest or lockfile changed, and no commit was made. KCOE8006 FITMENT HOLD
remains active; GitHub and production remain on HOLD.**

## 1. Outcome — the four contracts compose, and the composition refuses what it should

`infrastructure/c3/build/evidence-rehearsal.mjs` runs R35 → R36A → R36B → R36C in sequence against the **real,
unchanged** Worker and the real repository inputs, and returns a structured verdict. Eight stages complete, both
artifacts land in their own directories, and the persisted envelope reloads and verifies against an independently
re-derived snapshot.

| Phase | Result |
| --- | --- |
| A — integrity gate | **no drift** — ten fingerprints matched; staging drift 0/7 |
| B — orchestration | **8 stages**, each delegating to the contract that owns the rule |
| C — storage boundaries | **three owned directories**, policy-contained, non-reused, non-nested, empty, link-refusing |
| D — evidence guarantees | **4 establishable, 6 not**, all four trusted flags false |
| E — failure paths | **18/18 pass**, 4/5 probes caught and the 5th shown redundant by construction |
| F — regression | **5 commands, all exit 0**; two environments produced **identical** evidence |

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| `evidence-envelope.mjs` (R36C) | `47f2a7770c519fbb…` — matches |
| `c3-offline-evidence-persistence.test.mjs` | `15b4b744e08f82bf…` — matches |
| `C3-R36C-…PERSISTENCE.md` | `e6240c7b385b5479…` — matches |
| `source-snapshot.mjs` (R36A) | `47656cf695608057…` — matches |
| `worker-bundle.mjs` (R36B) | `75528944152e61ce…` — matches |
| `build-input-contract.mjs` (R35) | `8fc0b8ccfb7df46f…` — matches |
| R30 manifest / lockfile | `b33b1db8bb9ac557…` / `aee38b5df3b732c9…` — unchanged |
| Isolated toolchain | `esbuild 0.28.2` |
| `worker.mjs` / `wrangler.jsonc` | `261732ecb9accae4…` / `df6486888a42317d…` — unchanged |
| Integration HEAD / status | `ea67a03`, 33 default / 63 `--untracked-files=all`, **0 staged** |
| Parent worktree | `ea67a03`, 30 entries — untouched |
| Staging drift | **0/7** — R25 reviewer 14/14 PASS |

## 3. Phase B — the eight stages

| # | Stage | Contract that owns the rule |
| --- | --- | --- |
| 1 | `mapping` | `assertBuildInputMapping` — explicit three-root mapping, temporary-only policy, empty output root |
| 2 | `snapshot` | `createSourceSnapshot` — canonical role-labelled snapshot, combined digest |
| 3 | `bundle` | `bundleWorker` — boundary re-check, isolated esbuild 0.28.2, in-memory output |
| 4 | `inspection` | `inspectBundle` on the **bytes read back from disk**, not the in-memory copy |
| 5 | `envelope` | `createEvidenceEnvelope` — relationship checks, three verified / seven not-established |
| 6 | `persistence` | `writeEvidenceEnvelope` — `wx`, fsync, read-back re-hash |
| 7 | `reload` | `verifyEvidenceFile` reads the file from disk again |
| 8 | `verification` | the same call binds it to the snapshot and toolchain derived in stages 1–3 |

The rehearsal re-implements **no** validation rule. Every refusal a caller sees is the owning contract's own code
(`R35_*`, `R36A_*`, `R36B_*`, `R36C_*`), which is why a change in one contract changes the rehearsal's behaviour —
the actual property being tested here.

The verdict carries no absolute path and no clock, so two environments are comparable:

```json
{ "schema": "alp-c3-r36d-evidence-rehearsal", "version": 1, "ok": true,
  "stages": ["mapping","snapshot","bundle","inspection","envelope","persistence","reload","verification"],
  "mapping":  { "inputs": 9, "roles": ["catalog","repository","worker"] },
  "snapshot": { "combinedSha256": "58d5eccc…", "declared": 9, "entries": 8, "exclusions": 3 },
  "bundle":   { "file": "worker.mjs", "bytes": 579, "sha256": "a955e25f…", "findings": 0 },
  "envelope": { "sha256": "f03921ac…", "fileBytes": 1231, "fileSha256": "1f46a257…" },
  "verification": { "ok": true, "claims": { "…all false…" } } }
```

## 4. Phase C — storage boundaries

| Rule | Implementation |
| --- | --- |
| Three own directories | `build`, `snapshot`, `evidence` — each with exactly one owner |
| Caller-approved | required argument; no default anywhere |
| Inside the R28 policy | containment judged on `realpathSync`, so a junction is judged at its target |
| R35 empty-root preserved | the snapshot directory must be empty; the mapping gate is not weakened for convenience |
| Distinct | reusing one directory for two purposes → `R36D_DIRECTORY_REUSED` |
| Not nested | an outer directory containing an inner one is already non-empty, so `R36D_DIRECTORY_NOT_EMPTY` fires first — the code that fires is named rather than assumed |
| Not linked | a junction or symlink → `R36D_DIRECTORY_SYMLINK` |
| Never in source | `R36D_DIRECTORY_INSIDE_SOURCE` when roots are supplied |
| Cleanup owns only its own | `cleanRehearsal` composes the two contract removers; an unrelated file in the evidence directory survives, and a second call fails loudly |

**Why three directories:** R36A's mapping gate requires an *empty* output root, so the bundle and the snapshot
scratch cannot share one. That friction is inherited from the frozen R36A contract and was not edited away.

## 5. Phase D — what a passing rehearsal does and does not establish

| Establishes (4) | Does not establish (6) |
| --- | --- |
| `reviewedInputsMatchedSnapshot` | `gitCommitAuthenticity` |
| `bundleBytesMatchedRecordedDigest` | `ciIdentity` |
| `persistedEnvelopeReloadedAndVerified` | `signedProvenance` |
| `localProcessCompletedWithoutObservedPolicyViolation` | `humanReleaseApproval` |
| | `publicationAuthorization` |
| | `deploymentAuthorization` |

`sourceCommitVerified`, `ciAttested`, `publicationAuthorized` and `deployAllowed` are `false` in the verdict and in
the envelope it produced. Note the wording of the fourth claim: *without observed policy violation* — the rehearsal
can report only that nothing it checked objected, not that nothing exists.

## 6. Phase E — the failure paths

`tests/c3-evidence-rehearsal.test.mjs`, 18 cases. Success paths run against the **real** repository; failure paths
use a temporary copy of the real inputs and change exactly one thing.

| # | Case | Result |
| --- | --- | --- |
| 1 | Successful end-to-end rehearsal | pass — 8 stages, 9 inputs, 8 entries, 3 exclusions, both artifacts in their own directories, snapshot scratch empty |
| 2 | Deterministic repeated output | pass — two independent environments: **identical verdict** and identical bundle, envelope and file digests |
| 3 | Modified Worker source | pass — a benign edit moves the bundle **and** envelope digests; a `pg` import is refused before the bundler |
| 4 | Modified repository input | pass — one appended byte moves the snapshot digest; a removed lockfile is refused by the mapping gate |
| 5 | Incorrect source snapshot | pass — refuses on the wrong snapshot, then verifies once the true snapshot is re-derived |
| 6 | Modified bundle bytes | pass — `R36C_ARTIFACT_MISMATCH` |
| 7 | Corrupted persisted evidence | pass — `R36C_DIGEST_MISMATCH` |
| 8 | Missing evidence file | pass — refused and not regenerated |
| 9 | Forged authority flags | pass — each of the four refused, even re-sealed |
| 10 | Nonempty output directory | pass — refused for `build` and for `evidence`; the occupant is not cleared |
| 11 | Unauthorised temporary root | pass — outside-policy and reused-directory refusals |
| 12 | Symlink or junction directory | pass — refused as a link (ran on this host) |
| 13 | Worker bundling failure | pass — `R36B_BUNDLE_FAILED`, nothing published, source left as written |
| 14 | Interrupted evidence write | pass — the partial file is refused as unreadable and a second rehearsal will not overwrite it |
| 15 | Failure with no partial publication | pass — all three directories empty after a refused run |
| 16 | No source-tree mutation | pass — catalog, Worker and both root manifests digest identically before and after |
| 17 | Cleanup limited to owned directories | pass — unrelated file survives; a second cleanup fails loudly |
| 18 | No GitHub, cloud, network or deployment | pass — no such token in the module; imports are exactly the five composition targets plus three Node builtins |

### Mutation probes — four of five caught, and the fifth explained

| Probe | Weakened | Result |
| --- | --- | --- |
| M1 | `R36D_DIRECTORY_NOT_EMPTY` removed | caught by tests **10, 11, 14** |
| M2 | `R36D_DIRECTORY_SYMLINK` removed | caught by test **12** |
| M3 | `R36D_DIRECTORY_REUSED` removed | caught by test **11** |
| M4 | `removeBundleOutput` dropped from cleanup | caught by test **17** |
| M5 | `if (!inspection.ok) throw` removed | **not caught — and that is the honest result** |

M5 deserves the note. The guard is **redundant by construction**: `bundleWorker` already inspects the bytes it
produced and refuses a contaminated bundle at stage 3, which its own suite proves. The rehearsal's re-inspection of
the *persisted* bytes is defence in depth against a change between memory and disk, and no test fails when it is
removed because the inner contract fires first. Reporting "5/5 caught" would have been false.

One probe also had to be re-run: my first attempt at M5 was a no-op because the shell expanded `${…}` inside the
replacement string. That is recorded because a reader comparing probe logs would otherwise see a discrepancy.

## 7. Phase F — regression and cross-environment comparison

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | **194 tests · 190 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass / 0 fail |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 85ms` |

The four skips are unchanged host-capability cases (library generation 8b, library reader 11, offline evidence 13,
journal symlink). **This milestone added no skip**: its link case uses a directory junction, which this host
permits, and it ran.

Two independently created environments, same inputs:

```
run1 snapshot=58d5eccc1babe486 bundle=a955e25fbb32a6cd envelope=f03921ace88f8f6c file=1f46a2570f91d44c bytes=1231
run2 snapshot=58d5eccc1babe486 bundle=a955e25fbb32a6cd envelope=f03921ace88f8f6c file=1f46a2570f91d44c bytes=1231
IDENTICAL_VERDICTS=true
```

Every digest also matches the milestone that first recorded it, so the rehearsal reproduces known values rather
than inventing new ones. **One documented cross-platform difference is possible:** the verdict's
`envelope.durability` string differs between Windows (`file fsync only…`) and POSIX (`file+directory fsync`). It
stays in the verdict deliberately — hiding a platform difference is worse than reporting it.

## 8. Filesystem ownership and evidence flow

```
  policy root (os.tmpdir()/c3-r36d-XXXX)      owner       lifetime
  ├── build/       worker.mjs (579 B)         R36B        removed by cleanRehearsal
  ├── snapshot/    (always empty)             R36A gate   never written; emptiness IS the requirement
  └── evidence/    evidence.json (1,231 B)    R36C        removed by cleanRehearsal

  read-only inputs, never written:
    repository root            package.json, package-lock.json
    apps/catalog               4 files
    infrastructure/cloudflare  worker.mjs, wrangler.jsonc

  flow:
    roots ─► R35 mapping ─► R36A snapshot ─┐
    worker ─► R36B bundle ─► inspect(disk) ─┼─► R36C envelope ─► write(wx+fsync) ─► verify(reload)
                                            ┘
    verdict = stages(8) + digests + establishes(4) + doesNotEstablish(6) + claims(false × 4)
```

## 9. Blocker register

| # | Status | Note |
| --- | --- | --- |
| **B5** | **Open** | 7 scaffold READMEs plus `infrastructure/c3/build/README.md` remain untracked; a clean checkout of `HEAD` still fails `validate:foundation` (measured in R35 §7). The rehearsal does not change it. |
| **B6** | **Open** | Linux verification pending for R31, R35 and the link/junction cases used by R36B–R36D. |
| **B7** | **Open** | No browser harness; catalog accessibility still asserted by construction only. |
| **B11** | Resolved locally | Bundle feasibility; deployment questions deliberately left open. |
| **B12** | Resolved locally | Evidence format and persistence, temporary-only. |
| **B13** | **New** | The rehearsal is a **single-machine, single-process** demonstration. It proves the contracts compose in this process; it does not prove they compose across a process boundary, a restart, or two different machines. |
| **B14** | **New** | `snapshot/` is a required directory that must always be empty — an artefact of R36A's mapping gate, not a design goal. A future versioned R36A API could remove it; the frozen contract was not edited. |

## 10. Artifact fingerprints and changed-file inventory

### Created — 3 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/evidence-rehearsal.mjs` | 10,202 | `3348843f91441cbd4cb2eead1944ac9cd70bdae81e51428908333894adb1a769` |
| `tests/c3-evidence-rehearsal.test.mjs` | 19,937 | `f0179407e9a00034795549e2076e377df96b1aeeccf9893bafc63f34472d824f` |
| `docs/c3-r36d/C3-R36D-INTEGRATED-EVIDENCE-REHEARSAL.md` | this file | reported with the handoff, not inside itself |

### Modified — none

No existing file was edited. Verified unchanged: `evidence-envelope.mjs` (`47f2a777…`), `source-snapshot.mjs`
(`47656cf6…`), `worker-bundle.mjs` (`75528944…`), `build-input-contract.mjs` (`8fc0b8cc…`),
`build-root-guard.mjs` (`40d856d5…`), `target-policy.mjs`, `worker.mjs` (`261732ec…`), `wrangler.jsonc`
(`df648688…`), R30 manifest / lockfile (`b33b1db8…` / `aee38b5d…`), all four `apps/catalog` sources, root
`package.json` (`ac8d0bec…`), root `package-lock.json` (`f805b6f7…`), and every earlier C3 suite.

## 11. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **35** default / **66** `--untracked-files=all` (was 33 / 63 before this milestone) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, parent repo, TorqueMind | **none touched** |

## 12. Acceptance criteria

- [x] All ten upstream fingerprints verified before any write; staging drift 0/7 (§2).
- [x] Eight-stage orchestration reusing the exported contracts; no rule re-implemented (§3).
- [x] Three separately owned, policy-contained, non-reused, empty, link-refusing directories; R35 empty-root preserved (§4).
- [x] Phase D guarantee lists published with the verdict, four flags false (§5).
- [x] 18 failure-path cases pass, including no-partial-publication and no-source-mutation (§6).
- [x] Probes run; four caught, the fifth shown redundant rather than claimed as caught (§6).
- [x] Regression captured with exact exit codes, run sequentially (§7).
- [x] Two independent environments produced identical evidence; the one possible cross-platform difference is documented, not normalised (§7).
- [x] `buildOfflineEvidence` not ported; no reviewed contract, catalog, Worker, manifest or lockfile changed (§10).
- [x] No commit, push, merge, PR, workflow activation or deployment; parent repo untouched (§11).

**Status: INTEGRATION REHEARSAL PASSED · LOCAL VERIFICATION COMPLETE · AWAITING INDEPENDENT REVIEW.** The four
contracts compose in this process and refuse the failures tested here. What remains unproven is stated as B13 and
B14, not glossed. KCOE8006 FITMENT HOLD, GitHub and production remain on HOLD.



