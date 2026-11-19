# C3-R36H.3 — Output Boundary Hardening

**Milestone:** C3-R36H.3 — corrective, browser verification tooling and documentation only
**Workspace:** `F:\autolearnpro-c3-r25-integration`
**Date:** 2026-11-04
**Status:** implemented and verified locally · awaiting independent review
**Findings addressed:** B24 (output authorisation too broad), B22 (injection driver unprotected), B23 (flaky fixture),
B21 (decision only). One new finding, **B25**, was discovered and fixed.
**Not changed:** the catalog application, any reviewed C3 security contract, root manifests, lockfiles, any reviewed
evidence file.

## 1. Integrity gate

| Check | Result |
| --- | --- |
| `browser-gate.mjs` (R36H.2) | `a99b1d689c4400bd136232af177bc1ab3ae2eb1702da13580c0919b10a761b9f` — matches review |
| `output-safety-tests.mjs` (R36H.2) | `ebd402d5a38ae6aa650d97d6b9b3830a9c9ad541f8417938968416c04b630f35` — matches |
| `gate-negative-tests.mjs` (R36H.2) | `65998772937b06d451596df8a74d5349e4d5a0a874865bf774fe486ee0823e64` — matches |
| `C3-R36H2-OUTPUT-SAFETY.json` | `cc9e261a2d158996e734ede5a702082e95f9b5ba4cc0c7b86c9316d83035e4f4` — matches |
| `C3-R36H2-FAILURE-INJECTION.json` | `9634b381b1ba19bdf3a85ed8f26456b89816e491eb058e1db0eacd4f8e2746eb` — matches |
| C3-R36H.2 record | `33413bc2d6a50d466df4adc8fbd4b6311e384e241e19c9efc3983d9e9a5375a8` — matches |
| C3-R36H.1 evidence | all 8 files unchanged (`9b78e683…`, `c7e763bf…`, `fe5e89a4…`, `78b14739…`, `d5f7bbce…`, `60f253e7…`, `fa358998…`, `19d7b460…`) |
| HEAD (both trees) | `ea67a03` |
| Integration status | **43 default / 108 individual** — your measurement is correct |
| Staged | 0 |

**Reporting correction.** My C3-R36H.2 handoff said 40/108. That was wrong: the milestone record stated 43/108
correctly, and the handoff message contradicted its own record. The record was already right; the message was not.
The figure is re-measured above and stood at **43/108** before this milestone's files were added.

## 2. B24 — the output boundary is now a policy, not an allowance

The R36H.2 gate accepted **any** empty directory outside the repository. It is replaced by two destinations and
nothing else:

| Destination | Requirement |
| --- | --- |
| **Owned temporary** | A **direct child of the OS temporary directory** whose name matches `^c3r36h3-[0-9a-f]{12}$`. The random suffix is what makes ownership checkable: a caller cannot point the gate at an existing folder and call it temporary. |
| **Repository run** | `docs/c3-r36h3/runs/<name>`, one flat level, `<name>` matching `^[a-z0-9][a-z0-9-]{2,39}$`. No nesting, no deeper paths. |

Refusal order, all before the browser launches: `R36H3_OUTPUT_REQUIRED` (no default exists) →
`R36H3_OUTPUT_VARIABLE_MISNAMED` (names `R36H2_OUT`, `R36H_OUT`, `R36H1_OUT`, `R36_OUT`, `OUTPUT_DIR` explicitly) →
`NOT_ABSOLUTE` → `MISSING` → `SYMLINK` (`lstat` before `realpath`) → `NOT_DIRECTORY` → repository/outside branch →
`FORBIDDEN` / `RUN_NAME_INVALID` / `NOT_AUTHORISED` / `NOT_OWNED` → `NOT_EMPTY`. Writes remain exclusive (`wx`), and
the authorisation class is recorded in the result as `output.authorisedAs`.

## 3. B24 verification — 14/14

`output-safety-tests.mjs`, exit **0**, `ALL_EXPECTATIONS_MET=true`.

