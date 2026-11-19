# C3-R25 — Node-Only Boundary (Task 2) and Merge Trial (Task 3)

Date: 2026-11-04 · No source ported, no commit, no push, no settings change.

## Part 1 — Proposed layout, verified

```
infrastructure/c3/library/   library-pair-recovery · library-pair-reader
                             library-generation-r20 · build-provenance-r21
infrastructure/c3/build/     build-evidence-r22 · release-evidence-gate-r23
infrastructure/c3/ci/        ci-readiness-r24
```

**Dependency direction, computed from `c3-dependency-graph.json` (not asserted):**

| Module | Tier | Local imports |
| --- | --- | --- |
| `library-pair-recovery` | library | *(none — leaf)* |
| `library-pair-reader` | library | recovery |
| `library-generation-r20` | library | pair-reader, recovery |
| `build-provenance-r21` | library | generation-r20, recovery |
| `build-evidence-r22` | build | pair-reader, generation-r20, provenance-r21 |
| `release-evidence-gate-r23` | build | build-evidence-r22 |
| `ci-readiness-r24` | ci | build-evidence-r22 |

**Upward edges: 0. Cycles: none.** Strict layering `ci → build → library`, and the leaf is in the
lowest tier, so the layout is acyclic with no re-entrant import. The layout is accepted as provisional.

## Adaptation 1 — import paths (4 of 7 modules change)

| Module | Change |
| --- | --- |
| `library-pair-recovery` | none |
| `library-pair-reader` | none (recovery stays a sibling) |
| `library-generation-r20` | none |
| `build-provenance-r21` | none |
| `build-evidence-r22` | **3 imports** `./x.mjs` → `../library/x.mjs` |
| `release-evidence-gate-r23` | none (r22 is a sibling in `build/`) |
| `ci-readiness-r24` | **1 import** `./build-evidence-r22.mjs` → `../build/build-evidence-r22.mjs` |

## Adaptation 2 — the one blocking root assumption

Six modules take their root explicitly (`rootDir`, or a `root` argument). `build-evidence-r22` does not:

```js
const HERE = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));   // line 13
if (root !== HERE || !inside(temp, out) || inside(root, out)) throw Error('R22_ROOT_NOT_ALLOWED');  // line 48
```

`HERE` is not a convenience — it is the **enforced** root: line 48 rejects any root that is not `HERE`.
Today `../../` from `lib/assets/x.mjs` resolves to `<repo>/lib`. After the move to
`infrastructure/c3/build/`, the same expression resolves to `infrastructure/c3` — so **the guard would
reject the real repository root and R22 would fail closed every time.**

Fix: replace the module-relative constant with an explicit root parameter (or a four-level `'../../../../'`
if a constant is retained). This is a **security-sensitive** edit: the check must keep rejecting
out-of-tree output and must not become a bypass. It requires review, not a mechanical path bump.

## Adaptation 3 — `LIBRARY_TARGETS` points at paths that do not exist here

```js
export const LIBRARY_TARGETS = ['specs/asset-library.json', 'cloudflare/api/src/asset-library.generated.js'];
```

| Path | Present in `F:\autolearnpro`? |
| --- | --- |
| `specs/` | **No** (no such directory) |
| `cloudflare/api/src/` | **No** — this repo uses `infrastructure/cloudflare/` |
| `specs/asset-library.json` | **No** |
| `cloudflare/api/src/asset-library.generated.js` | **No** |

The `allowed` set in `recoverLibraryPair` is built from this constant, so the write-authorization boundary
would be keyed to paths that never exist — either recovery always throws `R17_JOURNAL_INVALID`, or the set
gets "adjusted" ad hoc and the R20A bypass closure quietly loses its anchor. **The target set must be
re-derived and re-reviewed as part of the port, not edited in place to make tests pass.**

## Adaptation 4 — `vite` and `esbuild` are module-load imports

`build-evidence-r22` imports both at top level. Without them in root `devDependencies`, *importing* r22
throws — and `release-evidence-gate-r23` and `ci-readiness-r24` import r22, so **R23/R24 cannot run at all**.
Options: add the dependencies (manifest change, not authorized in this task) or convert to dynamic imports
inside the functions that need them (source change, needs review). No third option: keeping the imports and
skipping the install yields a workflow that fails for an unrelated reason and looks like a C3 defect.

## Compatibility and portability

- `infrastructure/c3/` is additive: no collision with `scripts/`, `docker/`, `cloudflare/`.
  `validate-foundation.mjs` does not list it, so the validator needs no change.
- Node-only: `fs`, `os`, `crypto`, `child_process` (r24, build-time). None may be imported from
  `infrastructure/cloudflare/worker.mjs`, which stays fs-free.
