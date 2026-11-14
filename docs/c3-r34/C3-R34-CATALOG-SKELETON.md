# C3-R34 — Minimal Catalog Application Skeleton

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local implementation, local verification. No commit, push, merge, pull request, workflow activation or
deployment. KCOE8006 FITMENT HOLD remains active.** This record contains no release evidence and claims no CI
attestation or publication authority.

## 1. Outcome

A four-file catalog application now exists at `apps/catalog` and builds with **Vite 7.3.7 alone**, producing
`apps/catalog/dist/index.html` plus one 1.2 kB script. Twelve new boundary tests assert the dependency,
import, DOM, asset and content constraints, and one of them performs a real build. Every Phase E gate passed
with exit code 0, and the only root change is a **pure-addition** lockfile update (1,127 insertions, 0
deletions).

| Phase | Result |
| --- | --- |
| A — baseline and corrections | **complete** — R33 hash, both HEADs, R26–R31 artifacts and staging drift all verified before any write |
| B — minimal application | **complete** — 4 files, accessibility-first placeholder, no data, no network |
| C — dependency boundaries | **complete with a measured cost** — root `node_modules` grew from 16 to 31 top-level entries (§5) |
| D — boundary tests | **complete** — 12/12 pass, plus 4 mutation probes proving the guards are not vacuous (§6) |
| E — regression | **complete** — 6 commands, all exit 0 (§7) |

## 2. Phase A — baseline recorded before any write

| Check | Command / source | Result |
| --- | --- | --- |
| C3-R33 record fingerprint | SHA-256 | `A175773CAF90DC8A89CC24F04071559F4117BD912211D2E8C112736F2FAE2DEA` — matches the reviewed value |
| Integration HEAD | `git rev-parse HEAD` | `ea67a032d94bf283ab458c45bc622e75f1a219f1` |
| Integration branch | `git branch --show-current` | `integration/c3-r25-ci-readiness` |
| Integration status | `git status --short` / `--untracked-files=all` | 21 entries / 44 entries, **nothing staged** |
| Parent worktree | `git -C F:\autolearnpro` | `ea67a03`, 30 / 39 entries — untouched throughout |
| R26–R28 artifacts | `docs/c3-r27/C3-R27-LINUX-RERUN-MANIFEST.json` | **7/7 MATCH**, no drift (recovery, reader, generation, target-policy, three test files) |
| R30 toolchain artifacts | recorded prefixes from C3-R30 §8 | package.json `b33b1db8bb9ac557` ✓, lockfile `aee38b5df3b732c9` ✓, guard `40d856d5941f9a18` ✓, test `8560d6e201106645` ✓ |
| R31 evidence module | SHA-256 prefix | `49c03288d21cee1c` — unchanged |
| Source staging drift | `node docs/c3-r25/verify-review.mjs` | **14/14 PASS**, including `staging-sources-match-review-fingerprints` — drift **0/7** |
| `packages/ui/README.md` wording | file read | recorded verbatim; it contained the false React claim |

Nothing in this milestone changed any of the above. The R25 verifier was re-run at the end and still returns
14/14 (§7).

## 3. Corrections applied in Phase A

### 3.1 `packages/ui/README.md` — the false React claim is gone

Replaced, with the correction stated in the file rather than silently swapped:

- **Was:** "The separate engineering staging workspace uses React with Vite, but that is not a decision
  recorded here…"
- **Now:** the staging workspace "does not use one either: it is Vite 7 with vanilla JavaScript ES modules and
  Three.js", the governing decision file is cited (`docs/c3-r33/…`), and the correction itself is dated to
  C3-R34 so a future reader sees that the earlier sentence was wrong, not merely edited.
- A second stale sentence was also false and was fixed in the same edit: the README said "Nothing in this
  repository currently builds a UI" — `apps/catalog` now does.
- The directory stays reserved. **No `packages/ui/package.json` was created** and no shared UI package exists.

### 3.2 C3-R33 record — additive clarification, decision unchanged

`docs/c3-r33/C3-R33-CATALOG-FRAMEWORK-DECISION.md` gained **§14**, which records the reviewer's three
qualifications: React does not remove headless testability (the cost is component-rendering test
infrastructure), `@vitejs/plugin-react` is conventional rather than mandatory, and the 8 / 3 / 1 comparison is
qualitative rather than a measured benchmark. Sections 1–13 are unmodified.

