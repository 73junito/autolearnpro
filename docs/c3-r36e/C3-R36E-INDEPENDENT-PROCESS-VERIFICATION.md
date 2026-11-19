# C3-R36E — Independent Process Evidence Verification

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local process-isolation testing only. `buildOfflineEvidence` is NOT ported, no reviewed contract was modified, no
Worker or catalog source changed, no manifest or lockfile changed, and no commit was made. KCOE8006 FITMENT HOLD
remains active; GitHub and production remain on HOLD.**

## 1. Outcome — B13 is addressed: evidence crosses a process boundary and still verifies

Two Node processes now do the work separately. The producer runs the eight-stage rehearsal and exits. A **different**
process then re-derives the snapshot from the working tree, re-reads the toolchain version from the isolated
install, and verifies the persisted evidence — receiving **paths only**, never a digest, a snapshot object, a bundle
record or a claim.

| Phase | Result |
| --- | --- |
| A — integrity gate | **no drift** — seven fingerprints matched, drift 0/7 |
| B — process boundary | **producer + verifier CLIs**, no shared in-memory state |
| C — filesystem ownership | unchanged R28 policy, R35 empty-root preserved, three owned directories |
| D — failure paths | **19/19 pass** (18 required + 1 added), exit codes captured per process |
| E — R36D probe | **closed** — the guard was exercised through process-level interception |
| F — Linux package | **prepared, not executed** — no Linux result is claimed |
| G — regression | **5 commands, all exit 0** |

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| `evidence-rehearsal.mjs` (R36D) | `3348843f91441cbd…` — matches |
| `c3-evidence-rehearsal.test.mjs` (R36D) | `f0179407e9a00034…` — matches |
| `C3-R36D-…REHEARSAL.md` (R36D) | `b34496af0647fb8a…` — matches |
| `evidence-envelope.mjs` (R36C) | `47f2a7770c519fbb…` — matches |
| `source-snapshot.mjs` (R36A) | `47656cf695608057…` — matches |
| `worker-bundle.mjs` (R36B) | `75528944152e61ce…` — matches |
| `build-input-contract.mjs` (R35) | `8fc0b8ccfb7df46f…` — matches |
| R30 manifest / lockfile | `b33b1db8bb9ac557…` / `aee38b5df3b732c9…` — unchanged |
| `worker.mjs` / `wrangler.jsonc` | `261732ecb9accae4…` / `df6486888a42317d…` — unchanged |
| Integration HEAD / status | `ea67a03`, 35 default / 66 `--untracked-files=all`, **0 staged** |
| Parent worktree | `ea67a03`, 30 entries — untouched |
| Staging drift | **0/7** — R25 reviewer 14/14 PASS |

## 3. Phase B — the process boundary

| | Producer (`evidence-producer.cli.mjs`) | Verifier (`evidence-verifier.cli.mjs`) |
| --- | --- | --- |
| Receives | policy values, three directories, three roots, toolchain labels | the same |
| Derives itself | policy (re-validated from values) | policy (re-validated from values) |
| | mapping → snapshot → bundle → inspection → envelope → persistence | **snapshot re-derived from the working tree** |
| | | **toolchain version read from the isolated esbuild install** |
| Reads | — | the persisted evidence and the artifact bytes |
| Emits | one JSON line + exit code | one JSON line + exit code |
| Trusts the other process | n/a | **nothing** — no producer object, no producer metadata file |

Ordering is enforced by the test harness: `spawnSync` returns only once the child has terminated, so every verifier
run begins after its producer's process is gone. Both processes were observed with distinct PIDs (test 2), recorded
as evidence of separation rather than as proof on its own.

Single-line JSON on stdout and a non-zero exit on failure are deliberate: a caller parsing output cannot mistake a
stack trace for a verdict, and cannot mistake "did not run" for "passed" because a missing verdict is not JSON.

### What the verifier deliberately does not do

- It does not accept a snapshot, digest or claim from the caller — only paths.
- It does not read any producer-written metadata file as authority.
- It does not rebuild a missing artifact, rewrite evidence, or repair a damaged file.
- It does not import the producer's module, so the producer's orchestration cannot be inherited.