| # | Case | Exit | Observed |
| --- | --- | --- | --- |
| 1 | no output configuration | 1 | `R36H3_OUTPUT_REQUIRED`, `written:false`, `docs/` unchanged |
| 2 | superseded variable `R36H2_OUT` | 1 | `R36H3_OUTPUT_VARIABLE_MISNAMED` naming it |
| 3 | destination missing | 1 | `..._MISSING` |
| 4 | destination occupied | 1 | `..._NOT_EMPTY`; planted file byte-identical after |
| 5 | `docs/c3-r36h1` (the F-5/B22 destination) | 1 | `..._FORBIDDEN:docs/c3-r36h1` |
| 6 | `docs` (repository) | 1 | `..._FORBIDDEN:docs` |
| 7 | **existing unowned temp subdirectory** | 1 | `..._NOT_OWNED:arbitrary-…` — **the B24 gap, closed** |
| 8 | **nested under an owned temp directory** | 1 | `..._NOT_AUTHORISED` — depth enforced, not just naming |
| 9 | `F:\` (drive root) | 1 | `..._NOT_AUTHORISED` |
| 10 | `runs/Not_A_Valid_Name` | 1 | `..._RUN_NAME_INVALID` |
| 11 | **junction from temp into `docs`** | 1 | `..._SYMLINK` (junction refused as a link, not followed) |
| 12 | a file, not a directory | 1 | `..._NOT_DIRECTORY` |
| 13 | clean run, owned temp | **0** | 4 files, `verdict.pass:true`, `authorisedAs:"owned-temporary"` |
| 14 | C3-R36H.1 + R36H.2 files after the suite | — | recursive comparison: `h1Files:8`, `h2Files:3`, both identical |

Case 14 was initially non-recursive and reported `h1Files: 6`, silently skipping `docs/c3-r36h1/tools` — which holds
the reviewed gate itself. A check that cannot see half the evidence is not a check, so the walk was made recursive.
The `h1Files: 8` above is from the corrected version, re-run in full.

## 4. B22 — the driver now has the same boundary

C3-R36H.2 guarded the **gate** and left the **driver** able to write wherever `OUT_ROOT` pointed — the same class of
defect, one program over. `assertWritableSummaryPath` now validates the prospective file, refusing
`R36H3_INJECTION_OUTPUT_PROTECTED` for anything under `docs/c3-r36h1` or `docs/c3-r36h2`, and
`R36H3_INJECTION_OUTPUT_FORBIDDEN` for any other in-repository location. Deletion is separately confined:
`assertRemovable` (`R36H3_INJECTION_DELETE_REFUSED`) allows `fs.rmSync` only beneath the OS temporary directory.

**Tested with the exact previously mistaken destination** — `R36H3_INJ_OUT=…\docs\c3-r36h1`:

```
EXIT=1  elapsedMs=1538
R36H3_INJECTION_OUTPUT_PROTECTED:F:\…\docs\c3-r36h1\C3-R36H3-FAILURE-INJECTION.json
  — docs\c3-r36h1 holds reviewed evidence and is never a destination
