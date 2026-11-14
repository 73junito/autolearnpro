# C3-R33 — Catalog Framework Decision

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` (integration worktree), `HEAD ea67a03`
**Design decision only. No catalog code, no package changes, no manifests, no workflows, no commit, no push,
no deployment.** KCOE8006 remains on FITMENT HOLD; GitHub and production remain on HOLD.

Predecessor: `docs/c3-r32/C3-R32-CATALOG-WORKER-ARCHITECTURE.md` (accepted, Option B — separate `apps/catalog`).

## 1. Decision

**`apps/catalog` will be plain Vite + Three.js — native ES modules, no UI framework.** React + React Three
Fiber is **rejected for now**, not permanently: §7 records the exact conditions that would reopen it.

| # | Decision | Status |
| --- | --- | --- |
| **D1** | Catalog framework: Vite + Three.js, vanilla ES modules. No React, no Vue/Svelte, no TypeScript. | **decided** |
| **D2** | `apps/catalog` is a real npm workspace app (root glob `apps/*` already matches it) whose **only runtime dependency is `three`**, pinned exactly. | **decided** |
| **D3** | Bundler authority: `vite` is an exact-pinned *devDependency of the app*, at the same version the R30 toolchain pins (`7.3.7`). The app ships no bundler to runtime; `infrastructure/c3/build` is not merged into the app and remains the R22 evidence toolchain. A future test asserts the two version strings are equal. | **decided** |
| **D4** | `packages/ui` is **not** created for the catalog. It stays a README-only reserved path. | **decided** |
| **D5** | Dependency direction: `apps/catalog` may not import from `apps/web`. Shared logic moves to `packages/core` only when a second consumer exists. | **decided** |
| **D6** | Data enters the catalog as **data**, not as code imported into the Worker. The generated-library contract itself is deferred to R35. | **decided** |
| **D7** | Source invariant (inherited from the studio, made a rule): exactly one module per entry may touch the DOM; everything that decides *what is shown* is a pure module importable in bare Node. | **decided** |
| **D8** | TypeScript adoption | **not adopted** — recorded as a cost in §5.4, no toolchain added |

Nothing here is an implementation. No `apps/catalog` directory exists after this milestone, and the seven
absent R22 inputs stay absent.


## 2. Evidence base

Every line below was measured in the two trees, not assumed.

### 2.1 The studio that defines the requirement

| Fact | Measured value | How |
| --- | --- | --- |
| Application source files | **18** under `F:\autolearnpro-meshy-staging\src` | directory listing |
| Largest module | `src/assembly-studio.js` — **50,858 bytes** of imperative Three.js (renderer, `OrbitControls`, `GLTFLoader`, selection, isolation, exploded view) | file size |
| Pure logic modules | **60** `.mjs` under `lib/` (15 top-level plus subdirectories) | directory listing |
| JS/MJS files outside `node_modules` | **247** | directory walk |
| **TypeScript / JSX / TSX files** | **0** | `-Include *.ts,*.tsx,*.jsx,*.mts,*.cts`, excluding `node_modules`/`dist`/`engineering\build` |
| **React** | **absent** from `node_modules` | path test |
| Installed runtime | `three 0.180.0` (`^0.180.0` declared) | `node_modules/three/package.json` |
| Installed toolchain | `vite 7.3.7` (`^7.1.0` declared), `axe-core 4.14.0`, `playwright-core 1.64.1` | `node_modules/*/package.json` |
| Host | Node `v22.23.1`, npm `10.9.8` | `node --version` |

Runtime dependencies are `three` and `@modelcontextprotocol/sdk`; dev dependencies are `axe-core`,
`playwright-core`, `vite`. **There is no UI framework in the reference implementation.**

### 2.2 The build that already works

`vite.config.js` builds two HTML entries — `studio` (`index.html`) and `catalog` (`catalog.html`) — with
`manualChunks` splitting `three-core`, `three-addons` and `vendor`, `target: 'es2020'`, and an explicit
`chunkSizeWarningLimit: 560` documented as an intentional vendor-chunk budget. The shell (`src/main.js`) is
**3,026 bytes** and dynamic-imports the engine so first paint does not pay for Three.js.

That is the decisive shape: **the existing build treats Three.js as the only large vendor chunk and treats
the application shell as small hand-written ES modules.** Any framework choice has to fit inside that budget.

### 2.3 The tests that constrain the framework

`tests/assembly-interaction.test.mjs` imports `three` and `../src/assembly-model.js` **directly under
`node --test`, with no DOM, no jsdom, no bundler**. It builds a six-component `THREE.Group`, applies exploded
positions, highlighting and visibility, and measures from real vertex data. `src/geometry-measure.js` and
`src/presentation-orientation.js` are pure Three.js math with the same property.

No test file references `jsdom`, `vitest`, `jest`, `@testing-library` or `react` — the only `react` text
matches are unrelated words in `gp-b-supersession.test.mjs`. The suite is `node:test` + `node:assert/strict`
only, which is the same "no test framework dependency" property R32 §1 recorded for the authoritative
repository.

### 2.4 Accessibility evidence already exists

`tests/browser-catalog.test.mjs` and `tests/browser-instructor.test.mjs` inject `axe-core` and assert **zero
serious/critical WCAG 2.0/2.1 A/AA violations**, plus keyboard reachability. That works because the rendered
interface is ordinary HTML; the canvas is an addition, not the interface.

### 2.5 The isolation boundary this must not break

R30 pins the build toolchain to **exactly two packages**, `vite 7.3.7` and `esbuild 0.28.2`, installed with
`--ignore-scripts`, inside a package that has **no `scripts` block at all**, so nothing can execute on
install. Every additional dependency in the reviewed set is another thing to audit with no execution safety
net behind it.

### 2.6 The snapshot contract that must eventually hold

`infrastructure/c3/build/offline-evidence-r22.mjs` declares the fixed input list:

```
SOURCE_SNAPSHOT_INPUTS = package.json, package-lock.json, vite.config.js, catalog.html, index.html,
                         cloudflare/api/wrangler.jsonc