Because the file changed, **its SHA-256 is no longer** `A175773C…`:

| C3-R33 record | SHA-256 |
| --- | --- |
| reviewed version (Sections 1–13) | `A175773CAF90DC8A89CC24F04071559F4117BD912211D2E8C112736F2FAE2DEA` |
| current, with §14 appended | `47FF13443076CE310D40D6EE4127066C30AC1D4C149593D93BFFDD11DD8CB183` |

### 3.3 Defect found while correcting §3.1 (F-2)

The C3-R33 record described `packages/ui/README.md` as "tracked at `HEAD ea67a03`". **That is inaccurate.**
Measured now:

| Tree | `git ls-files packages/ui/README.md` | `git status` | File on disk |
| --- | --- | --- | --- |
| integration worktree | *(empty — not tracked)* | `?? packages/ui/README.md` | present |
| parent `F:\autolearnpro` | *(empty — not tracked)* | not listed | **absent** |

So the scaffold README is an **untracked local file**, and the parent worktree has no copy at all. Two
consequences worth stating plainly:

1. C3-R32 §1 called these "tracked placeholders" and this record's predecessor repeated the word "tracked".
   Neither is correct for the READMEs in this worktree.
2. `npm run validate:foundation` still passes because it requires the **directory** `packages/ui`, not the
   README — the directory exists in both trees. The README exists to satisfy git, and it is not satisfying git
   here. **This does not block C3-R34**; it does block any future CI job that assumes a clean checkout contains
   these files (§10, B5).


## 4. The skeleton

```
apps/catalog/
├── package.json      456 B   name/version/private/type/engines, one build script, two exact pins
├── index.html      4,555 B   accessible placeholder, inline styles, one local module
├── vite.config.js  1,391 B   root + outDir derived from import.meta.url, no plugins
└── src/
    └── main.js     1,697 B   the only DOM-touching module
```

### What the page says

The heading is "Catalog application skeleton", preceded by a notice: **"Local prototype — not a released
catalog."** Three explicit negatives follow, because a placeholder that only describes what it *is* invites the
reader to assume the rest:

- it is not a course catalog — no records are loaded;
- it is not build or release evidence — no generation, attestation or publication claim is made;
- it is not automotive data — no assembly, dimension or vehicle-application information is included.

The status line is a `<p role="status">` that reads "JavaScript has not started. If this text remains, the
entry module did not run." until the entry module replaces it. That gives the skeleton an honest failure mode
instead of a blank panel, and gives a future browser test a deterministic signal.

### What `src/main.js` does

It reads three elements and writes text with `textContent`, sets `data-catalog-shell="started"` on
`<html>`, and exposes `globalThis.__alpCatalogSkeleton` — a frozen object containing `started`, `module`,
`mode` (the Vite-substituted build mode), `catalogDataLoaded: false`, `recordCount: 0`, `networkUsed: false`
and `vehicleData: false`. This follows the staging studio's `window.__alpCatalog` precedent (C3-R33 §2.7): a
read-only handle carrying only values already rendered.

It imports **nothing**. There is no dataset to import, and inventing one would have been the one thing this
milestone must not do.

### Three deliberate omissions, stated rather than hidden

1. **No Three.js canvas.** C3-R34 authorization §B: defer scene rendering unless it materially improves the
   skeleton. It does not — a canvas with nothing in it proves nothing that the build already proves, and it
   would have required either a fabricated scene or a ported studio, both prohibited. `three@0.180.0` is
   declared exactly as required, and §9 records that the bundle therefore has no vendor chunk yet.
2. **No `src/lib/`.** C3-R33 D7 says pure decision modules live there; the skeleton makes no decisions, so the
   directory would be empty. D7 is instead enforced as a rule by test 9, which asserts that `src/main.js` is
   the *only* module touching platform globals.
3. **No sample courses.** Not even one, because a single invented record is the seed of a fake dataset.

## 5. Dependency boundary and the measured cost of it

