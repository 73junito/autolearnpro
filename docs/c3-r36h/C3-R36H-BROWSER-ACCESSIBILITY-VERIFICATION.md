# C3-R36H — Local Browser and Accessibility Verification

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1`

**Local, isolated browser testing only. No application code changed, no dependency added to the root, no Windows
browser settings touched, no commit, no deployment. KCOE8006 FITMENT HOLD remains active.**

## 1. Outcome

The C3-R34 catalog skeleton was loaded in a real browser and checked against the fifteen required items. **All twelve
mechanically checkable items pass**, axe-core reports **0 violations / 13 passes / 0 incomplete**, and three screenshots
are preserved. Two items are honestly **vacuous rather than proven**, and no WCAG conformance is claimed.

| Group | Result |
| --- | --- |
| Page load, console errors, network | pass — 2 same-origin requests, 0 external, 0 errors |
| Semantics (headings, language, status) | pass — one `h1`, two `h2`, `lang="en"`, `role="status"` live text |
| Automated accessibility (axe WCAG 2.0/2.1 A+AA) | **0 violations**, 0 serious/critical, 13 passes, 0 incomplete |
| Zoom 200% / narrow viewport | pass — no horizontal overflow, essential content present |
| Content claims | pass — no fitment/production data; prototype identified in the rendered text |
| Keyboard / focus visibility | **vacuous** — see §6 |
| Build determinism | pass — two builds byte-identical |

## 2. Baseline

| Check | Value |
| --- | --- |
| HEAD | `ea67a03` — unchanged |
| Integration status | 40 default / 80 `--untracked-files=all`, **0 staged** |
| C3-R36G report | `8d213a4b181a2c01…` — matches |
| C3-R36G v2 manifest | `9f7106182f63c0bc…` — matches |
| Package-completeness record | `cdcbdc7b65a357c3…` — matches |
| Manifest generation tool | `d69c726c700dc131…` — matches |
| C3-R25 source drift | **0/7** — verifier 14/14 PASS |
| Catalog files | unchanged — `index.html` `a1d340cc…`, `vite.config.js` `47ed2814…`, `src/main.js` `04876dc9…`, `package.json` `effd0278…` |
| C3-R36G Linux result | 191 passed / 0 failed / 0 skipped (recorded in C3-R36G; the reviewer's independent log `independent-all-node22.log` is on Ubuntu) |

## 3. Environment

| Item | Value |
| --- | --- |
| Browser | **Google Chrome 156.0.8078.80** (Chromium), headless |
| Profile | a fresh `mkdtemp` directory per run, deleted afterwards — no system browser settings touched |
| Serving | Node `http` on `127.0.0.1` with an **ephemeral port**; loopback only; `cache-control: no-store` |
| Runner runtime | Node **v22.23.1** on Windows |
| `playwright-core` | 1.64.1, imported **by absolute path from `F:\autolearnpro-meshy-staging\node_modules`** — outside the authoritative root, nothing installed |
| `axe-core` | 4.14.0, loaded from the same external workspace |
| Root manifest / lockfile | **unmodified** — no dependency added anywhere in the repository |

**An environment finding, not an application finding:** the first attempt used the installed **Edge 156.0.4314.58**,
and `playwright-core` never completed its launch — the harness hung past 300 s and had to be killed. The rejection is
reproducible and is about the driver/browser pair, not the catalog. The harness now defaults to Chrome, passes an
explicit 30 s launch timeout, and records the browser version in its output, so a launch that never completes fails
instead of hanging.

## 4. The fifteen required checks

Command: `node docs/c3-r36h/tools/browser-verify.mjs` → **exit 0**.

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Catalog page loads | **pass** | title non-empty; `data-catalog-shell="started"` was awaited before any assertion |
| 2 | No uncaught JavaScript errors | **pass** | 0 `pageerror`, 0 console `error` events |
| 3 | No unexpected network requests | **pass** | exactly **2** requests: `/` and `/assets/catalog-Bj3CNR8H.js` |
| 4 | No third-party asset dependencies | **pass** | **0** requests outside the loopback origin |
| 5 | Meaningful heading hierarchy | **pass** | `h1` "Catalog application skeleton", then `h2` ×2; single `h1`, no skipped level |
| 6 | Document language declared | **pass** | `<html lang="en">` |
| 7 | Status messages accessible | **pass** | `#boot-status` has `role="status"` and live text "Catalog shell started (build mode: production). No catalog records are loaded." |
| 8 | Keyboard navigation works | **vacuous — pass with a caveat** | **0 focusable elements** exist; see §6 |
| 9 | Focus indicators visible | **declared, unexercised** | a `:focus-visible { outline: 0.1875rem solid … }` rule exists; nothing can receive focus to prove it |
| 10 | Contrast meets WCAG AA | **pass (automated)** | axe `color-contrast` among 13 passing rules; **no manual contrast measurement was made** |
| 11 | 200% zoom keeps essential content | **pass** | CSS viewport halved to 640×450: `h1`, `.notice` and the `dl` all have height, no horizontal overflow |
| 12 | Narrow viewport, no overflow | **pass** | at 360×640: `scrollWidth 360 / clientWidth 360` |
| 13 | No automotive fitment or production data | **pass** | rendered text matched none of `KCOE8006`, `fitment`, `caliper`, `rotor`, `aut-\d+` |
| 14 | Clearly identifies itself as a prototype | **pass** | rendered text contains both "Local prototype" and "not a released catalog" |
| 15 | Catalog build remains deterministic | **pass** | two consecutive builds byte-identical (§7) |

