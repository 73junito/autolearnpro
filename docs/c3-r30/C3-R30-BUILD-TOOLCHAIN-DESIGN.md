# C3-R30 — Build Toolchain Isolation and R22 Readiness

Date: 2026-11-04 · Local only. **C3-R22 is not ported.** No commit, push, PR, workflow or deployment.

## 1. Outcome

The isolated-toolchain architecture **is compatible** and was prototyped. The authoritative root manifest and
lockfile are byte-identical before and after every install. One **blocking defect** was found in the proposed
layout and fixed: the root `.gitignore` contains `build/`, which made the entire
`infrastructure/c3/build/` package **invisible to git** — `git status` reported nothing, so none of this
milestone's files could ever have been committed.

## 2. Phase A — dependency architecture assessment

| # | Question | Answer | Evidence |
| --- | --- | --- | --- |
| 1 | Can an independent manifest + lockfile isolate vite/esbuild? | **Yes** | `npm prefix` and `npm root` both resolve inside `build/`; 14 packages landed in `build/node_modules`; root `node_modules` contains neither `vite` nor `esbuild` |
| 2 | Do root workspace settings interfere? | **No** | root `workspaces` is `["apps/*","packages/*"]`; `infrastructure/c3/build` matches neither glob; npm treats `build/` as its own project root |
| 3 | Are Node 22 and the chosen versions compatible? | **Yes** | Node 22.23.1; `vite@7.3.7` engines `^20.19.0 \|\| >=22.12.0`; `esbuild@0.28.2` engines `>=18`; the package declares `>=22.12.0 <23` |
| 4 | Reproducible under `npm ci`? | **Yes** | `node_modules` deleted, then `npm ci --ignore-scripts` **exit 0 in 2.5 s**, restoring `vite 7.3.7` and `esbuild 0.28.2`; `lockfileVersion: 3`, 64 packages |
| 5 | How does CI install without touching root dependencies? | separate step: `cd infrastructure/c3/build && npm ci --ignore-scripts` | no `-w` flag, no workspace syntax, no root install; the root `npm ci` keeps installing only root + workspace deps |
| 6 | Exact reviewed versions | `vite 7.3.7`, `esbuild 0.28.2` | the versions **actually resolved** in the reviewed staging workspace |

### Finding: `esbuild` is undeclared in staging

Staging's `package.json` declares only `vite: ^7.1.0` (plus `axe-core`, `playwright-core`), yet
`build-evidence-r22.mjs` imports `esbuild` **directly** at line 9. It resolves today only because `vite`
depends on it. A `vite` upgrade could change or remove it and R22 would fail at import with no manifest change
to blame. The isolated package therefore **declares `esbuild` explicitly and pins it exactly** — a correction,
not a copy of the staging manifest.

### Two smaller decisions

- **No `scripts` block at all** in the tool package. Nothing can run on install, and there is no
  deploy/publish surface to audit.
- **`--ignore-scripts` everywhere.** `esbuild` gets its platform binary from `optionalDependencies`, so no
  lifecycle script is needed; refusing all of them keeps the install reviewable.

## 3. Phase C — prototype verification

| Requirement | Result |
| --- | --- |
| 1. Dependencies install in the build-only package | **PASS** — `npm install --ignore-scripts`, exit 0, 14 packages |
| 2. Authoritative root manifest and lockfile unchanged | **PASS** — `package.json ac8d0bec1e87459b…`, `package-lock.json 2b756711cfcf6c1a…` identical before and after install *and* after `npm ci` |
| 3. Existing foundation and runtime tests still pass | **PASS** — see §7 |
| 4. No dependency imported into Worker request paths | **PASS** — 0 matches for `c3/library` / build tooling in `infrastructure/cloudflare/*` and `apps/web/src/*` |
| 5. No write to real staging or production targets | **PASS** — no build script exists; the guard only accepts an authorised *temporary* policy |
| 6. No deployment or publication capability | **PASS** — no scripts, no `wrangler`/`cloudflare` dependency (asserted by test 3) |
| 7. Lockfile and versions reproducible | **PASS** — `npm ci` from the lockfile, §2 row 4 |

**No fake catalog or Worker build was created.** No R22 evidence was produced, real or simulated.

## 4. Phase B — R22 compatibility analysis

### Static imports

