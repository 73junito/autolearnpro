# C3-R36H.1 — Browser Verification Gate Remediation

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · `HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1`

**Harness and documentation only. No application source changed, no root manifest or lockfile touched, no commit, no
deployment. The C3-R36H report and its saved results are preserved byte-identically as evidence of the defect.**

## 1. F-4 confirmed — and it was worse than the report said

The reviewer's finding is correct, and while diagnosing it I found a second, independent defect in the same harness:

| # | Defect in `docs/c3-r36h/tools/browser-verify.mjs` | Effect |
| --- | --- | --- |
| **1** | **No aggregate verdict and no exit code from results.** A failed check only appeared inside the JSON. | A run with `noUncaughtErrors.ok: false` still exited **0**. The gate could not fail. |
| **2** | **Console errors were sampled before the browser finished asking for optional resources.** The check ran immediately after `catalogShell === 'started'`; Chrome's `/favicon.ico` request arrives *after* the load event. | The same page produced "0 console errors" in my run and "1 console error" in the reviewer's. A timing-dependent gate is worse than a strict one, because it looks green at random. |

Both are defects of the **verification mechanism**. Neither is evidence of an application defect, and this record does
not claim otherwise.

## 2. Root cause of the 404 — identified, not assumed

Reproduced with a diagnostic run that logged the server, the page's requests, and the responses:

```
SERVER_REQ GET /
RESP 200 document http://127.0.0.1:49680/
SERVER_REQ GET /assets/catalog-Bj3CNR8H.js
RESP 200 script  http://127.0.0.1:49680/assets/catalog-Bj3CNR8H.js
SERVER_REQ GET /favicon.ico
SERVER_404 /favicon.ico
CONSOLE error: Failed to load resource: the server responded with a status of 404 (Not Found)
```

**It is a browser-initiated optional resource, not an application request.** Chrome asks for `/favicon.ico` on its own;
the catalog neither declares nor needs one; the harness's static server has no file to return.

Crucially, **`page.on('request')` never reports it** — the fetch is made outside the page context, so the harness's
existing request capture saw only two requests and could not attribute the console message at all. The **server-side
log is the only authoritative observer**, which is why the corrected gate records every request in the server handler.

Classification, stated explicitly rather than suppressed:

```
optionalBrowserResources: [{ path: "/favicon.ico", status: 404, classification: "browser-initiated optional resource" }]
consoleErrors: { status: "pass", attributedTo: ["/favicon.ico (404)"] }
```

A `resource-load` console error is admitted **only** when the *only* 4xx/5xx the server itself answered was a listed
optional resource. Every other 404 fails the gate — proven by case 2 in §4.

## 3. Corrective changes, exactly

New files under `docs/c3-r36h1/tools/`; the C3-R36H harness is untouched at `6bc6a89a…`.

| Change | Detail |
| --- | --- |
| Explicit required-check list | `REQUIRED` names twelve checks that must pass; `NOT_TESTABLE` names keyboard and focus visibility |
| Aggregate verdict | `verdictFor()` returns `{ pass, requiredCount, passed[], failed[], notTestable[] }`, and `exitCode` is `pass ? 0 : 1` |
| Exit codes for infrastructure failures | missing build → `R36H_DIST_NOT_BUILT` (1); launch/anything thrown → `R36H1_HARNESS_EXCEPTION` (1); results that cannot be written → 1; uncaught rejection → 1 |
| Response/failed-request capture | `page.on('response')` and `page.on('requestfailed')`, **plus a server-side request log** for browser-initiated fetches |
| Attribution, not suppression | a console `resource-load` error passes only when every 4xx/5xx the server answered is a **listed** optional resource; `attributedTo` is recorded |
| Settle window | 750 ms after the load event, so an optional-resource request cannot be missed by timing |
| axe gate strengthened | fails on **any** violation of any impact (`violations.length === 0`), not only serious/critical; `incomplete` recorded separately as "needs human judgment, not a pass" |
| `notTestable` semantics | keyboard and focus visibility report `status: "notTestable"` with `ok: null`; they are excluded from the verdict and never counted as accessibility success |
| Explicit no-conformance statement | `conformanceClaimed: false` in every result, plus the contrast note distinguishing automated checks from manual inspection |