- Windows-specific behaviour is already handled in `syncExisting` (`openSync(r+)` for `fsyncSync`).
- `child_process` in r24 must keep fixed argument vectors; no shell interpolation.

## Implementation order (proposed)

`recovery → reader → generation-r20 → provenance-r21 → build-evidence-r22 → release-gate-r23 →
ci-readiness-r24`, each landing with tests in the `node --test tests/*.test.mjs` convention. Adaptations 2
and 3 must be resolved **before** r22/r23/r24 move, because both are fail-closed checks that would
otherwise make the port look broken.

## Part 2 — Disposable merge trial (Task 3)

Method: `git clone` of the remote into `%TEMP%\alp-trial-merge`, then fetch the local foundation branch
**from** `F:\autolearnpro` into that clone. Neither `F:\autolearnpro` nor
`F:\autolearnpro-c3-r25-integration` was fetched into, checked out, or merged. The clone was deleted after.

| Check | Result |
| --- | --- |
| Remote `main` at clone time | `952e236a1fa8b0a98e6527d8077b4f377556f564` — matches the expected commit |
| Foundation tip fetched | `ea67a032d94bf283ab458c45bc622e75f1a219f1` |
| Merge-base | `bdf6302589bc36e02632469227f416fe959111fc` |
| Divergence `foundation...main` | **37 ahead / 6 behind** — reproduces the earlier finding exactly |
| Root commits, both sides | the same single root `bdf6302` |
| Trial merge (`--no-commit --no-ff`) | **exit 0 — "Automatic merge went well"** |
| Unmerged paths | **NONE** |
| Content merged | **3 files, 244 insertions, 0 deletions** |
| Foundation files touched by the merge | **none** |
| Merged tree workflows | `ai-readonly-review.yml` **and** `cloudflare-foundation-staging.yml` |
| Validation, merged tree **without** READMEs | **exit 1** — missing exactly the 7 directories |
| Validation, merged tree **with** the 7 READMEs | **exit 0** — "13 directories" |
| `git merge --abort` | exit 0; status empty; `MERGE_HEAD` gone; HEAD back to `ea67a03` |
| Disposable clone removed | yes |

**Prediction confirmed empirically:** disjoint path sets produced a conflict-free merge. Your caveat was
also correct — a conflict-free merge is not a validated merge. The combined tree still fails foundation
validation, because HEAD has no tracked content in those 7 directories; the READMEs fix it only when
applied, which is why they must be committed **before** the reconciliation is published.

**Consequence to plan for:** the merged tree contains two workflows. `cloudflare-foundation-staging.yml`
has never existed on the remote; after publication it would appear on GitHub and become a runnable
manual workflow. It is validation-only with `if: ${{ false }}` on the deploy job, but its first appearance
is a state change someone should explicitly expect.

**Not tested:** `npm ci` and `npm test` in the merged tree — the clone had no `node_modules` and no network
install was performed. Only dependency-free validation ran. Do not read "merge clean" as "builds".

## Part 3 — Remaining risks

1. **Public repository.** Any push publishes all 38 foundation commits and their file contents permanently.
   A history-wide secret/sensitive-data review is required *before* publication — including files deleted
   later, which remain in history. Not performed.
2. **`LIBRARY_TARGETS`** keys the recovery allow-list to paths that do not exist here (Adaptation 3).
3. **R22 root guard** would fail closed against the real repository root after the move (Adaptation 2) —
   a security check that must be re-pointed, not disabled.
4. **`vite`/`esbuild`** absence makes R23/R24 unrunnable, not merely untested.
5. **`onRestored` hook** in `recoverLibraryPair` is a test-only callback executed after each restore. Its
   comment says not to wire it into the operational CLI; that instruction is documentation, not enforcement.
6. **`allowStaleLock`** override is a boolean escape hatch; an orphan lock without a journal is *not* cleared
   by this module at all — it returns `NO_JOURNAL` before touching the lock. Whatever closed R20A's
   "unrecoverable journal-free orphan writer locks" lives elsewhere; this module does not close it.
7. No branch protection, no rulesets, zero environments, `sha_pinning_required: false`.

## Part 4 — Recommended next milestone

**C3-R26 — port `library-pair-recovery.mjs` alone** into `infrastructure/c3/library/` with
`tests/c3-recovery.test.mjs` in the `node --test` convention: journal validation, path-escape refusal,
symlink refusal, destination drift, stale-lock override, and the R20A allow-list. No other module moves in
that milestone. Recovery is the leaf, has no external imports beyond `node:*`, and every other module
depends on its constants — so it is the smallest change that de-risks the whole port.