c3-r36h1 unchanged: True   file count: 8
```

1.5 s, no browser launched, reviewed directory byte-identical.

### A defect in my own first attempt at this guard

The first version validated the **directory** it was given and compared that directory's *parent* against the
protected roots. Given `docs/c3-r36h1`, the parent inspected was `docs` — nothing matched, so the destination was
accepted. I found it because the refusal test did not fail fast: the run began eight browser cases and I terminated my
own driver process at 120 s. `docs/c3-r36h1` was still 8 files and byte-identical afterwards.

That is the same mistake pattern this milestone exists to remove — checking a path that is not the path being
written — and it is recorded rather than quietly corrected. The fix validates the full prospective file path, and the
early block now runs **before** any case.

The driver also rewrites its own summary file on every run (`C3-R36H3-FAILURE-INJECTION.json` was written three
times during this milestone). That is intended for a milestone summary, but it is the F-5 pattern inside my own
tooling, and successive hashes are listed in §5 so no earlier run appears preserved when it was not.


## 5. B23 — investigated, re-characterised, left open

### 5.1 Pre-fix trials (14)

`b23-race-trials.mjs`, isolated trials of the C3-R36H.2 case-4 fixture, **13 PASS / 1 TIMEOUT**:

```
PASS     trial  1  exit=1      17527ms  failed=[consoleErrors]
...
TIMEOUT  trial  3  exit=null  180012ms  R36H3_HARNESS_EXCEPTION:page.goto: Timeout 30000ms exceeded.
...
PASS     trial 14  exit=1      15469ms  failed=[consoleErrors]
```

Durations ranged **8.2 s – 53.8 s** for the same fixture. Trial 3's `exit=null` with `durationMs=180012` is the
important detail: `180012` is my harness's own kill timeout, and `null` means the gate never exited. The gate **had**
written its result — the diagnostic was correct — and then hung.

### 5.2 Root cause of the hang: B25

`runChecks` closed the browser context only on the success path:

```js
const browserVersion = context.browser()?.version() ?? null;
await context.close();          // reached only if every check above succeeded
```

Any throw before that line left Chrome running, and the live browser process kept Node's event loop alive
indefinitely. A 30 s navigation timeout therefore became a process that never exits. The R36H.1 and R36H.2 gates
share this defect; it was unobservable in normal runs because the success path always ran.

**Fixed** in the R36H.3 copy by wrapping the body in `try/finally` that closes the context and removes the temporary
profile on every path. Proven both ways with one fixture that throws after the context exists (a page whose
`data-catalogShell` flag never becomes `started`):

| Gate | Result on identical fixture |
| --- | --- |
| **R36H.2 (unfixed, `a99b1d68…`)** | still running at **75 s** → killed. HANG REPRODUCED |
| **R36H.3 (fixed)** | exit **1** in **32.6 s**, `R36H3_HARNESS_EXCEPTION:page.waitForFunction: Timeout 10000ms exceeded.`, only `gate-results.json` written, **0** leftover Chrome processes |

### 5.3 Post-fix trials (10)

```
TALLY={"PASS":10}  DETERMINISTIC_IN_ISOLATION=true
```

Durations 7.8 s – 28.8 s. No timeout, no hang.

### 5.4 But B23 is not closed — the timeout is host-level, not fixture-specific

Three consecutive runs of the **whole injection suite** (8 cases) each had exactly one case time out — and a
**different** case each time:

| Run | Timed-out case | Suite result |
| --- | --- | --- |
| A | "unexpected 404" (case 2) | 7/8 |
| B | "layout failure at a narrow viewport" (case 6) | 7/8 |
| — | case 4 (the original B23 fixture), pre-fix | 7/8 |

The original framing — a controller race inside the console-error fixture — is **wrong**. The fixture is incidental;
whichever case is running when navigation stalls past 30 s fails with `page.goto: Timeout 30000ms exceeded`. Rate
across all observation today: roughly **one case per eight-case run**.

What I did **not** do: raise the 30 s budget. The budget is unchanged (`budgetRaised: false` in the trials record),
because a timeout is a symptom and the symptom is now cheap, correct and visible.

What remains unknown and is stated as unknown: which stage stalls. `goto` is reported, but launch, navigation and
first paint are not separately timed, so the stall is not attributed. Candidates I have no evidence for beyond the
observation that runs take 8–66 s total on this host: cold-profile cost, on-access scanning of a fresh profile, or
contention from the machine's other work. **No cause is claimed.**

Attempting to reproduce these timeouts would require concurrently contending browser work to accelerate, which would
have risked the user's own browser sessions. So the rate is observed, not amplified.

**B23 stays open.** A gate that fails roughly one check per run because of infrastructure slowness is not ready for
CI, and the honest remedy is phase-level timing plus a separated launch/navigation budget — a design decision for a
future milestone, not a number to nudge here.

## 6. B21 — decision only, nothing implemented

The findings that matter are the twelve check results; the fields that vary between identical runs are run metadata.
Proposed split, for a separately reviewed implementation:

**Excluded from the canonical findings digest** (and still preserved verbatim in the full record): `runtime`
(`node`, `platform`), `browser` (`executable`, `version`), `target.origin` (embeds an ephemeral port), `output`
(`directory`, `authorisedAs`), `observed` (instrumentation counts that can vary with the engine), and any future
timestamp.

**Included**: `schema` name, `requiredChecks`, every `checks.*` finding — including `axe` violations, `network`
`serverLog` paths and statuses, and `consoleErrors` attribution — plus `verdict` (`pass`, `requiredCount`, `passed`,
`failed`, `notTestable`) and `conformanceClaimed`.

Serialisation would use the tagged, length-prefixed canonical form already established by the R36C envelope, so that
field boundaries are unambiguous and key order is irrelevant — the same reason the R36C digest is not taken over JSON.
Two runs of the same page would then produce one stable digest while both full records keep their own distinct
`origin`/`output`/`browser`.

**Not doing now:** implementing this changes the persisted evidence shape, which this milestone is not authorised to
do. No historical results are touched. B21 remains open as a decision.


## 7. Clean run against the unchanged catalog

`docs/c3-r36h3/runs/clean-01`, Chrome **156.0.8078.80**, headless, temporary profile, `127.0.0.1` server.
Exit **0**, `verdict.pass: true`, 12/12 required checks, `notTestable: [keyboard, focusVisible]`,
axe 0 violations / 13 passes / 0 incomplete, `conformanceClaimed: false`.

The three screenshots are **byte-identical** to the ones produced by the independent C3-R36H.1 and C3-R36H.2 runs
(`78b14739…`, `d5f7bbce…`, `60f253e7…`) — different milestones, different harness versions, identical pixels. The
`gate-results.json` digest differs from earlier runs, as expected and as B21 records: it embeds the port and path.

## 8. Regression — all commands exit 0, sequential

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | 213 tests · 209 pass · 0 fail · 4 skip |
| `node docs/c3-r25/verify-review.mjs` | **0** | pass |
| `npm run validate:foundation` | **0** | pass |
| `npm run test:runtime` | **0** | pass |
| `npm run build --workspace @autolearnpro/catalog` | **0** | pass |

The four skips are the unchanged Windows symlink cases. No test file was modified.

## 9. Changed-file inventory

All new; **no existing file was modified**.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `tools/browser-gate.mjs` | 24,484 | `b79b9f0ce7f9f3aa2d7a2f76ad49d4cd6b14af52ef794e448d571efc13672548` |
| `tools/output-safety-tests.mjs` | 10,912 | `0787a7dfaca20cec01f4eac390c34c436ddab37de358dea34d8c51d2b4d26636` |
| `tools/gate-negative-tests.mjs` | 10,963 | `6ad770e0620d4da7e976f1b028ecab96a406ceb52566717209ba3ef35c0948ca` |
| `tools/b23-race-trials.mjs` | 5,635 | `1082a4bfec90d1ebc688f66452ba103f75ca267a93fe6de840cc8fe0754a1b02` |
| `C3-R36H3-OUTPUT-BOUNDARY.json` | 3,491 | `a9c39fd3f0c560d52fc91af0c082fc6d5d3956e9629df5332dc8e589b6ddc158` |
| `C3-R36H3-FAILURE-INJECTION.json` (last of 3 runs) | 2,924 | `ff3e562dc3a272ff43388d9ea8f14f06c19d2e0fdb40f284e771ede2a3215b19` |
| `C3-R36H3-B23-RACE-TRIALS.json` (post-fix) | 2,597 | `8538a1362a2e4216f4832e657bd7ee21d71d543a2ba7575b60b119cd6a6fd8d2` |
| `logs/b23-trials-prefix.log` | 1,673 | `31a77c23b9ffe460fcefc9e9c667da69a131ca186a9ec07f706be2b187d27c33` |
| `logs/b23-trials-postfix.log` | 1,232 | `0948146bbea2d200e247ac9001c79227d71f2fe16c40ab2514c21a15e5e1859f` |
| `logs/injection-run-postfix-a.log` | 1,319 | `a3276751d7bf77d2189d5f60df6571877b3d487959d6ff5e0147e602bd2def98` |
| `logs/injection-run-postfix-b.log` | 1,317 | `1696586f5e9fbbab8e713d32c6bf1c51e47fb115f47a2d04e8b71d43f12394c3` |
| `runs/clean-01/gate-results.json` | 5,016 | `5d1dfd2849c7185961597c5fb3982c0180d46977eb2510c232818a7599441025` |
| `runs/clean-01/gate-1280.png` | 43,567 | `78b1473946f7c87fafe69d49f6cc3ef89de23ecd4b6b7271c6174940dff5a11a` |
| `runs/clean-01/gate-zoom200.png` | 41,427 | `d5f7bbcefb7a7dcd06179aea9b72baf85dde56d6d0f9fd1421e536bb8587e477` |
| `runs/clean-01/gate-360.png` | 38,598 | `60f253e7309f1316eeed156e15f44043ccd3d3842836d10a1cce7aed717bee54` |
| `C3-R36H3-OUTPUT-BOUNDARY-HARDENING.md` | this file | recorded in the handoff |

Earlier injection-summary digests, superseded on disk by later runs and **not** preserved as files:
`3152db68…` (run 1, 8/8), `4bac0304…` (run A, 7/8), `ff3e562d…` (run B, 7/8, current). The two superseded runs survive
as the console logs listed above.

## 10. Final Git state

| Item | Value |
| --- | --- |
| Integration HEAD | `ea67a03` |
| Parent HEAD | `ea67a03` |
| Staged files | 0 |
| Integration status | 44 default / 120 `--untracked-files=all` (43 / 108 before this milestone's files) |
| Modified tracked files | `.gitignore` (pre-existing), `package-lock.json` (authorised at C3-R34) — unchanged by this milestone |
| Commits, pushes, merges, PRs, workflows, deployments | none |

## 11. Dispositions

| Finding | Disposition |
| --- | --- |
| **B24** output authorisation too broad | **Closed** — 14/14 boundary cases, including the previously accepted unowned temp directory and a junction into the repository |
| **B22** driver output unprotected | **Closed** — exact previously mistaken destination refused in 1.5 s, evidence byte-identical |
| **B23** flaky injection fixture | **Open, re-characterised** — host-level navigation stall affecting an arbitrary case, ~1 per 8-case run; hang fixed, budget unchanged |
| **B25** browser context leaked on failure | **New, closed** — proven before/after with one fixture |
| **B26** temp directories leaked by killed runs | **New, open** — measured and cleaned here; not fixed in tooling |
| **B21** non-reproducible results digest | **Decision recorded, not implemented** |
| B7 browser accessibility | Unchanged — closed under a gate that can now fail and cannot write to reviewed evidence |
| B19 / B20 | Unchanged — no operable controls; Chromium-only, headless-only |

## 12. What this milestone does not establish

No WCAG conformance · no claim that the browser gate is CI-ready (B23 is open and would fail roughly one run in
eight on this host) · no root cause for the navigation stall · no change to the 30 s budget · no implementation of
the B21 digest · no claim that any superseded injection summary is preserved · no assertion about Firefox, WebKit,
screen readers, or a non-headless run.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD. B5 — reproducibility from a clean
checkout — remains the next substantive issue and is untouched here.


## 13. B26 — the leak had a disk footprint, and it was mine

The B25 hang was not only a stuck process. After this milestone's runs, `%TEMP%` held:

| Prefix | Count | Origin |
| --- | --- | --- |
| `c3r36h1-profile-*` | **15** | Playwright browser profiles never removed, because `context.close()` and `fs.rmSync(profile)` sat on the success path only |
| `c3r36h3-*` | 41 | owned output directories and fixture roots from trials my own harness killed at its wall-clock limit |

Total **56 directories, 54.1 MB**. Every path was verified to be inside `%TEMP%` before deletion (`refusing
out-of-temp: 0`), then removed. The user's own browser was **not** touched: 17 Chrome processes were running
throughout and were left alone — the one time I saw 16 `chrome.exe` processes and considered terminating them, the
command lines showed the user's own `User Data` profile, so I stopped.

**Not fixed:** a run that is killed externally still leaves its directory. The R36H.3 gate cleans up on every
*internal* path, including failures, but nothing can clean up after `SIGKILL` of the parent. That is recorded as
**B26** rather than papered over — a CI runner would need a workspace-level cleanup step.

## 14. What this milestone does not establish

No WCAG conformance · no claim that the browser gate is CI-ready (B23 is open and would fail roughly one run in eight
on this host) · no root cause for the navigation stall · no change to the 30 s budget · no implementation of the B21
digest · no claim that any superseded injection summary is preserved · no assertion about Firefox, WebKit, screen
readers, or a non-headless run · no fix for B26.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD. B5 — reproducibility from a clean
checkout — remains the next substantive issue and is untouched here.

