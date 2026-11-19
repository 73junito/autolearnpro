# C3-R36H.2 — Evidence Output Safety

**Milestone:** C3-R36H.2 — corrective, browser harness and documentation only
**Workspace:** `F:\autolearnpro-c3-r25-integration`
**Date:** 2026-11-04
**Status:** implemented and verified locally · awaiting independent review
**Finding addressed:** F-5 — the C3-R36H.1 browser harness could overwrite previously reviewed results without
explicit authorisation.

No application source, reviewed security contract, root manifest or lockfile was modified. No commit, push, merge,
pull request, workflow activation or deployment was performed.

## 1. Root cause

The C3-R36H.1 gate resolved its output directory with a silent default:

```js
const OUT = path.resolve(process.env.R36H_OUT ?? path.join(REPO, 'docs', 'c3-r36h1'));
```

Two distinct faults follow from that one line:

1. **A missing variable is not an error.** A caller who forgets the variable, or names it differently, is silently
   redirected to the reviewed evidence directory of the previous milestone.
2. **The write is not exclusive.** `fs.writeFileSync` truncates an existing `C3-R36H1-GATE-RESULTS.json`, so the
   reviewed artefact is replaced rather than refused.

The independent review hit fault 1 exactly: it set a differently named variable, the harness ignored it, and the
reviewed results JSON was regenerated.

## 2. The supported output variable

| Variable | Required | Meaning |
| --- | --- | --- |
| **`R36H2_OUT`** | **yes** | An existing, empty directory the caller owns. Results are written only here. |
| `R36H_PWCORE`, `R36H_AXE`, `R36H_BROWSER`, `R36H_DIST` | no | Unchanged from C3-R36H.1 (playwright-core, axe-core, browser executable, build to serve). |

`R36H2_OUT` has **no default anywhere in the program**. The following names are recognised as *mistakes* and are
reported by name instead of honoured: `R36H_OUT` (the C3-R36H.1 name), `R36H1_OUT`, `R36_OUT`, `R36H2_OUTPUT`,
`OUTPUT_DIR`.

```powershell
$env:R36H2_OUT = (New-Item -ItemType Directory -Path (Join-Path $env:TEMP "r36h2-$([guid]::NewGuid())")).FullName
node docs/c3-r36h2/tools/browser-gate.mjs
```

## 3. Corrective changes

All changes are in `docs/c3-r36h2/tools/`. The C3-R36H.1 gate (`fa358998…`) and its results are preserved
unmodified as evidence of F-5.

| Change | Refusal code / behaviour |
| --- | --- |
| `R36H2_OUT` is required; no default exists | `R36H2_OUTPUT_REQUIRED` |
| A mistyped/legacy variable is reported by name | `R36H2_OUTPUT_VARIABLE_MISNAMED` |
| Path must be absolute | `R36H2_OUTPUT_NOT_ABSOLUTE` |
| Directory must already exist | `R36H2_OUTPUT_MISSING` |
| Symlinked destination refused (`lstat` before `realpath`) | `R36H2_OUTPUT_SYMLINK` |
| Must be a directory, not a file | `R36H2_OUTPUT_NOT_DIRECTORY` |
| Inside the repository, only `docs/c3-r36h2/runs/<name>` is authorised | `R36H2_OUTPUT_FORBIDDEN` |
| Destination must be empty | `R36H2_OUTPUT_NOT_EMPTY` |
| Results and screenshots written with flag `wx` (exclusive create) | `R36H2_RESULT_WRITE_FAILED` |
| On any exception, only files this run created are deleted | `R36H2_HARNESS_EXCEPTION` |
| Output configuration is validated **before** the build check and before the browser launches | — |

Containment is judged on `fs.realpathSync`, so a junction cannot smuggle the write outside the authorised location;
the pre-existing `lstat` refuses the link itself.

The check logic carried over from C3-R36H.1 is unchanged: the twelve required checks, the aggregate verdict,
favicon classification, zero-violation axe gate, and the two `notTestable` checks excluded from the verdict.

## 4. Failure injection — 8/8, driver exit 0

`gate-negative-tests.mjs`, repeated from C3-R36H.1 against the new gate. Each case isolates one defect and asserts
both the exit code and the specific diagnostic.

| Case | Exit | `failed` | `reason` |
| --- | --- | --- | --- |
| clean (real catalog) | **0** | — | — |
| unexpected 404 | 1 | `consoleErrors, network` | `R36H2_REQUIRED_CHECK_FAILED:…` |
| uncaught page error | 1 | `noPageErrors` | `R36H2_REQUIRED_CHECK_FAILED:…` |
| unattributable console error | 1 | `consoleErrors` | `R36H2_REQUIRED_CHECK_FAILED:…` |
| axe WCAG A/AA violation | 1 | `axe` | `R36H2_REQUIRED_CHECK_FAILED:…` |
| layout failure at narrow viewport | 1 | `zoom200, narrowViewport` | `R36H2_REQUIRED_CHECK_FAILED:…` |
| missing build output | 1 | — | `R36H_DIST_NOT_BUILT` |
| browser launch failure | 1 | — | `R36H2_HARNESS_EXCEPTION` |