## 5. Console, network, and screenshot observations

```
requests:     2  →  "/" and "/assets/catalog-Bj3CNR8H.js"
external:     0
console errors: none
page errors:   none
```

The absence of third-party requests is structural, not incidental: the page carries **no `<link>` element**, styles are
inline, and the only script is the local module — which is what the C3-R34 test suite asserts statically. This run
confirms it dynamically.

Screenshots (full page, preserved as evidence):

| File | Viewport | SHA-256 |
| --- | --- | --- |
| `catalog-1280.png` | 1280×900 (reference) | `78b1473946f7c87f…` |
| `catalog-zoom200.png` | 640×450 (200% zoom simulation) | `d5f7bbcefb7a7dcd…` |
| `catalog-360.png` | 360×640 (narrow) | `60f253e7309f1316…` |

## 6. What the automated result does not cover

**Zero findings is not conformance.** axe-core reports nothing because the page is small and simple; it cannot judge
usability, and it explicitly did not evaluate anything it marked incomplete (there were **0** incomplete items here,
which is itself unsurprising for a page with no widgets).

Human-judgment items, stated rather than buried:

1. **There is nothing to navigate by keyboard.** The page has zero links, buttons or form fields, so items 8 and 9 are
   satisfied by *absence*. For a catalog that will eventually need course links, filters and pagination, this is a real
   accessibility gap waiting to happen — the C3-R34 skeleton cannot demonstrate keyboard operability because it has no
   operable controls. **No claim is made that keyboard navigation works in a way a user would recognise.**
2. **The focus indicator is declared but untested.** `:focus-visible` styling exists; with no focusable element, its
   visibility on screen is unproven.
3. **Zoom was approximated.** Halving the CSS viewport at a fixed window size is a reasonable stand-in for 200% zoom,
   but it is not the browser's own zoom mechanism, and text-only zoom was not exercised.
4. **One engine only.** Chromium 156. Firefox and WebKit were not run.
5. **Headless only.** No headed run, no real font rendering assertions, no screen-reader test. The screenshots show
   layout, not assistive-technology behaviour.
6. **Contrast is automated only.** No pixel measurement of the chosen palette was taken; axe computes contrast from
   computed styles, which is what the stylesheet declares.

## 7. Build determinism

Two consecutive `npm run build --workspace @autolearnpro/catalog` runs, both exit **0**:

| Artefact | Bytes | SHA-256 |
| --- | --- | --- |
| `dist/index.html` | 4,483 | `ce46c185bba36ccd78c54ac6930777d9655eb55e0a4fd18d9c25ad9c1d64d98a` |
| `dist/assets/catalog-Bj3CNR8H.js` | 1,229 | `47eff84e96a4d6964af257e54ec5e3cf32fe7d492d6c4d2b6d39d512d0d8676f` |

Both digests also match the values recorded in C3-R34 and C3-R36F, so the build has stayed byte-identical across five
milestones.

## 8. Separate observation — B17, the Linux durability string

Kept apart from the browser results, as instructed. Recorded by running the **existing, unmodified** R36C persistence
contract through the R36D rehearsal on Ubuntu under Node v22.23.4:

| Platform | Reported string |
| --- | --- |
| Windows (Node 24 / 22) | `file fsync only (directory fsync unsupported on this platform)` |
| **Linux (Node 22.23.4)** | **`file+directory fsync`** |