| Import | Kind | Consequence for this repository |
| --- | --- | --- |
| `vite` (`build`) | **heavy, static** | requires the isolated toolchain; cannot live in the root project |
| `esbuild` (`build`) | **heavy, static** | idem, and undeclared in staging (§2) |
| `node:fs`, `node:path`, `node:os`, `node:crypto`, `node:url` | builtin | portable |
| `./library-pair-reader.mjs`, `./library-generation-r20.mjs`, `./build-provenance-r21.mjs` | local | all three already ported in `infrastructure/c3/library/`, but their signatures changed (R27/R28/R29 now require `allowedTargets` / `policy`) |

### The `HERE` root guard

```js
const HERE = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));   // line 13
if (root !== HERE || !inside(temp, out) || inside(root, out)) throw Error('R22_ROOT_NOT_ALLOWED');  // line 48
```

`HERE` is not a convenience constant — it is the **enforced** root. From `lib/assets/x.mjs`, `'../../'`
resolves to `<repo>/lib`, so `HERE` is the `lib` directory, not the repository root, and `root !== HERE`
compares the caller's root against that. Any relocation changes the depth and the guard rejects the real
repository. **It must not be deleted** — it is the thing that stops an arbitrary directory being built.

### Entry points and output paths

| Path | Role | Exists in `F:\autolearnpro`? |
| --- | --- | --- |
| `vite.config.js` | Vite config, `root` = repo root | **no** |
| `catalog.html` / `index.html` | Vite inputs | **no** |
| `cloudflare/api/src/index.js` | esbuild entry | **no** |
| `cloudflare/api/wrangler.jsonc` | snapshot input | **no** |
| `src/`, `cloudflare/api/src/`, `lib/assets/` | snapshot folders | **no** |
| `generations/`, `catalog/`, `worker/`, `offline-evidence.json` | outputs under `outputRoot` | n/a (temp only) |

Measured with the guard's read-only inspector against the authoritative repository:

```
reason : R30_BUILD_INPUTS_MISSING
missing: vite.config.js | catalog.html | index.html | cloudflare/api/wrangler.jsonc
         | src/ | cloudflare/api/src/ | lib/assets/
```

**7 of 9 required inputs are absent.** R22 cannot build this repository today, and no amount of dependency
work changes that. Porting it now would produce a module that always fails at `R22_SOURCE_MISSING`.

### Hashing, writes, cleanup

- **Hashing**: `artifactDigest` walks an output directory, rejects symlinks/non-regular files, hashes each
  file and folds a sorted manifest into one digest. `sourceSnapshot` requires six named files plus three
  folders. Both are sound and reusable as-is.
- **Writes**: only under `outputRoot` — `generations/`, `catalog/`, `worker/`, `offline-evidence.json`
  (opened `wx`). It also requires `outputRoot` to be **empty** and refuses `outputRoot` inside the source root.
- **Cleanup**: **none**. R22 leaves the whole output tree behind. Any port must add cleanup or explicitly
  document that the temp tree persists.
- **Missing in R22 but required by the ported modules**: `inspectLibraryPair`, `materializeGeneration`,
  `proposeBuildAttestation` and `verifyBuildPair` all now need `allowedTargets` or `policy`. R22 calls them
  with one argument, so every call site must change.

## 5. Proposed explicit-root replacement (implemented as a guard, not a build)

The intent of `root !== HERE` is *"build only the repository I was installed for, into temp, never into the
source"*. That intent survives relocation if the root is supplied explicitly and validated against an
authorised policy. `infrastructure/c3/build/build-root-guard.mjs` implements exactly that and nothing else:

```js
assertBuildRoot(policy, rootDir)               // explicit root, inside an authorised TEMPORARY policy
assertBuildOutput(policy, rootDir, outputRoot) // inside policy, not the source root, not inside it, empty
inspectBuildInputs(rootDir)                    // read-only report of missing snapshot inputs
```

R22's original three conditions map onto it without weakening: `root !== HERE` → `root` must be inside the
policy root; `!inside(temp, out)` → the policy root must be inside `os.tmpdir()` (R28 enforces this);
`inside(root, out)` → `R30_OUTPUT_INSIDE_SOURCE_ROOT`. What is **added** is that R22 previously never asked
whether the destination was authorised at all — it only asked whether it was temporary.

The guard has **no dependency on vite or esbuild**, so importing it never requires the toolchain; the build
toolchain is installed only when a build actually runs.

## 6. Phase D — security tests: 10 tests, 10 pass, 0 fail, 0 skipped