`ALL_EXPECTATIONS_MET=true`, driver exit **0**.

## 5. Output-safety suite — 10/10

`output-safety-tests.mjs`, all cases run on this host, exit **0**, `ALL_EXPECTATIONS_MET=true`.

| # | Case | Exit | Observed |
| --- | --- | --- | --- |
| 1 | no output configuration at all | 1 | `R36H2_OUTPUT_REQUIRED`, `written:false`, `docs/` listing unchanged |
| 2 | mistyped variable (the F-5 case) | 1 | `R36H2_OUTPUT_VARIABLE_MISNAMED` naming `R36H_OUT` |
| 3 | destination does not exist | 1 | `R36H2_OUTPUT_MISSING:<path>` |
| 4 | destination already occupied | 1 | `R36H2_OUTPUT_NOT_EMPTY`; planted file byte-identical afterwards |
| 5 | the reviewed C3-R36H.1 directory | 1 | `R36H2_OUTPUT_FORBIDDEN:docs/c3-r36h1` |
| 6 | the application source directory | 1 | `R36H2_OUTPUT_FORBIDDEN:apps/catalog` |
| 7 | a file instead of a directory | 1 | `R36H2_OUTPUT_NOT_DIRECTORY` |
| 8 | exception mid-run (browser cannot launch) | 1 | `R36H2_HARNESS_EXCEPTION`; only `gate-results.json` left, screenshots cleaned |
| 9 | clean run into a caller directory | **0** | exactly four files, `verdict.pass:true`, `output.exclusive:true` |
| 10 | C3-R36H.1 results after all of the above | — | byte-identical (`fe5e89a4…` before and after) |

### A branch that is retained but unexercised

Case 8 was originally written to occupy `gate-results.json` with a directory to force
`R36H2_RESULT_WRITE_FAILED`. That case **cannot be reached**: validation requires the destination to be empty before
the run, so a planted obstacle fails validation first (`R36H2_OUTPUT_NOT_EMPTY`). The branch is kept as defence in
depth, and it is recorded here as **not exercised by any test** rather than claimed as covered. Case 8 was rewritten
to exercise the reachable exception path (`R36H2_HARNESS_EXCEPTION`) with its artefact-cleanup assertion.

## 6. Clean run against the unchanged catalog

Run into the authorised in-repository location `docs/c3-r36h2/runs/run-1`, Chrome **156.0.8078.80**, headless,
temporary profile, `127.0.0.1` static server.

- Gate exit **0**, verdict `pass: true`, **12/12** required checks passed.
- `notTestable`: `keyboard`, `focusVisible` — excluded from the verdict, never counted as success.
- axe: 0 violations, 13 passes, 0 incomplete. `conformanceClaimed: false`.
- Requests: `/` 200, `/assets/catalog-Bj3CNR8H.js` 200, `/favicon.ico` 404 classified as a browser-initiated
  optional resource.

| Artefact | SHA-256 |
| --- | --- |
| `runs/run-1/gate-results.json` | `d604e7c86e95bb15e0cfbf7c588d9fed1848d7a122573fd6bef960703c587ad3` |
| `runs/run-1/gate-1280.png` | `78b1473946f7c87fafe69d49f6cc3ef89de23ecd4b6b7271c6174940dff5a11a` |
| `runs/run-1/gate-zoom200.png` | `d5f7bbcefb7a7dcd06179aea9b72baf85dde56d6d0f9fd1421e536bb8587e477` |
| `runs/run-1/gate-360.png` | `60f253e7309f1316eeed156e15f44043ccd3d3842836d10a1cce7aed717bee54` |


## 7. Finding F-6 — the results file is not byte-reproducible, and never was

Two consecutive clean runs into different directories were compared line by line. They differ in exactly two fields:

```
"origin": "http://127.0.0.1:59660"   →   "origin": "http://127.0.0.1:49968"
"directory": "…\\runs\\run-1"          →   "directory": "…\\runs\\run-2"
```

Both files are 4,975 bytes; digests `d604e7c8…` and `7160c6e5…`. The three screenshots are **byte-identical** across
both runs.

Consequences, stated plainly:

- The results JSON embeds an ephemeral port and an absolute output path, so **its SHA-256 can never be a stable
  evidence fingerprint**. Only the verdict, the check results and the screenshots are reproducible.
- This also means the C3-R36H.1 file overwritten during review would **not** have matched `1bee3799…` even if the
  reviewer had written to an isolated directory. The overwrite destroyed the bytes, but byte-equality was never
  achievable between two runs.

This is a format defect, not an application defect, and it is **not fixed here** — changing the persisted fields would
change reviewed evidence shape, which this milestone is not authorised to do. It is recorded as **B21** for a future
format decision.

## 8. Evidence preservation — what is and is not recoverable