One honest dependency: the verifier's module graph includes `worker-bundle.mjs` **via** `evidence-envelope.mjs`
(for the bundle file name and config id). It therefore needs the isolated toolchain package to be installed, even
though it never runs a build. Removing that dependency would require changing the frozen R36C contract, which is not
authorised here.

## 4. Phase C — filesystem ownership

Unchanged from R36D and re-asserted here: three directories inside one R28 temporary policy root (`build`,
`snapshot`, `evidence`), the R35 empty-output requirement preserved, containment judged on `realpathSync`, and no
write into any source directory. New in this milestone: **two processes** share that layout, and neither deletes
anything it did not create — the verifier writes nothing at all, so it can remove nothing either (test 18).

## 5. Phase D — the failure paths

`tests/c3-process-boundary.test.mjs`, 19 cases. Each case captures **both** process exit codes independently, and no
case passes merely because a process failed to start — an unparsable or absent verdict fails the assertion.

| # | Case | Producer exit | Verifier exit | Result |
| --- | --- | --- | --- | --- |
| 1 | Successful producer, then separate verifier | 0 | 0 | pass — 8 stages, claims all false |
| 2 | Verification after the producer exited | 0 | 0 | pass — distinct PIDs, evidence present before the verifier ran |
| 3 | Deterministic repeated verification | 0 | 0 / 0 | pass — identical JSON apart from the PID |
| 4 | Artifact tampering after producer exit | 0 | 1 | pass — `R36C_ARTIFACT_MISMATCH` |
| 5 | Evidence-file tampering after producer exit | 0 | 1 | pass — `R36C_DIGEST_MISMATCH` |
| 6 | Source drift after producer exit | 0 | 1 | pass — `R36C_SNAPSHOT|SOURCE_MISMATCH` |
| 7 | Missing artifact | 0 | 1 | pass — `R36C_ARTIFACT_MISSING`, not rebuilt |
| 8 | Missing evidence file | 0 | 1 | pass — `R36C_EVIDENCE_MISSING`, not regenerated |
| 9 | Forged provenance flags (all four) | 0 | 1 ×4 | pass — `R36C_FORGED_CLAIM:<flag>` |
| 10 | Incorrect or missing trusted inputs | — | 1 ×4 | pass — `R36E_PAYLOAD_REQUIRED`, `R36E_PAYLOAD_INVALID`, `R36E_ROOTS_REQUIRED`, `R36E_TOOLCHAIN_VERSION_MISMATCH` |
| 11 | Invalid temporary policy | 1 | 1 | pass — `R28_PRODUCTION_NOT_AUTHORIZED`, then `R28_ROOT_NOT_TEMPORARY` |
| 12 | Symlink/junction escape | 0 | 1 | pass — `R36C_EVIDENCE_ROOT_OUTSIDE_POLICY` (ran on this host) |
| 13 | Producer failure before persistence | 1 | 1 | pass — `R35_INPUT_MISSING`; verifier also refuses |
| 14 | Producer failure during persistence | 1 | — | pass — pre-existing file byte-identical afterwards |
| 15 | Verifier unable to complete | 0 | 1 | pass — structured single-line error, not a stack trace |
| 16 | No automatic repair or rebuilding | 0 | 1 / 1 | pass — artifact still absent, evidence bytes unchanged |
| 17 | No unintended source mutation | 0 | 0 | pass — catalog, Worker and repository trees identical |
| 18 | Cleanup limited to owned directories | 0 | 0 | pass — an unowned file survives; the verifier removes nothing |
| 19 | R36D reinspection guard (Phase E) | 1 | — | pass — `R36D_BUNDLE_BYTES_CHANGED` |

Case 13 deserves a note: the verifier refuses on the **source** first (`R35_INPUT_MISSING`), not on the evidence,
because it re-derives the snapshot before it reads the envelope. That ordering is the independence property, and the
test asserts the refusal rather than insisting on a particular code.

## 6. Phase E — the open R36D probe, closed

R36D's mutation probe M5 could not be caught: removing the rehearsal's stage-4 guard
(`inspection.sha256 !== bundle.output.sha256`) failed no test, because `bundleWorker` already refuses a contaminated
bundle earlier. That was reported as an open defense-in-depth question.

**It is now exercised.** `tests/fixtures/fs-alter-once.mjs` is loaded with `node --import`, before the producer's
module graph, and patches `fs.readFileSync` on the module object that every `import fs from 'node:fs'` receives. It
alters exactly one path — the freshly written bundle — so the bytes on disk differ from the bytes the bundler
reported.