SOURCE_SNAPSHOT_DIRS   = src, cloudflare/api/src, lib/assets
```

`safeFiles` walks every file regardless of extension, so a `.jsx` tree would hash with no contract change —
**the snapshot contract is therefore not what decides the framework.** It decides only where the snapshot
root sits (§9).

### 2.7 The catalog is data, not a component tree

`specs/catalog/catalog-records.json` holds **68 courses**; `specs/catalog/alp-acf-framework.json` holds **16
competencies**; `specs/asset-library.json` holds **2 assets**. `src/catalog/catalog-app.js` renders these as
filter, list, pagination and detail panels through `src/catalog/render.js` (10,608 bytes) — string-returning
pure render functions plus one wiring module. The catalog is a **data view**, and the interaction surface is
filters and deep links, not nested component state.

### 2.8 Documentation defect found while collecting evidence (F-1)

`packages/ui/README.md` — tracked at `HEAD ea67a03` — states:

> "The separate engineering staging workspace uses React with Vite"

**That is false.** The staging workspace contains no React, no `.jsx`/`.tsx`/`.ts` file and no React
dependency; it uses Vite 7 with vanilla ES modules and Three.js (§2.1–2.2). The sentence exists to warn
against inheriting an unrecorded framework decision, and warning is right — but it warns about a decision
that was never made, and it would propagate the wrong premise straight into the milestone that has to decide.

I did **not** edit it: it is a tracked file and this milestone is design-only. Correction is proposed in §10
as the first action of C3-R34, with replacement wording given there.

## 3. Options against the criteria

Three options were compared. A fourth family — **Svelte / Vue / Lit** — was dismissed without a table entry:
none appears anywhere in either tree, none has a prototype here, and adopting one would be a bet with the same
migration cost as React and weaker 3D ecosystem support. Recording it as "considered and dismissed for lack of
any evidence base" is more honest than inventing a comparison nobody ran.

| Criterion | **A — Vite + Three.js (vanilla)** | **B — React + React Three Fiber** | **C — hybrid: React panels + vanilla canvas** |
| --- | --- | --- | --- |
| Preserves existing 50 KB interaction code | **direct reuse** — it is already imperative Three.js | **rewrite** — R3F re-expresses the scene as a component tree; `assembly-studio.js` has no equivalent translation | **partial** — canvas half reusable, panel half rewritten |
| Headless testability under bare `node --test` | **unchanged** — `src/assembly-model.js` already imports into Node with no DOM (§2.3) | **breaks** — components need a DOM renderer; `jsdom` + React test tooling become test dependencies | **half-breaks** — canvas logic stays testable, panel logic does not |
| Additions to the audited dependency set (R30) | **1 runtime (`three`), 0 build plugins** | **3+ runtime** (`react`, `react-dom`, reconciler surface) **+ 1 build plugin** (`@vitejs/plugin-react`, which brings the Babel/SWC transform chain) | **2 runtime + 1 build plugin** |
| Fits the R22 snapshot contract | **yes, unchanged** — same two HTML entries, same `src/` walk | yes (extension-agnostic walk) but `vite.config.js` now needs a plugin, so the snapshot's meaning of "the build" widens | yes, same widening |
| Bundle budget (`chunkSizeWarningLimit: 560`) | **already fits**; Three.js is the only large chunk | **adds a framework runtime** to the shell that is currently 3 KB | adds it to one entry |
| Accessibility evidence path | **unchanged** — axe-core on real HTML (§2.4) | unchanged for panels; canvas remains opaque to axe either way | unchanged |
| Fit for a 68-record filtered data view | **adequate** — the whole catalog view is `render.js`, 10.6 KB of string builders | **comfortable** — declarative lists/forms are React's strength | comfortable for the catalog, not for the studio |
| Fit for the 3D assembly interaction | **direct** — this is what the code already is | **good in principle** — declarative scene graph, `drei` helpers, but unproven here and requires the rewrite | **direct** |
| State management for scene + panels | one explicit state object (`lib/assembly-state.mjs`) plus events | idiomatic React state/hooks, at the cost of separating scene state from UI state | two state systems — the worst of both |
| New developer surface to learn | ES modules + Three.js (already in use) | ES modules + Three.js + JSX + hooks + R3F reconciler semantics | both |
| TypeScript | absent today (§2.1); would add `tsc` to the audited toolchain | commonly paired, but not required | same |
| Rendering path | HTML + canvas | HTML + canvas, via a reconciler | HTML + canvas |

**A is better on eight of the twelve criteria, tied on three — accessibility, TypeScript and the rendering
path — and worse on exactly one: the 68-record filtered data view, which React would handle more comfortably.**
B's other claimed win, the declarative scene graph, is real in principle but is only reachable here through a
rewrite of the 50 KB studio that does not exist. C is dominated: it pays B's dependency and testing costs to
rewrite the panel half while leaving the hard half unchanged, and it introduces two state systems for one
application.

## 4. Why A, stated as the four reasons that actually decided it

1. **There is no React to preserve, and there is Three.js code that works.** 0 `.jsx`/`.tsx`/`.ts` files and an
   absent `node_modules/react` (§2.1) mean B buys no continuity; 50,858 bytes of functioning imperative
   viewer (§2.1) mean A buys all of it. A framework decision that requires rewriting the only interactive
   code in the project — before a single line of the new app exists — is a rewrite disguised as a choice.
2. **A would keep the test strategy; B would replace it.** The repository's current strength is that scene
   logic is asserted in bare Node with no DOM (§2.3). Under R3F the equivalent assertions need a DOM
   renderer, which adds `jsdom`-class dependencies to a repo whose test story is deliberately `node --test`
   only — and adds them to the *failure-critical* path, not to a convenience path.
3. **A adds one audited dependency; B adds a plugin toolchain.** R30's whole argument is that the build
   surface should be two exact-pinned packages with `--ignore-scripts` and no install scripts (§2.5).
   `@vitejs/plugin-react` is not a single package: it pulls a transform chain, and it must be added to the
   set that is reviewed by digest. Vanilla Vite needs **no build plugin at all** — the existing
   `vite.config.js` proves it, since it configures nothing but `build`.
4. **The interaction surface is a data view, not a component tree.** 68 courses, 16 competencies, 2 assets,
   four filters, pagination, one detail panel (§2.7). That is `render.js`. React's advantage appears at
   dozens of stateful, interdependent, reusable components; the catalog has one state object and a handful
   of panels, and the studio's state already lives in `lib/assembly-state.mjs`.

## 5. The cost of A — what is genuinely given up

Recorded because a decision that lists only benefits is not a decision record.

### 5.1 No declarative scene graph

`assembly-studio.js` is 50 KB of imperative mutation; adding a component means adding code in a file that is
already the largest in the project. R3F's model — describe the scene, let the reconciler apply changes —
ages better as the scene grows. **Mitigation:** D7 forces the *decision* half out into pure modules, which is
why the file is 50 KB of wiring and 60 modules of logic today.

### 5.2 No ecosystem shortcuts

`@react-three/drei`, `leva`, and the wider R3F helper set are unavailable. Controls, gizmos, HTML-in-canvas
labels and debug panels are hand-written — as they already are (`component-inspector.js`,
`instructor/labels.js`). **Mitigation:** none beyond reuse of what exists.

### 5.3 Panels will eventually hurt

The catalog view is fine. An *authoring* surface — instructor editing, multi-step forms, drag reordering,
optimistic updates — is where hand-written DOM starts to cost more than a framework saves. If
`apps/classroom` or `apps/simulator` become real authoring apps, this decision is the one that will be
revisited (see §7, trigger T2).

### 5.4 No TypeScript

Not adopted here (D8). The 3D code benefits most from types, and no tree exists to migrate. **Cost:** the
`apps/catalog` type safety comes from tests and from contracts, not from the compiler. **Mitigation:** the
existing `lib/*.mjs` contract modules and the fixture suite. Adding `tsc` later is additive and does not
require revisiting D1.

## 6. Package boundaries (decided now, implemented in R34+)

| Boundary | Decision | Reason |
| --- | --- | --- |
| `apps/catalog` manifest | `"name": "@autolearnpro/catalog"`, `"private": true`, `"type": "module"`, no `scripts` that deploy or publish | mirrors `apps/web`; a workspace app with an auditable surface |
| Runtime dependency | `three` **exactly** pinned at the reviewed version (`0.180.0`, §2.1), not `^` | a caret range on a 3D engine silently changes rendering between installs, and the visual-regression harness would be the only detector |
| Build dependency | `vite` **exactly** `7.3.7`, equal to R30's pin (D3) | one bundler version reviewed once; a future test asserts equality so the two cannot drift |
| `esbuild` | **not** declared by the app | the app does not call a bundler API; only the R22 evidence toolchain does |
| Build plugins | **none** | §4, reason 3 |
| `packages/ui` | **not created** (D4) | one consumer is not a shared library; R32 §11 left this open and this closes it |
| `packages/core` | **not created**; candidate if catalog logic is needed by a Worker bundle | R35 decides the generated-data contract |
| `apps/web` imports | **forbidden** (D5) | `apps/web` carries `pg 8.16.3` and the privileged service; nothing public may depend on it |
| Worker imports | **forbidden** — the app may not import the Worker's modules, and the Worker may not import the app | preserves R32's filesystem-free Worker boundary |
| CDN / network at runtime | **forbidden** — no font, script or model fetched from a third-party origin | the offline-evidence contract exists to prove what was built; a CDN import makes the artifact a pointer, not the artifact |

## 7. Conditions that reopen this decision

A rejected option that can never return is not a decision, it is a prohibition. These are the triggers:

| Trigger | Condition | What happens |
| --- | --- | --- |
| **T1** | The catalog needs **more than ~15 independent stateful panels** or a form-editing surface with validation and undo | re-evaluate B for the *panel* layer only; the canvas half stays as it is |
| **T2** | `apps/classroom` or `apps/simulator` stop being README-only **and** need shared interactive UI | the framework question becomes a cross-app question and belongs to `packages/ui`, not to the catalog |
| **T3** | **SSR / crawler-visible** catalog pages become a requirement | neither A nor B is a solution as stated — this becomes a rendering-mode decision that outranks the framework |
| **T4** | The scene exceeds a maintainable size in imperative form (concretely: `assembly-studio.js` grows past ~75 KB, or a second studio is added) | re-evaluate B, measured against the actual rewritten prototype, not a projection |
| **T5** | The authoritative repository adopts React elsewhere for an unrelated reason | re-evaluate then, because the "no framework in the repo" argument would no longer hold |

None of T1–T5 is true today: `packages/ui` has no consumer, `apps/classroom` and `apps/simulator` are
README-only (R32 §1), and no framework exists anywhere in the authoritative tree.

## 8. Proposed `apps/catalog` layout (proposed, not created)

```
apps/catalog/
  package.json                 three (exact) · vite (exact 7.3.7) · no plugins · no scripts that deploy
  index.html                   the studio entry (multi-page, as the studio's vite.config.js already does)
  vite.config.js               build.target es2020 · manualChunks three-core / three-addons / vendor
  src/
    main.js                    the ONLY DOM wiring module for the studio entry (D7)
    lib/                       pure modules — must import in bare Node, no document/window access
```

**How D7 is verified rather than asserted:** a static test (R34) walks `src/lib/**` and fails the build if any
file references `document`, `window`, `navigator` or `requestAnimationFrame`, mirroring the existing precedent
in `tests/c3-offline-evidence.test.mjs`, which asserts a module contains no `writeFileSync`/`spawn` by scanning
its non-comment lines. The rule is then mechanically enforced, not a convention.

Filenames in this layout are the *staging* names on purpose: R22's snapshot contract already names
`index.html` and `vite.config.js`, so reusing them keeps the contract readable.

## 9. What this decision changes about R22's snapshot contract

The contract itself (`SOURCE_SNAPSHOT_INPUTS`, `SOURCE_SNAPSHOT_DIRS`) is **unchanged**. What changes is the
**root** the snapshot is taken over, and R32 §11 flagged that the current names assume a root-level app.

Two options, to be settled in **R35**, not here:

| Option | Shape | Consequence |
| --- | --- | --- |
| **S1 (recommended)** | snapshot root = `apps/catalog`, inputs re-based to `apps/catalog/package.json`, `apps/catalog/vite.config.js`, `apps/catalog/index.html`, … | the app becomes a self-contained evidence unit; the Worker snapshot stays separate so the two artifacts remain separately attributable |
| **S2** | keep root at the repository and keep root-level `index.html` / `catalog.html` / `vite.config.js` | preserves R22's names exactly, but recreates the monolithic root layout that R32 Option B was chosen to avoid |

S1 is recommended because mixing the catalog and the Worker into one snapshot root would produce one digest
for two artifacts, which is precisely the attribution loss that the catalog/Worker pair check exists to
prevent. **No file is moved in this milestone.**

## 10. Proposed first actions for C3-R34 (not executed here)

1. **Correct F-1** — replace the false sentence in `packages/ui/README.md` with wording that states the
   measured facts and points at this record:

   > "No UI framework has been adopted in this repository. The separate engineering staging workspace also
   > uses no UI framework: it is Vite 7 with vanilla ES modules and Three.js. The catalog framework decision
   > is recorded in `docs/c3-r33/C3-R33-CATALOG-FRAMEWORK-DECISION.md`; it must not be inherited implicitly by
   > copying a component out of the staging workspace."

2. Create `apps/catalog` as an empty-but-valid workspace app: manifest, `index.html`, `vite.config.js`,
   `src/main.js` — minimal UI, no 3D interaction yet, no assets.
3. Add the D7 static test and the D3 version-equality test.
4. Confirm `npm ci` at the root still resolves and still does not install a bundler into runtime paths.
5. Do **not** copy `src/assembly-studio.js` or any asset. Porting the studio is a later, separate milestone.

## 11. Risks and unresolved items

### Risks

1. **The decision is cheap now and expensive later.** Every month of catalog code written in vanilla DOM
   raises the cost of T1/T4 firing. The triggers in §7 are the only mitigation, and they are prose — not
   enforced by any test.
2. **Hand-written panels drift.** Four filter panels are fine; twenty are not. `render.js` is string
   concatenation, so HTML escaping correctness is a live concern the React option would have handled
   differently (React escapes by default; string builders do not). This is a **real** cost of A and belongs
   in the R34 review, not in a footnote here.
3. **Exact pins age.** `three 0.180.0` and `vite 7.3.7` exact pins mean upgrades are deliberate events —
   correct for provenance, and a maintenance burden nobody has estimated.
4. **The framework decision does not reduce the dominant risk.** R32 §11 item 3 still holds: the repository is
   public and unprotected. Nothing here changes that.
5. **KCOE8006 fitment data must not be surfaced.** The catalog is where unverified fitment would leak into a
   user-facing page. FITMENT HOLD survives this milestone and constrains R34's data choices.

### Unresolved (deliberately)

- Whether the catalog serves assets directly or via R2 — inherited from R32, prohibited today.
- Where the generated library JSON lives in the app (`apps/catalog/data/` vs a `specs/` equivalent) — R35.
- Whether the studio entry and the academic catalog entry stay in one app or become two entries in
  `apps/catalog` — R34, and it does not affect D1.
- Whether `apps/catalog` ever needs a runtime dependency beyond `three`.

## 12. Verification performed for this record

| Check | Result |
| --- | --- |
| Parent worktree `F:\autolearnpro` HEAD | `ea67a03` — unchanged |
| Integration worktree HEAD | `ea67a03` — unchanged |
| Integration status before writing | 1 modified (`.gitignore`), 43 untracked entries (`--untracked-files=all`) |
| Files created by this milestone | **1** — `docs/c3-r33/C3-R33-CATALOG-FRAMEWORK-DECISION.md` |
| Code, manifests, lockfiles, workflows, `.gitignore` touched | **none** |
| `apps/catalog` created | **no** |
| Commits, pushes, merges, deployments | **none** |
| Tests run | none required — no executable change was made |
| KCOE8006 | FITMENT HOLD, untouched |

## 13. Acceptance criteria

- [x] States one framework decision, and names the rejected alternative explicitly.
- [x] Every claim about existing code is measured, with the file and the value (§2).
- [x] Records the cost of the chosen option, including the escaping/drift risk a framework would have removed.
- [x] Defines the package boundaries R32 left open — `packages/ui` is decided **not** to be created.
- [x] Defines the conditions that would reopen the decision (§7), so the rejection is reversible by evidence.
- [x] Leaves R22's snapshot contract unchanged and defers the root question to R35 with a recommendation (§9).
- [x] Reports a documentation defect (F-1) found in a tracked file **without editing it** in a design-only milestone.
- [x] Creates no application code, no manifest, no workflow, no artifact, no commit.

**Status: DECISION RECORDED · NOT IMPLEMENTED · AWAITING REVIEW.** C3-R34 may begin only after this record is
accepted. GitHub and production remain on HOLD; KCOE8006 FITMENT HOLD remains in force.

## 14. C3-R34 clarification of review qualifications

Added 2026-11-04 under the C3-R34 authorization. **Sections 1–13 above are the reviewed text and are
unmodified**; this section is additive, so the file's SHA-256 changed while its decision did not. The reviewer
accepted the framework and package boundaries with three qualifications, recorded here verbatim in substance.

### Q1 — React does not remove headless testability

§4 reason 2 overstates the case. React does **not** prevent pure scene and business logic from being tested
under bare Node — a pure module stays pure regardless of who renders it, and React itself has no runtime
dependency on a DOM. The accurate statement is narrower and is the one that decided the milestone: the
*component layer* would need DOM-rendering test infrastructure (`jsdom`-class dependencies, a React test
renderer) added to a suite that today is `node:test` only. The disadvantage is the **additional test
infrastructure**, not testability.

### Q2 — `@vitejs/plugin-react` is conventional, not mandatory

§3 and §4 reason 3 present the plugin as inseparable from React with Vite. It is not: Vite can transform JSX
through its built-in esbuild options, and the plugin is the *conventional* integration (Fast Refresh, Babel
transform, automatic runtime) rather than a hard requirement. The reason 3 argument survives in its measured
form — the conventional React integration adds a plugin and a transform chain to the audited build set, while
vanilla Vite needs none — but "React requires a plugin" is not a claim this record should make. It does not
change D1.

### Q3 — the 8 / 3 / 1 comparison is qualitative

The summary in §3 (better on eight criteria, tied on three, worse on one) is a **qualitative assessment of a
reasoned comparison table**, not a measured performance benchmark. No timing, bundle-size or complexity
measurement was taken; nothing in this record should be cited as one. The only independently measurable claims
here are the inventory facts in §2 and the counts in §12.

**Decision unchanged: D1–D8 stand as accepted.**