| Artefact | State |
| --- | --- |
| C3-R36H.1 report, injection results, three screenshots, harness, driver | **unmodified** — `9b78e683…`, `c7e763bf…`, `78b14739…`, `d5f7bbce…`, `60f253e7…`, `fa358998…`, `19d7b460…` |
| `C3-R36H1-GATE-RESULTS.json` | **changed by the review run**: `1bee3799…` → `fe5e89a4…` (4,849 B, size unchanged) |
| Any copy of `1bee3799…` | **none found.** A recursive hash search of `%TEMP%` for `*GATE-RESULTS*.json` matched no file with that prefix; the file is untracked in Git, so no committed copy exists either. |

The original bytes are **not recoverable** and no restoration is proposed. The file at `fe5e89a4…` is preserved as-is
and is the artefact whose fingerprint the review recorded.

## 9. Two disclosures about this milestone's own execution

1. **I repeated the F-5 fault myself.** My first copy of the injection driver still pointed `OUT_ROOT` at
   `docs/c3-r36h1`, so running it wrote a **new** file, `C3-R36H2-FAILURE-INJECTION.json`, into the reviewed
   directory. It overwrote nothing. I removed it immediately and re-hashed the directory: all eight original files are
   byte-identical to their recorded fingerprints. The driver now writes to `docs/c3-r36h2`. The new **gate** refuses
   that destination (`R36H2_OUTPUT_FORBIDDEN`), but the injection **driver** is a separate program with no such
   guard — recorded as **B22**.
2. **Injection case 4 was flaky.** On its first execution the controller-race fixture timed out
   (`page.goto: Timeout 30000ms exceeded`), which the gate correctly reported as `R36H2_HARNESS_EXCEPTION`, exit 1.
   The case asserts a specific failed-check set, so it failed rather than passing on a different error. It passed on
   re-run. The fixture is timing-dependent and should be treated as such — recorded as **B23**.


## 10. Regression — all commands exit 0, run sequentially

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | 213 tests · 209 pass · 0 fail · 4 skip |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass |
| `npm run build --workspace @autolearnpro/catalog` | **0** | `dist/index.html` 4.48 kB, `catalog-Bj3CNR8H.js` 1.23 kB |

The four skips are the same Windows symlink cases as every prior milestone on this host. No test file was modified.

## 11. Changed-file inventory

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `docs/c3-r36h2/tools/browser-gate.mjs` | 22,520 | `a99b1d689c4400bd136232af177bc1ab3ae2eb1702da13580c0919b10a761b9f` |
| `docs/c3-r36h2/tools/output-safety-tests.mjs` | — | `ebd402d5a38ae6aa650d97d6b9b3830a9c9ad541f8417938968416c04b630f35` |
| `docs/c3-r36h2/tools/gate-negative-tests.mjs` | — | `65998772937b06d451596df8a74d5349e4d5a0a874865bf774fe486ee0823e64` |
| `docs/c3-r36h2/C3-R36H2-OUTPUT-SAFETY.json` | — | `cc9e261a2d158996e734ede5a702082e95f9b5ba4cc0c7b86c9316d83035e4f4` |
| `docs/c3-r36h2/C3-R36H2-FAILURE-INJECTION.json` | — | `9634b381b1ba19bdf3a85ed8f26456b89816e491eb058e1db0eacd4f8e2746eb` |
| `docs/c3-r36h2/C3-R36H2-EVIDENCE-OUTPUT-SAFETY.md` | this file | recorded in the handoff |
| `docs/c3-r36h2/runs/run-1/*` | 4 files | §6 |
| `docs/c3-r36h2/runs/run-2/*` | 4 files | §7 |

No existing file was modified. `docs/c3-r36h1/` contains exactly its original eight files.

## 12. Final Git state

| Item | Value |
| --- | --- |
| Integration HEAD | `ea67a03` |
| Parent HEAD | `ea67a03` |
| Staged files | 0 |
| Integration status | 43 default / 108 `--untracked-files=all` |
| Commits, pushes, merges, PRs, workflows, deployments | none |

## 13. Disposition

**F-5 closed.** The gate cannot write to reviewed evidence, cannot default anywhere, and names a mistyped variable.
Ten output-safety cases and eight injection cases pass, each with its own diagnostic, and the clean run still passes
12/12.

**New findings, none blocking:** **B21** (the results file embeds a port and a path, so its digest is not reproducible
— a format decision, not fixed here) · **B22** (the injection *driver* can still write into the reviewed directory;
only the gate is guarded) · **B23** (injection case 4 is timing-dependent).

**B7** remains closed under this gate. **B19** (no operable controls, so keyboard operability is `notTestable`) and
**B20** (Chromium-only, headless-only) are unchanged.

The item your review identified as more consequential — B5, reproducibility from a clean checkout — is not addressed
here.

## 14. What this milestone does not establish

No WCAG conformance · no claim that the reviewed C3-R36H.1 result bytes were preserved (they were not) · no claim that
the results JSON is reproducible · no fixing of B21/B22/B23 · no claim that a passing gate means a correct
application, only that twelve specific checks passed and could have failed.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