Result: the producer exits **1** with `R36D_BUNDLE_BYTES_CHANGED`, the bundle is present (the guard sits after the
write), and **no evidence is produced**. A control run without the interception succeeds, so the failure is caused by
the interception and nothing else.

No reviewed contract was modified, no contract was weakened, and the guard now has a test that fails if it is
removed. The R36D record itself is untouched at its verified fingerprint.

## 7. Phase F — Linux validation package (prepared, not executed)

`docs/c3-r36e/C3-R36E-LINUX-MANIFEST.json` — schema `alp-c3-r36e-linux-manifest-v1`, **28 entries**, every digest a
64-hex SHA-256, manifest SHA-256 `931c6f1df39726b0…`. It covers the whole `infrastructure/c3` source tree (excluding
`node_modules`) plus the ten C3 test suites and the `fs-alter-once.mjs` fixture.

| Field | Value |
| --- | --- |
| `executed` | **false** |
| `notClaimed` | "Linux execution has NOT been performed. These are transfer hashes, not results." |
| `toolchainNote` | do not reuse Windows `node_modules`; run `npm ci --ignore-scripts` in `infrastructure/c3/build` inside the transferred tree |

**No Linux result is claimed, and no case is labelled passed.** The outstanding items are R31's symlink case and the
link/junction cases added by R35–R36E. Until they run on Ubuntu without skips, **B6 stays open** and this milestone's
Windows results must not be read as Linux evidence.

## 8. Phase G — regression

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | **213 tests · 209 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass / 0 fail |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 79ms` |

The four skips are unchanged host-capability cases (library generation 8b, library reader 11, offline evidence 13,
journal symlink). This milestone adds **19** tests and **no** skip.

## 9. Mutation probes on the two CLIs

| Probe | Weakened | Result |
| --- | --- | --- |
| M1 | verifier's `R36E_ROOTS_REQUIRED` check removed | caught by test **10** |
| M2 | toolchain version cross-check removed | caught by test **10** |
| M3 | producer's success-path exit expression forced to `0` | **not caught — and provably equivalent** |

M3 needs the explanation rather than a claim. The expression is `verdict.ok === true ? 0 : 1`, and on the success
path `verdict.ok` is *always* `true`: `runEvidenceRehearsal` throws rather than returning `ok:false`, because
`verification.ok` is either `true` or a thrown error, and the stage count is unconditionally eight. Forcing it to `0`
therefore changes nothing at runtime — a behaviour-preserving mutation, not an untested branch. The failure path sets
its exit code in the `catch`, and that is covered by tests 11, 13 and 14.

All probes restored byte-identically (`d9d1462087311727…` for the verifier, `d1155d89e8c03ffb…` for the producer).

## 10. Process and filesystem ownership

```
  PROCESS 1 — producer (node evidence-producer.cli.mjs)      exits with 0 or 1
    args: policy values, dirs, three roots, toolchain labels  (paths only)
    calls: R28 policy → R35 mapping → R36A snapshot → R36B bundle
           → inspect(disk) → R36C envelope → write → verify(reload)
    writes: build/worker.mjs, evidence/evidence.json
    leaves: snapshot/ empty

  ── process ends; nothing of it survives in memory ──

  PROCESS 2 — verifier (node evidence-verifier.cli.mjs)      exits with 0 or 1
    args: the same paths plus toolchain labels                (no digest, no object, no claim)
    derives: policy (re-validated) · snapshot (re-walked tree) · esbuild version (read from disk)
    reads:  evidence/evidence.json, build/worker.mjs
    writes: nothing

  policy root (os.tmpdir()/c3-r36e-XXXX)
  ├── build/       worker.mjs        written by P1, read by P2
  ├── snapshot/    always empty      both processes only require it to be empty
  └── evidence/    evidence.json     written by P1, read by P2
  unowned paths inside the policy root                       never touched (test 18)
  repository sources (root manifests, apps/catalog, infrastructure/cloudflare)   read-only for both