## 4. Failure injection — the repaired gate can fail

`docs/c3-r36h1/tools/gate-negative-tests.mjs` builds a fixture per case, runs the gate as a child process, and asserts
**both** the exit code and the specific diagnostic. Driver exit **0**, `ALL_EXPECTATIONS_MET=true`:

| # | Injected defect | Exit | `verdict.failed` | Matches expectation |
| --- | --- | --- | --- | --- |
| 1 | none — the real catalog build | **0** | *(none)* | ✅ clean run stays green |
| 2 | 404 on `/missing-resource.js` | **1** | `consoleErrors, network` | ✅ |
| 3 | uncaught page error | **1** | `noPageErrors` | ✅ |
| 4 | `console.error()` with no attributable resource | **1** | `consoleErrors` | ✅ |
| 5 | WCAG A/AA violation (image without alt text) | **1** | `axe` | ✅ |
| 6 | layout failure at 360 px | **1** | `zoom200, narrowViewport` | ✅ |
| 7 | missing build output | **1** | — (`R36H_DIST_NOT_BUILT`) | ✅ |
| 8 | browser executable absent | **1** | — (`R36H1_HARNESS_EXCEPTION`) | ✅ |

Three things this exercise taught, recorded rather than tidied away:

1. **My first axe fixture proved nothing.** I used `region` (content outside a landmark) expecting a moderate-impact
   violation. It produced **zero** findings, because `region` is an axe **best-practice** rule and the gate's
   `runOnly` filter is WCAG A/AA. The replacement — an image without `alt` — is a genuine WCAG 1.1.1 failure and does
   fail the gate.
2. **A `data:` URI image stalled the page load event** in this browser build (30 s timeout). The fixture now serves a
   real 1×1 PNG from the harness's own server, which is also closer to a real page.
3. Because of (1), the **impact-threshold** change is real in code (`any violation` instead of `serious||critical`)
   but its practical footprint in this rule set is small: across every fixture I could construct, the reachable WCAG
   A/AA violations are serious or critical. The gate is no longer blind to a lower-impact finding; I did not
   manufacture one to prove it.

## 5. Re-run against the unchanged catalog

`node docs/c3-r36h1/tools/browser-gate.mjs` → **exit 0**

| Field | Value |
| --- | --- |
| Browser | Chrome **156.0.8078.80**, headless, temporary profile deleted after the run |
| Required checks | **12 / 12 passed** |
| `notTestable` | `keyboard`, `focusVisible` — excluded, never counted as success |
| axe | **0 violations**, 13 passes, 0 incomplete |
| Server log | `/` = 200, `/assets/catalog-Bj3CNR8H.js` = 200, `/favicon.ico` = **404 (classified)** |
| Console errors | 1, attributed to `/favicon.ico (404)` |
| Layout | 200% zoom proxy: no overflow, essentials present; 360 px: `scrollWidth 360 / clientWidth 360` |
| Verdict | `pass: true`, `exitCode: 0`, `reason: null` |

**The three gate screenshots are byte-identical to the C3-R36H ones** (`78b14739…`, `d5f7bbce…`, `60f253e7…`), even
though they were captured by a different harness in a different process — independent corroboration that the rendering
itself is deterministic and unchanged by this milestone.

## 6. C3 regression at this state

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | 213 tests · 209 pass · 0 fail · 4 skipped |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass / 0 fail |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files |

## 7. Artefacts and fingerprints