The corresponding evidence file is **byte-identical across platforms**: 1,231 B, SHA-256
`1f46a2570f91d44c9a0ff97e12a176b59575111cca452e57fb8b5b23f78f7804`, with snapshot `58d5eccc…` and bundle
`a955e25f…`.

So the platform difference is confined to *which flush the writer reports performing*; it does not alter the persisted
record. **B17 is now an observation rather than a gap** — the Linux branch was read from the contract itself, not
inferred from source.

## 9. C3 regression at this state

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | 213 tests · 209 pass · 0 fail · 4 skipped |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 PASS |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass / 0 fail |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files |

## 10. B7 and B17 dispositions

| Blocker | Before | Now |
| --- | --- | --- |
| **B7** — browser accessibility | Open | **Closed for the C3-R34 skeleton, with limits recorded.** Twelve checkable items pass in a real browser, axe reports 0 violations, screenshots preserved. Two items are vacuous (§6) and no WCAG conformance is asserted. |
| **B17** — Linux durability reporting | Open, narrow | **Closed as an observation** — the Linux string is `file+directory fsync`, with a byte-identical evidence file. |

| # | New item | Note |
| --- | --- | --- |
| **B19** | No operable controls to test | The skeleton has zero interactive elements, so keyboard operability and focus visibility cannot be demonstrated. This becomes testable — and required — when the catalog gains links, filters or pagination. |
| **B20** | Single engine, headless only | Chromium-only, headless-only. Firefox/WebKit and a screen reader remain unverified; Edge could not be driven by the available driver at all. |

## 11. Artefacts and fingerprints

### Created — 6 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `docs/c3-r36h/C3-R36H-BROWSER-ACCESSIBILITY-VERIFICATION.md` | this file | reported with the handoff, not inside itself |
| `docs/c3-r36h/C3-R36H-BROWSER-RESULTS.json` | full structured results | `77ed4c4100148064301798b35a5af492ab2ef0b130b8edddb30f024f4b8b7567` |
| `docs/c3-r36h/tools/browser-verify.mjs` | 12,400 | `6bc6a89ad2d606cf2cca87b19347857b42f73166d47c1f007d28d4d2aa84a452` |
| `docs/c3-r36h/catalog-1280.png` | screenshot | `78b1473946f7c87fafe69d49f6cc3ef89de23ecd4b6b7271c6174940dff5a11a` |
| `docs/c3-r36h/catalog-zoom200.png` | screenshot | `d5f7bbcefb7a7dcd06179aea9b72baf85dde56d6d0f9fd1421e536bb8587e477` |
| `docs/c3-r36h/catalog-360.png` | screenshot | `60f253e7309f1316eeed156e15f44043ccd3d3842836d10a1cce7aed717bee54` |

### Modified — none

No existing file was edited. The catalog sources, both root manifests, the lockfile, every reviewed C3 contract and
test suite, and the whole `docs/c3-r36g` set are byte-identical to their recorded values.

## 12. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **41** default / **86** `--untracked-files=all` (was 40 / 80 before this milestone) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, production, parent repo | **none touched** |
| KCOE8006 | FITMENT HOLD untouched |

## 13. Acceptance criteria

- [x] Baseline confirmed: HEAD, four R36G fingerprints, zero drift, catalog files unchanged, nothing staged (§2).
- [x] Existing browser used; temporary profile per run; localhost-only serving; no system settings changed (§3).
- [x] `playwright-core` and `axe-core` used from **outside** the authoritative root; root manifest and lockfile unmodified (§3).
- [x] All fifteen required checks reported, with the two vacuous items named as vacuous rather than passed (§4, §6).
- [x] Automated accessibility run and its limits stated; **no conformance claimed** (§6).
- [x] Console errors, network requests and third-party dependencies recorded (§5).
- [x] Screenshots captured at three viewports and fingerprinted (§5).
- [x] Build determinism re-verified and matched against four earlier milestones (§7).
- [x] Linux durability string recorded separately, from the unmodified contract (§8).
- [x] C3 regression re-run at this state: all five commands exit 0 (§9).
- [x] No application change, no contract change, no commit/push/merge/PR/workflow, no production change, KCOE8006 untouched (§11–§12).

**Status: BROWSER AND ACCESSIBILITY VERIFICATION COMPLETE FOR THE SKELETON · AWAITING INDEPENDENT REVIEW.** B7 closed
with recorded limits; B17 closed as an observation; B19 and B20 added. KCOE8006 FITMENT HOLD, GitHub and production
remain on HOLD.