| Requirement | Result |
| --- | --- |
| Dependency boundary isolation | **pass** — exact pins, `private: true`, root has no deps, `build/` not a workspace glob |
| Lockfile integrity | **pass** — `lockfileVersion: 3`, resolved versions equal the declared pins |
| No deployment-capable scripts | **pass** — no `scripts` block at all; no `wrangler`/`cloudflare` dependency; no `deploy`/`publish`/`postinstall` string in the manifest |
| Root-path validation | **pass** — absent root → `R30_ROOT_REQUIRED`; unresolvable → `R30_ROOT_UNAVAILABLE`; outside policy → `R30_ROOT_OUTSIDE_POLICY` |
| Refusal of staging/production destinations | **pass** — constructor refuses both tiers; a forged policy is re-derived and refused |
| Temporary output containment | **pass** — outside policy, equal to source root, nested inside source root, non-empty, and missing all refused |
| Dependency-install failure handling | **pass** — the guard imports with **no** toolchain installed, so a failed `npm ci` cannot break validation; the package has no lifecycle scripts that could fail or run code |
| No unexpected filesystem mutations | **pass** — tree snapshot identical across accepted and refused calls |
| Compatibility with R26–R29 | **pass** — guard validates through the same `assertPolicy` the library modules use |

## 7. Phase E — regression

| Command | Exit | Result |
| --- | --- | --- |
| `node --test tests/c3-recovery.test.mjs` | **0** | 38 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-reader.test.mjs` | **0** | 14 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-generation.test.mjs` | **0** | 12 pass / 0 fail / **1 skip** |
| `node --test tests/c3-build-provenance.test.mjs` | **0** | 15 pass / 0 fail / 0 skip |
| `node --test tests/c3-build-toolchain.test.mjs` | **0** | **10 pass / 0 fail / 0 skip** |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass |

**C3 suites total: 89 pass, 0 fail, 3 skipped.** The three skips are the Windows file-symlink cases carried
from R26/R27/R28; they remain visible as `# SKIP` and unverified.

State: `HEAD ea67a03`, **nothing staged**, **38 untracked files**, one modified tracked file (`.gitignore`,
the documented negation). Root manifests byte-identical (`ac8d0bec1e87459b`, `2b756711cfcf6c1a`). Staging
drift 0/7. Parent worktree `ea67a03` with 30 entries untouched.

## 8. Artifacts and fingerprints

| Artifact | SHA-256 (prefix) |
| --- | --- |
| `infrastructure/c3/build/package.json` | `b33b1db8bb9ac557…` |
| `infrastructure/c3/build/package-lock.json` (64 packages) | `aee38b5df3b732c9…` |
| `infrastructure/c3/build/build-root-guard.mjs` | `40d856d5941f9a18…` |
| `tests/c3-build-toolchain.test.mjs` | `8560d6e201106645…` |

Changed-file inventory: **5 new files** (package.json, package-lock.json, README.md, build-root-guard.mjs,
tests/c3-build-toolchain.test.mjs) plus this document, and **1 modified tracked file** (`.gitignore`, +6 lines).
`build/node_modules/` exists but stays ignored by rule 1.

## 9. Limitations — Windows-only and remaining

1. **Windows-only evidence.** `npm ci`, the install timing and the lockfile resolution were exercised on
   Windows 22.23.1 / npm 10.9.8. Nothing here proves the Linux runner behaves identically, and the
   `optionalDependencies` platform binary selection is precisely where the two differ.
2. **Three symlink cases still unverified** (R26/R27/R28).
3. **`.gitignore` negation is load-bearing.** Without `!infrastructure/c3/build/`, the package is invisible
   to git. If someone re-tightens `.gitignore`, this milestone silently stops being committable — worth a
   test or a note in the file itself (the comment is there).
4. **R22 cannot build this repository**: 7 of 9 snapshot inputs are absent. Isolation does not fix that.
5. **No build script exists**, so nothing here proves an actual bundle would be reproducible — only that the
   dependency boundary is.

## 10. Recommended scope for C3-R31

**Do not port R22 yet.** Dependency isolation was the prerequisite; the real blocker is that the repository
has no catalog or Worker build to produce evidence for (`vite.config.js`, `catalog.html`, `index.html`,
`cloudflare/api/src/index.js`, `wrangler.jsonc`, `src/`, `lib/assets/` are all missing).

Two honest options for C3-R31:

- **(a) Port R22's read-only half only** — `artifactDigest`, `sourceSnapshot`, `verifyOfflineEvidence` —
  which need no bundler and can be tested against synthetic temporary directories. This is real progress and
  ports nothing that cannot run.
- **(b) Define the catalog/Worker build** first (framework decision, entry points, output layout), then port
  the build half. This is an architecture decision, not a porting task, and should not be smuggled into a
  porting milestone.

I recommend **(a)** for C3-R31 and treating **(b)** as its own decision record.
