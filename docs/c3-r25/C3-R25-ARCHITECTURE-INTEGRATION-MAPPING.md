# C3-R25 — Architecture Integration Mapping (Phase D)

Date: 2026-11-04 · Disposition: **ANALYSIS ONLY — nothing ported, nothing copied, nothing merged.**
Fingerprint source of truth: `c3-integration-source-manifest.json` (6 modules, verified 14/14).

## 1. Structural comparison

| Aspect | `F:\autolearnpro` (authoritative) | `F:\autolearnpro-meshy-staging` (staging) |
| --- | --- | --- |
| Manifest | root `autolearnpro`, `private: true`, workspaces `apps/*`,`packages/*`, **no dependencies** | `type: module`, deps `three`, `@modelcontextprotocol/sdk`; dev `vite`, `playwright-core`, `axe-core` |
| Lockfile | `package-lock.json` tracked | own lockfile, different tree |
| Apps | `apps/web` only (3 tracked files) | Vite app + Studio + MCP server |
| Worker | `infrastructure/cloudflare/worker.mjs` — **fs-free** health placeholder | Worker + catalog/asset library generations |
| Asset library | **does not exist** | `lib/assets/*` (R10–R24) |
| Tests | `tests/*.test.mjs` via `node --test` (12 tracked) | `run-c3rNN.mjs` harnesses |
| Docs | flat `docs/` | `docs/web-first-architecture-review/**` |

**Boundary governing the whole mapping:** `worker.mjs` deliberately does not import the privileged Node
service. The C3 modules use `node:fs`, `node:os`, `node:crypto` and (R24) `node:child_process`, so **they
cannot run inside the Worker**. Integration belongs in Node build/CI tooling. This is why R21–R24 exist as
offline contracts rather than runtime routes.

## 2. Module-by-module mapping

Destinations are **proposals**; none exists today.

| # | Source (staging) | Proposed destination | Runtime imports | Staging-only couplings |
| --- | --- | --- | --- | --- |
| 1 | `lib/assets/library-pair-reader.mjs` | `packages/core/src/assets/library-pair-reader.mjs` | `fs`, `path`, `crypto`, `./library-pair-recovery.mjs` | `LIBRARY_TARGETS`, `JOURNAL_NAME`, `LOCK_NAME` |
| 2 | `lib/assets/library-generation-r20.mjs` | `packages/core/src/assets/library-generation-r20.mjs` | above + `os` | content-addressed generation dirs under staging paths |
| 3 | `lib/assets/build-provenance-r21.mjs` | `packages/core/src/assets/build-provenance-r21.mjs` | `crypto`, `#2`, `recovery` | `LIBRARY_TARGETS` |
| 4 | `lib/assets/build-evidence-r22.mjs` | `infrastructure/scripts/c3/build-evidence-r22.mjs` | `fs/os/path/crypto`, **`vite`**, **`esbuild`**, `#1`,`#2`,`#3` | Vite catalog entry paths; local snapshot as `sourceCommit` |
| 5 | `lib/assets/release-evidence-gate-r23.mjs` | `infrastructure/scripts/c3/release-evidence-gate-r23.mjs` | `fs/path/crypto`, `#4` | Ed25519 public-key trust anchor |
| 6 | `lib/assets/ci-readiness-r24.mjs` | `infrastructure/scripts/c3/ci-readiness-r24.mjs` | `fs/path/crypto`, **`child_process`**, `#4` | spawns local tooling; assumes a git worktree |

Split rationale: 1–3 are pure computation and fit a shared package; 4–6 perform I/O, spawn processes and
need build tooling, which belongs beside `infrastructure/scripts/validate-foundation.mjs`. Putting 4–6 in
`packages/*` would force every consumer workspace to carry `vite`.

## 3. Finding — the reviewed set is incomplete

The manifest fingerprints 6 modules, but import #1 reveals a **seventh, unreviewed module**:

- `lib/assets/library-pair-recovery.mjs` exports `JOURNAL_NAME`, `LOCK_NAME`, `LIBRARY_TARGETS` and is
  imported by modules 1, 2 and 3.

Modules 1–3 cannot be ported without it, and porting it unreviewed would put unaudited code inside a
reviewed boundary. **The manifest must be extended and re-reviewed before any port.** `verify-review.mjs`
asserts exactly six entries, so extending it is a deliberate change to reviewed evidence — not a tweak.

## 4. Required adaptations (each needs approval; none performed)

1. **Workspace decision.** `packages/core` has no `package.json`. Adding one turns a reserved directory
   into a real workspace and forces a `package-lock.json` regeneration — a root-manifest change.
2. **New root script.** The workflow calls `npm run verify:c3-staging`, which does not exist in the
   authoritative `package.json`. Adding it edits the root manifest.
3. **Build tooling.** Module 4 imports `vite` and `esbuild`; the authoritative repo has neither. Either add
   root `devDependencies` (lockfile change) or keep R22 verification outside this repository.
4. **Path roots.** All six derive locations from their own module path or `process.cwd()`. At a different
   directory depth these resolve differently; each must take an explicit root parameter.
5. **Test convention.** Staging uses `run-c3rNN.mjs`; this repo uses `node --test tests/*.test.mjs`. Ports
   must be re-expressed in the latter or a second runner appears.
6. **R12/R13 pins.** Source-integrity fingerprints and write authorization depend on canonical paths and a
   staging-only directory name. They must be **re-derived**, never copied.

## 5. Test coverage carried over — and what it does not prove

| Staging evidence | Value | Does **not** prove |
| --- | --- | --- |
| C3-R24 13/13 | local contract consistency | that any CI ran it |
| 190/190 consolidated, 211/211 with R15 | no regression in staging | behaviour after a path/depth change |
| static inventory: 53 modules, 15 fingerprints, 0 findings | scanned set is clean | that the scan covered the 7th module |
| R23/R24 Ed25519 verification | signatures verify against a local key | that the key belongs to a trusted CI identity |
| R22 artifact SHA-256 | hashed bytes match a local snapshot | that the commit is genuine Git provenance |

## 6. Security boundaries that must survive the port

- **Writer authorization (R13–R15)** stays a separate, checkable precondition, never folded into the writer.
- **No `child_process` on a request path (R24)** — spawning from a Worker route would be remote execution.
  Build-time only, fixed argument vectors.
- **Hostile-append defence (R20A)** must not be relaxed to accommodate a new bundler.
- **KCOE8006 FITMENT HOLD** — no catalog or asset-library path may surface unverified fitment data.

## 7. Conflicts with existing parent code

| Conflict | Detail |
| --- | --- |
| Root manifest | Root script and workspace additions both touch `package.json`/`package-lock.json`, which the handoff forbids overwriting. Additive edits need explicit approval. |
| Worker boundary | C3 modules are fs/child_process based; the Worker is fs-free by design. No safe overlap without redesign. |
| Test runner | Two conventions if ports are copied rather than re-expressed. |
| Docs tree | `docs/web-first-architecture-review/**` does not exist here, which is exactly why the proposed workflow fails closed. |
| Uncommitted parent work | 30 entries (incl. `apps/web/src/server.mjs`, `package.json`) exist **only** in the parent worktree. A manifest edit here will conflict at merge. That is a merge-time plan item, not something to resolve now. |

## 8. Recommendation

Extend the reviewed manifest with `library-pair-recovery.mjs` **first**; then port 1–3 (pure, dependency-free,
testable); then 4–6 once build tooling is approved. No port should begin before the destination tier
(package vs infrastructure script) is decided, because that decision determines whether the authoritative
lockfile must change.