### Created — 6 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `docs/c3-r36h1/C3-R36H1-BROWSER-GATE-REMEDIATION.md` | this file | reported with the handoff, not inside itself |
| `docs/c3-r36h1/tools/browser-gate.mjs` | 18,478 | `fa358998a799f4ce78ef284d5ad827fb59491a0c836fe5b37886fd1bb530b213` |
| `docs/c3-r36h1/tools/gate-negative-tests.mjs` | failure-injection driver | `19d7b460f872129dbc802ade9ccad0bc60bc172a0556d105f8e18fcef621f4c9` |
| `docs/c3-r36h1/C3-R36H1-GATE-RESULTS.json` | clean-run verdict | `1bee3799fc1bbcd1bf10697deaa2036337a4431dbb4e7c0aead1ff53a6c59e54` |
| `docs/c3-r36h1/C3-R36H1-FAILURE-INJECTION.json` | 8 cases | `c7e763bf08dc4a0f7793402c0e0ebf36cdf841b80bec4513c4bc5e80523f3324` |
| `docs/c3-r36h1/gate-{1280,zoom200,360}.png` | screenshots | `78b14739…`, `d5f7bbce…`, `60f253e7…` — identical to C3-R36H |

### Unchanged — verified by fingerprint

| Path | SHA-256 |
| --- | --- |
| `docs/c3-r36h/C3-R36H-BROWSER-ACCESSIBILITY-VERIFICATION.md` | `b6cec519659b8144…` |
| `docs/c3-r36h/C3-R36H-BROWSER-RESULTS.json` | `77ed4c4100148064…` |
| `docs/c3-r36h/tools/browser-verify.mjs` | `6bc6a89ad2d606cf…` |
| `docs/c3-r36h/catalog-*.png` (3) | `78b14739…`, `d5f7bbce…`, `60f253e7…` |

The defective harness and its results remain in place, unmodified: they are the historical evidence of F-4, and deleting
or repairing them would erase the record of how the defect was found.

No application file, contract, test suite, root manifest or lockfile was modified.

## 8. Dispositions

| Item | Before | Now |
| --- | --- | --- |
| **F-4** — gate cannot fail | Open, correction required | **Closed.** Every required check now contributes to an aggregate verdict, and eight injected defects each produce exit 1 with the named diagnostic. |
| **B7** — skeleton accessibility | Conditional pending F-4 | **Closed for the skeleton**, under a gate that can actually fail. Limits unchanged: two checks are `notTestable`, one engine, headless, no conformance claim. |
| **B19** — no operable controls | Open | **Open, unchanged** — the skeleton still has no focusable element; keyboard operability becomes testable when the catalog gains links or filters. |
| **B20** — cross-browser / screen reader | Open | **Open, unchanged.** Also note: Edge still cannot be driven by the available playwright-core build. |

One new observation, not a blocker: the favicon 404 is a *harness environment* artefact (no favicon served), not a
catalog defect. Should the catalog ever ship a favicon, the classification entry becomes obsolete but stays harmless.

## 9. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **42** default / **94** `--untracked-files=all` (was 41 / 86 before this milestone) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, production, parent repo | **none touched** |
| KCOE8006 | FITMENT HOLD untouched |

## 10. Acceptance criteria

- [x] The six C3-R36H fingerprints verified before any change; that report, its results and its harness preserved unmodified (§7).
- [x] The 404 reproduced with URL, status and initiator; identified as a browser-initiated optional resource and classified by name — not suppressed broadly (§2, §4 case 2).
- [x] Aggregate verdict added; exit 1 for a failed check, a launch failure, a missing build, an unexpected exception, or unwritable results (§3).
- [x] Keyboard and focus visibility recorded as `notTestable`, excluded from the verdict, never counted as success (§3, §5).
- [x] axe gate now requires zero violations of any impact; incomplete evaluations recorded separately; no conformance claimed (§3).
- [x] Eight failure-injection cases each produce the expected diagnostic **and** a nonzero exit; the clean case stays 0 (§4).
- [x] Clean re-run against the unchanged catalog: 12/12 required checks pass, exit 0 (§5).
- [x] C3, foundation, runtime and catalog-build regressions re-run sequentially: all exit 0 (§6).
- [x] No application change, no contract change, no commit/push/merge/PR/workflow, no production change, KCOE8006 untouched (§7–§9).

**Status: BROWSER GATE REPAIRED AND PROVEN ABLE TO FAIL · AWAITING INDEPENDENT REVIEW.** F-4 closed, B7 closed under the
repaired gate; B19 and B20 remain open. KCOE8006 FITMENT HOLD, GitHub and production remain on HOLD.