```

## 11. Blocker register

| # | Status | Note |
| --- | --- | --- |
| **B13** | **Addressed, not closed** | Cross-process verification works: a separate process re-derives the snapshot and toolchain and verifies persisted evidence. Still unproven: a **machine** boundary, a machine restart, and a verifier built from a different checkout. |
| **B14** | Open, documented | `snapshot/` exists only because R36A's mapping gate demands an empty output root. No contract change is authorised, and none was made. |
| **B5** | **Open** | 7 scaffold READMEs remain untracked; a clean checkout still fails `validate:foundation`. |
| **B6** | **Open** | Linux verification pending; R36E prepares the package but executes nothing on Linux. |
| **B7** | **Open** | No browser harness. |
| **B11 / B12** | Resolved locally | Unchanged by this milestone. |

## 12. Artifact fingerprints and changed-file inventory

### Created — 6 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/evidence-producer.cli.mjs` | 2,521 | `d1155d89e8c03ffb84ad4456a15c9885545d9bc347fe19975975c0b0136e3db7` |
| `infrastructure/c3/build/evidence-verifier.cli.mjs` | 3,816 | `d9d14620873117273d9ae647cd001bf3b43946eb1292738f84c58efaacbac48e` |
| `tests/c3-process-boundary.test.mjs` | 19,774 | `e45e9b33e564e6ba98d4a6efb461e36bc15766216ede5bd9b16b307837b91966` |
| `tests/fixtures/fs-alter-once.mjs` | 1,141 | `2fcc9af855fbd1af160373f5aa5bbd8bb19ac319c2797866e5ec0f5c3a76860f` |
| `docs/c3-r36e/C3-R36E-LINUX-MANIFEST.json` | 28 entries | `931c6f1df39726b03b3bc71dcf4850f62300025c5244808ac9f0cda639b17eb7` |
| `docs/c3-r36e/C3-R36E-INDEPENDENT-PROCESS-VERIFICATION.md` | 266 lines | reported with the handoff, not inside itself |

### Modified — none

No existing file was edited. Verified unchanged: `evidence-rehearsal.mjs` (`3348843f…`),
`evidence-envelope.mjs` (`47f2a777…`), `source-snapshot.mjs` (`47656cf6…`), `worker-bundle.mjs` (`75528944…`),
`build-input-contract.mjs` (`8fc0b8cc…`), `build-root-guard.mjs` (`40d856d5…`), `target-policy.mjs`, `worker.mjs`
(`261732ec…`), `wrangler.jsonc` (`df648688…`), R30 manifest / lockfile (`b33b1db8…` / `aee38b5d…`), all four
`apps/catalog` sources, root `package.json` (`ac8d0bec…`), root `package-lock.json` (`f805b6f7…`), and every earlier
C3 suite — including the frozen R36D record and its tests, which the Phase E probe deliberately did not touch.

## 13. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **38** default / **72** `--untracked-files=all` (was 35 / 66 before this milestone) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, parent repo, TorqueMind | **none touched** |

## 14. Acceptance criteria

- [x] All seven upstream fingerprints verified before any write; drift 0/7 (§2).
- [x] Producer and verifier are separate processes; the verifier receives paths only (§3, test 2).
- [x] The verifier re-derives the snapshot from the tree and the toolchain version from the isolated install (§3).
- [x] No producer-written metadata file is treated as authority (§3).
- [x] R28 policy and the R35 empty-root requirement preserved; three owned directories (§4).
- [x] 19 cases pass, each capturing both exit codes; no case passes on a missing verdict (§5).
- [x] Post-producer tampering with the artifact, the evidence and the source is each detected (§5, tests 4–6).
- [x] The open R36D probe is closed by a real test, with no contract modified or weakened (§6).
- [x] Linux package prepared with 28 hashes and **no Linux claim** (§7).
- [x] Regression captured with exact exit codes, run sequentially (§8).
- [x] Probes: two caught, the third shown behaviour-preserving rather than claimed as caught (§9).
- [x] No commit, push, merge, PR, workflow activation or deployment; parent repo untouched (§13).

**Status: CROSS-PROCESS VERIFICATION DEMONSTRATED · LOCAL VERIFICATION COMPLETE · AWAITING INDEPENDENT REVIEW.**
B13 is addressed for a same-machine process boundary and explicitly **not** closed. B14, B5, B6 and B7 remain open.
KCOE8006 FITMENT HOLD, GitHub and production remain on HOLD.