| Item | Before | After |
| --- | --- | --- |
| `apps/catalog/package.json` | — | `dependencies: { three: 0.180.0 }`, `devDependencies: { vite: 7.3.7 }` |
| Root `package.json` | `AC8D0BEC1E87459B7C779ECA70F9FF0C7B021ECF0855F2D576ED09C9B9BFB4AD` | **identical** |
| Root `package-lock.json` | `2B756711CFCF6C1AA010DF2769661CA2E6276E431DAC9B953C4AB9F77CBB06E4` (6,209 B, 2 packages + 15 transitive) | `F805B6F77F392467BD583FC4605E633313E51B20E3A617F47B1DD99BDFE4FB92` (42,451 B) |
| Lockfile diff shape | — | **1,127 insertions, 0 deletions** — verified with `git diff -U0`; no existing entry was modified |
| Root `node_modules` | 16 entries (privileged service's `pg` tree only) | 31 entries |
| `npm ci` result | — | exit 0, "added 31 packages, and audited 34 packages in 4s", 0 vulnerabilities |
| `infrastructure/c3/build` package + lock | `b33b1db8bb9ac557` / `aee38b5df3b732c9` | **identical** — the isolated toolchain is untouched |
| `.gitignore` | — | **untouched**; `dist/` already matched at any depth, confirmed by `git check-ignore` inside test 11 |

**The cost, stated without softening:** the authorized change means the root install is no longer "the
privileged service and nothing else". `npm ci` now installs Vite and its transitive tree, so R32's "zero
dependencies" description of the foundation, and R30's argument that the root stays minimal, no longer hold
for the root install. They still hold for the *evidence* toolchain, which remains a separate package with its
own lockfile and without `esbuild` declared by the app.

This is a real trade, not a documentation detail. It is recorded as blocker **B1** in §10 and should be settled
before R36/R37 design any CI job around the install.

## 6. Phase D — the boundary tests

`tests/c3-catalog-skeleton.test.mjs` (14,938 B). Eleven tests are static inspection; test 11 runs a real build.

| # | Asserts |
| --- | --- |
| 1 | The manifest declares **exactly** `three@0.180.0` and `vite@7.3.7` — not "at least". Exact-pin format checked, `peerDependencies`/`optionalDependencies` must be absent, and `react`, `react-dom`, `@react-three/fiber`, `@react-three/drei`, `@vitejs/plugin-react`, `typescript`, `jsdom`, `esbuild` are each refused by name. Only one script exists: `build`. |
| 2 | The app's Vite pin **equals** the isolated R30 toolchain pin, so the two reviewed versions cannot drift apart silently. |
| 3 | The app is a valid workspace member; the root still declares `["apps/*","packages/*"]`, adds **no** dependency and **no** new script; the lockfile registers `apps/catalog` and still resolves `apps/web → pg 8.16.3`. |
| 4 | `vite.config.js` has **no** `plugins` array, no `plugin-react`/`babel`/`swc`/`typescript` reference, derives `outDir` from `import.meta.url` rather than `process.cwd()`, and sets `emptyOutDir` and `target: 'es2020'`. |
| 5 | Every import specifier in `src/` is relative, `three`, or `three/*`. Nothing else resolves. |
| 6 | No `node:` built-in, no `require()`, no `pg`, no `apps/web`, no `infrastructure/c3`, no `wrangler`, and no `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource`/`sendBeacon`/`importScripts` in browser code **or** in `index.html`. |
| 7 | No external `src`/`href`/`srcset`/`action`/`poster`; exactly one subresource (`./src/main.js`); no `<link>` element, no CSS `@import`, no remote `url()`, no remote URL literal in any source file. |
| 8 | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`/`eval`/`new Function`/inline `on*` attribute; the entry module writes with `textContent`. |
| 9 | **C3-R33 D7 enforced:** exactly one module touches `document`/`window`/`globalThis`/storage/`navigator`/`requestAnimationFrame`, and it is `src/main.js`. |
| 10 | No `KCOE8006`, `fitment`, `aut-NNN`, `caliper`, `rotor`, `asset-library`, `catalog-records` or `specs/` token in any app file; `package.json` is the only `.json` in the app; there is no `.glb`/`.gltf`/`.stl`/`.step` payload. |
| 11 | **A real build** runs twice: exit 0, `index.html` present, the two builds are **byte-identical**, nothing is emitted to the repository root, the JS bundle stays under 16 kB (proving no vendor chunk yet), the built document reaches no external origin and every `src` it references exists, and `git check-ignore` confirms `apps/catalog/dist/index.html` is ignored. |
| 12 | `npm run validate:foundation` still reports **13 directories** — the new app did not weaken it. |

### The guards are not vacuous — four mutation probes

A green suite proves nothing if the assertions cannot fail. Each probe injected a real violation, ran the
suite, and then restored the file:

| Probe | Injected | Test that caught it |
| --- | --- | --- |
| M1 | `const probe = fetch('/probe');` appended to `src/main.js` | **6** (network surface) |
| M2 | `const probe = document.body.innerHTML;` appended to `src/main.js` | **8** (unchecked HTML insertion) |
| M3 | `plugins: [],` injected into the `defineConfig({...})` of `vite.config.js` | **4** (no plugins) |
| M4 | `"vite": "7.3.7"` changed to `"vite": "7.1.0"` in `package.json` | **1 and 2** (approved set, toolchain pin) |

Every file was restored **byte-identically** — verified by comparing SHA-256 before and after each probe
(`apps/catalog/src/main.js` remained `04876DC917197177…`). The probes are evidence about the tests, not
artifacts left in the tree.

**What these tests do not prove:** that a catalog exists, that any automotive asset loads, that any page is
accessible in a browser (no Playwright or axe-core is installed in this repository), or that the app renders
correctly on a platform other than this Windows host.

## 7. Phase E — regression, with exit codes

Run from `F:\autolearnpro-c3-r25-integration`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm ci` | **0** | "added 31 packages, and audited 34 packages in 4s", 0 vulnerabilities |
| `npm run validate:foundation` | **0** | `Foundation 1 validated: 13 directories, isolated root manifest, no dependencies required.` |
| `npm run test:runtime` | **0** | 3 pass / 0 fail / 0 skipped |
| `node --test "tests/c3-*.test.mjs"` | **0** | **118 tests · 114 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run build --workspace @autolearnpro/catalog` | **0** | `✓ 4 modules transformed`, 2 files emitted, `✓ built in 80ms` |

## 8. Build evidence — local, and only local

| Artifact | Size | SHA-256 |
| --- | --- | --- |
| `apps/catalog/dist/index.html` | 4,483 B (gzip 1.73 kB) | `ce46c185bba36ccd78c54ac6930777d9655eb55e0a4fd18d9c25ad9c1d64d98a` |
| `apps/catalog/dist/assets/catalog-Bj3CNR8H.js` | 1,229 B (gzip 0.65 kB) | `47eff84e96a4d6964af257e54ec5e3cf32fe7d492d6c4d2b6d39d512d0d8676f` |

| Property | Result |
| --- | --- |
| Build command | `npm run build --workspace @autolearnpro/catalog` → `vite build`, exit **0** |
| Modules transformed | 4 |
| Build duration | 80 ms (89 ms on the first run) |
| Reproducibility | two consecutive clean builds produced **byte-identical** `index.html` and JS chunk, including the content-hashed filename |
| Output location | `apps/catalog/dist/` only — the repository root gained no `dist/` and no `assets/` |
| Committability | `git check-ignore apps/catalog/dist/index.html` succeeds: the existing `dist/` rule covers it, so **`.gitignore` needed no change** |
| Vendor chunk | **none** — the whole script is the application shell; Three.js is declared but not imported (§9) |

**This is not R22 offline evidence and must never be presented as such.** No `generationId`, no `pairId`, no
source snapshot digest, no commit claim and no attestation was produced. C3-R31's `verifyOfflineEvidence`
would reject these bytes as malformed evidence — correctly, because they are a build's output, not a record
about a build.

## 9. What this changes about the R22 input contract — concretely

C3-R33 §9 deferred the snapshot-root question (S1 vs S2) to R35. Building the app has now produced the
measurement that decision needs. Against `SOURCE_SNAPSHOT_INPUTS` and `SOURCE_SNAPSHOT_DIRS`:

| R22 input | At repository root | Inside `apps/catalog` |
| --- | --- | --- |
| `package.json` | present | **present** |
| `package-lock.json` | **present** (root workspace lock — apps have none) | absent |
| `vite.config.js` | absent | **present** |
| `catalog.html` | absent | absent |
| `index.html` | absent | **present** |
| `cloudflare/api/wrangler.jsonc` | absent | absent |
| `src/` | absent | **present** |
| `cloudflare/api/src/` | absent | absent |
| `lib/assets/` | absent | absent |

So: **7 of 9 inputs are still absent from the repository, and no single root prefix satisfies the contract.**
A pure S1 rebase would score 3 of 6 files and 1 of 3 directories, and would *still* fail — because the lockfile
it needs lives at the root while every other input would live in the app.

This is a genuine finding for R35, not a detail: the snapshot contract needs an explicit **root-and-app mapping**
(or the app needs its own lockfile, which a workspace app does not have), rather than one walked prefix. It
also confirms R30's conclusion — isolation was never the blocker; the missing build inputs were.

## 10. Remaining blockers before C3-R35

| # | Blocker | Why it matters |
| --- | --- | --- |
| **B1** | **Root install now contains a bundler.** `npm ci` moved root `node_modules` from 16 to 31 top-level entries because the app declares `vite`. | R32's "zero dependencies" framing and R30's minimal-root argument no longer describe the root install. Either accept it and restate the architecture, or build the app through `infrastructure/c3/build` and drop the app's `vite` devDependency. **This decision belongs before any CI job is designed around the install.** |
| **B2** | R22 snapshot root is unresolved, and now measurably unsatisfiable without a mapping (§9). | Blocks R36 (`buildOfflineEvidence` port) and R37 (CI evidence job). |
| **B3** | Generated-library data contract does not exist. | R35's stated scope. `apps/catalog` currently has no place to put it, deliberately. |
| **B4** | Worker bundle inputs undecided (`wrangler.jsonc` location, what esbuild bundles). | R35, then R36. Nothing in `apps/catalog` presumes an answer. |
| **B5** | **Scaffold READMEs are untracked (F-2).** `packages/ui/README.md` and its siblings exist only as local files; the parent worktree has none. | A clean checkout cannot reproduce them, so any CI job that assumes a clean tree fails for a reason unrelated to code. Fixing it requires a commit — prohibited today. |
| **B6** | All evidence is **Windows-only** (Node 22.23.1 / npm 10.9.8). | The new suite has never run on Linux; the symlink skips remain skips. |
| **B7** | No browser-level verification exists in this repository. | No Playwright, no axe-core, no screenshot harness. The skeleton's accessibility is asserted by construction and by static rules only — **not measured**. |
| **B8** | `three@0.180.0` is declared but **imported by nothing**. | Intentional (§4), and it will make the vendor chunk appear the moment the studio is ported. Stated so nobody reads the empty vendor chunk as a claim about 3D working. |

Unchanged external risks, restated so this record cannot be read as progress on them: the repository is public
with no branch protection and no SHA pinning; nothing here is deployed; **KCOE8006 FITMENT HOLD remains active**
and no catalog page may surface unverified fitment data.

## 11. Complete changed-file inventory with fingerprints

### Created — 6 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `apps/catalog/package.json` | 456 | `effd027830259cee7de19fca64b1def730c9cd325c9c1e6c5372a2b8840eaf29` |
| `apps/catalog/index.html` | 4,555 | `a1d340cc27c4edfc4c16715ee498884eb910f47f8580fe8f0278bb0fb9d612a0` |
| `apps/catalog/vite.config.js` | 1,391 | `47ed28141b710657b267d98e39dea5eb6ba7a5b1ce770aece8f8f6710919f820` |
| `apps/catalog/src/main.js` | 1,697 | `04876dc917197177a3c00982131f7d3b5d0bb64fdaddf563a80db5b230780974` |
| `tests/c3-catalog-skeleton.test.mjs` | 14,938 | `c424e12b5fc2853b98b2f26151c14982b2e35c4d153b2b33cd45c1c5a4545cc9` |
| `docs/c3-r34/C3-R34-CATALOG-SKELETON.md` | this file | reported with the handoff, not inside itself — writing this line would change it |

### Modified — 2 files, one of them authorised and one not previously possible

| Path | Tracked? | Before → after |
| --- | --- | --- |
| `package-lock.json` | **tracked** | `2B756711CFCF6C1A…` → `F805B6F77F392467BD583FC4605E633313E51B20E3A617F47B1DD99BDFE4FB92` — **pure additions**, 1,127 insertions / 0 deletions |
| `packages/ui/README.md` | **untracked** | `E5299DD94364B0D0…` → `7615127BFC014A3E…` — the false React claim and the stale "nothing builds a UI" claim corrected (§3.1) |
| `docs/c3-r33/C3-R33-CATALOG-FRAMEWORK-DECISION.md` | **untracked** | `A175773CAF90DC8A…` → `47FF13443076CE31…` — §14 appended, Sections 1–13 unmodified (§3.2) |

### Unchanged — verified by fingerprint, not by assumption

| Path | SHA-256 | Note |
| --- | --- | --- |
| `package.json` (root) | `ac8d0bec1e87459b7c779eca70f9ff0c7b021ecf0855f2d576ed09c9b9bfb4ad` | identical to its value at R30 |
| `.gitignore` | `42e74886568e6356f5751a5676b3f2a775ac8725f2c917fb04ce8af13687e485` | **not touched by R34**; its modification predates this milestone (R30's `!infrastructure/c3/build/` negation) |
| `infrastructure/c3/build/package.json` | `b33b1db8bb9ac557…` | matches R30 §8 |
| `infrastructure/c3/build/package-lock.json` | `aee38b5df3b732c9…` | matches R30 §8 |
| `infrastructure/c3/build/build-root-guard.mjs` | `40d856d5941f9a18…` | matches R30 §8 |
| `tests/c3-build-toolchain.test.mjs` | `8560d6e201106645…` | matches R30 §8 |
| `infrastructure/c3/build/offline-evidence-r22.mjs` | `49c03288d21cee1c…` | unchanged |
| `docs/c3-r27/C3-R27-LINUX-RERUN-MANIFEST.json` | `7738254859b9033d…` | unchanged |
| `docs/c3-r31/C3-R31-OFFLINE-EVIDENCE.md` | `095a874f6a093a63…` | unchanged |
| `docs/c3-r32/C3-R32-CATALOG-WORKER-ARCHITECTURE.md` | `6ddd697b128cc35f…` | unchanged |
| All 7 R27 transfer-manifest files | — | **7/7 MATCH** (re-verified in Phase A and unchanged since) |

No file under `src/`, `specs/`, `engineering/`, `supabase/`, `infrastructure/c3/library/`, `.github/` or
`infrastructure/cloudflare/` was created, modified or deleted. No dependency of any existing package changed.

## 12. Final Git state

| Item | Value |
| --- | --- |
| Branch | `integration/c3-r25-ci-readiness` |
| HEAD (integration) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` — unchanged |
| HEAD (parent `F:\autolearnpro`) | `ea67a03` — unchanged, 30 / 39 entries |
| Staged files | **0** |
| Modified tracked files | `.gitignore` (pre-existing, not touched here), `package-lock.json` (authorised) |
| Status entries, default grouping | **25** (was 21) |
| Status entries, `--untracked-files=all` | **51** (was 44) |
| Commits, pushes, merges, pull requests | **none** |
| Workflow activation, Cloudflare deploy, Supabase or R2 operations | **none** |
| Parent worktree writes | **none** |

## 13. Acceptance criteria

- [x] C3-R33 SHA-256 verified against the reviewed value before any write.
- [x] Both Git HEADs and statuses recorded before and after; parent worktree untouched.
- [x] R26–R31 artifacts verified unchanged (R27 7/7, R30 4/4 prefixes, R31 module).
- [x] Source staging manifest drift **0/7** (R25 verifier 14/14 before and after).
- [x] False React statement corrected, with the correction dated and attributed.
- [x] Reserved `packages/ui` kept reserved — no `package.json`, no shared UI package.
- [x] C3-R33 clarification added without editing the reviewed sections.
- [x] Four-file skeleton created: no data, no fitment content, no network, no CDN, no privileged import.
- [x] Exact pins only: `three@0.180.0`, `vite@7.3.7`; no plugins, no React, no TypeScript.
- [x] Root `package.json` byte-identical; lockfile change is pure additions; no unrelated entry altered.
- [x] `infrastructure/c3/build` package and lockfile untouched.
- [x] 12 boundary tests pass; 4 mutation probes prove they can fail; all probes restored byte-identically.
- [x] Build succeeds locally, output confined, reproducible, ignored by git.
- [x] Every Phase E command captured with exit code 0; foundation validation not weakened.
- [x] No commits, pushes, merges, PRs, workflow activation, deployment, Supabase or R2 operations.
- [x] Blockers B1–B8 recorded with the decisions they gate.

**Status: SKELETON IMPLEMENTED · LOCAL VERIFICATION PASSED · AWAITING INDEPENDENT REVIEW.** No production
integration. C3-R35 must not begin until **B1** and **B2** are decided, because both change what R35 would be
designing against.





