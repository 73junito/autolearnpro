# C3-R32 — Catalog and Worker Build Architecture Decision

Date: 2026-11-04 · **Architecture only. No application code, no artifacts, no deployment.**
Authorization: review, decision records and read-only verification.

## 1. Current-state inventory

### Implemented in the authoritative repository

| Component | Evidence | What it actually does |
| --- | --- | --- |
| `apps/web/src/server.mjs` | 33 lines, `node:http` | serves `GET /health` and routes `/api/roles/*` to the approval service; **no bundler, no static assets, no framework** |
| `apps/web/src/role-approval.mjs` | imports `pg` | privileged Node service; the Worker deliberately does not import it |
| `infrastructure/cloudflare/worker.mjs` | 15 lines, no imports | **fs-free** placeholder; `GET /health` returns `{status:"ok", service:"autolearnpro-foundation-cloudflare", mode:"scaffold"}` |
| `infrastructure/cloudflare/wrangler.jsonc` | 15 lines | `main: ./worker.mjs`, `workers_dev:false`, `preview_urls:false`, `observability.enabled:true`, `env.staging` |
| `infrastructure/scripts/validate-foundation.mjs` | 9 lines | requires 13 directories + a private root manifest with **no dependencies** |
| `.github/workflows/cloudflare-foundation-staging.yml` | validation-only | manual `workflow_dispatch`, `contents: read`, Wrangler **dry-run**, deploy job `if: ${{ false }}` |
| `supabase/migrations/*` | 9 tracked | identity/authorisation baseline, RLS hardening, approval workflow |
| `tests/*.test.mjs` | 6 runtime + 6 C3 | `node --test`, no test framework dependency |

### Reserved (tracked placeholders, no code)

`apps/simulator`, `apps/classroom`, `packages/ui`, `packages/core`, `packages/curriculum`,
`packages/diagnostics`, `supabase/functions` — each holds only a `README.md` added in C3-R25 so a clean
checkout reproduces the foundation shape. **No implementation exists behind any of them.**

### Prototypes (integration worktree only, uncommitted)

`infrastructure/c3/library/` (5 modules), `infrastructure/c3/build/` (toolchain manifest + lockfile + root
guard + offline-evidence verifier), and `docs/c3-r25…r31/`. All local, nothing published.

### Proposed (this document, no code)

A catalog build and a Worker build. **Neither exists**, and 7 of the 9 inputs R22 expects are absent
(`vite.config.js`, `catalog.html`, `index.html`, `cloudflare/api/wrangler.jsonc`, `src/`,
`cloudflare/api/src/`, `lib/assets/`).

### Comparison with the standalone staging workspace

| Aspect | Authoritative repo | Staging workspace |
| --- | --- | --- |
| Framework | **none** (`node:http`) | Vite 7 + three static HTML entries (`index`, `catalog`, `instructor`) |
| Catalog entry | **absent** | `catalog.html` + `src/` |
| Worker | `infrastructure/cloudflare/worker.mjs` (fs-free, 15 lines) | `cloudflare/api/src/index.js` (+ `research.js`, `research-coordinator.js`, generated asset library) |
| Library | **absent** | `specs/asset-library.json`, `lib/assets/*` (14 modules) |
| Dependencies | **zero** | `three`, `@modelcontextprotocol/sdk`, `vite`, `playwright-core`, `axe-core` |
| Tests | `node --test` | mixed harnesses (`run-c3rNN.mjs`, `.test.mjs`) |

**Conclusion:** the staging workspace is an engineering studio. The authoritative repository is a foundation
with a health endpoint and an authorisation surface. Copying the studio's build into the foundation would
import an architecture the foundation has not chosen.

## 2. Catalog architecture options

| Criterion | **A — extend `apps/web`** | **B — separate catalog application** |
| --- | --- | --- |
| Framework | would have to *introduce* one (Vite/React) into a repo whose runtime is `node:http` with zero dependencies | its own choice, isolated from the foundation runtime |
| Entry points | `apps/web/src/server.mjs` would need static serving + build output wiring | `apps/catalog/{index.html,src/}` + `vite.config.js` |
| Build inputs | `apps/web/index.html`, `apps/web/src/**`, `vite.config.js` | `apps/catalog/**` |
| Output | `apps/web/dist/` (new) | `apps/catalog/dist/` (new) |
| Dependency ownership | root or `apps/web` gains Vite + React + three | confined to the catalog package |
| Asset strategy | 3D assets would share the web app's tree | dedicated `assets/` root, own import rules |
| Testing | risks coupling runtime health tests to a bundler | separate suites; foundation tests stay dependency-free |
| CI reproducibility | every CI run installs a bundler for a health endpoint | catalog job installs only its own toolchain |
| Security boundary | a browser bundle adjacent to a privileged `pg` service | clean separation; no privileged code in the catalog app |
| Maintenance | one app, two very different responsibilities | two packages, explicit contract between them |

**Recommendation: Option B — a separate catalog application.** Three reasons, in order of weight:

1. **The foundation's defining property is zero dependencies.** `validate-foundation.mjs` asserts it, and
   `apps/web` runs on `node:http` alone. Option A would put a bundler and a UI framework on the same
   dependency graph as the privileged role-approval service — the exact coupling the Worker boundary was
   designed to avoid.
2. **Asset-heavy UI has different failure modes.** A 3D catalog wants code-splitting, lazy loading and large
   static assets. The approval service wants none of that and must remain debuggable from a terminal.
3. **`packages/*` already exists for sharing.** A catalog app plus `packages/ui` gives reuse without forcing
   a shared toolchain.

Option A is not irrational — it is one deployment target instead of two. But it trades the foundation's
dependency-free guarantee for that convenience, and that guarantee is what makes the current CI cheap and the
security boundary legible.

## 4. Worker runtime boundary

The current Worker is 15 lines with **no imports** and a `mode:"scaffold"` health response. That is a
capability, not an oversight: it cannot reach a filesystem, a database or the privileged Node service, so a
compromise of the Worker cannot touch them.

| Decision | Position |
| --- | --- |
| **Source entry point** | keep `infrastructure/cloudflare/worker.mjs` as the single module named by `wrangler.jsonc`. A build may *bundle* it, but the tracked source of truth stays that file. |
| **API responsibilities** | `GET /health` (existing), plus — only when separately approved — read-only asset metadata delivery from a **generated** library artefact. No mutation endpoints. |
| **Asset delivery** | static/generated JS imported as data, or R2 later. **Not** `fs`. A Worker has no filesystem; any design needing one is a Node build step, not a runtime feature. |
| **Build-time vs runtime deps** | build-time: `vite`, `esbuild` (isolated in `infrastructure/c3/build`). Runtime: none added. The Worker's bundle must remain import-free apart from generated data. |
| **Generated library consumption** | the Worker reads the generated module (`asset-library.generated.js` shape) as a bundled constant. The library contract (R26–R29) governs how that file is produced and verified, never how it is served. |
| **Separation from privileged services** | unchanged and non-negotiable: `worker.mjs` must never import `apps/web/src/role-approval.mjs` or `pg`. A test asserts zero `c3/library` imports in Worker/request code today; that assertion should harden into a build-time check. |
| **No credentials, no fs in request code** | the generated bundle contains data only. Connection strings, JWTs and service-role keys never enter `infrastructure/cloudflare/`. |
| **Deployment-independent verification** | `wrangler deploy --dry-run` already exists in CI; evidence verification (R31) is a separate offline check and must not depend on a deploy having happened. |
| **Publication and rollback gates** | publication stays disabled (`if: ${{ false }}`, `publicationAuthorized:false`). A rollback gate is meaningless until publication is authorised; it is listed as a prerequisite for that authorization, not implemented now. |

**Explicit:** the existing Worker is not replaced by this document, and no route or Wrangler setting changes.

## 5. Build input/output contract (proposed, not implemented)

| Item | Catalog (Option B) | Worker |
| --- | --- | --- |
| Source root | `apps/catalog/` | `infrastructure/cloudflare/` |
| Entry | `apps/catalog/index.html` + `apps/catalog/src/main.*` | `infrastructure/cloudflare/worker.mjs` |
| Build tool | Vite (`infrastructure/c3/build` owns the dependency) | esbuild, same toolchain package |
| Output | `apps/catalog/dist/` | `infrastructure/cloudflare/dist/worker.js` |
| Emitted artefacts hashed by | R31 `artifactDigest` | R31 `artifactDigest` |
| Library binding | R28 generation → R29 build record | same generation, different surface |
| Evidence file | `offline-evidence.json` produced by a future port of `buildOfflineEvidence` | same file, both surfaces |

**The seven missing R22 inputs are not to be created as placeholders.** If a future milestone needs them, it
creates *real* entry points as part of an application decision — never empty files to satisfy an inspector.

## 6. Dependency ownership

| Dependency | Owner | Rationale |
| --- | --- | --- |
| `pg` | `apps/web` (already) | privileged service only |
| `vite`, `esbuild` | `infrastructure/c3/build` (already, isolated, pinned) | build-time only; never in a runtime path |
| framework/UI libraries | `apps/catalog` + `packages/ui` (future) | not decided here; must not land in the root |
| `three` / asset tooling | `apps/catalog` (future) | browser-only; never imported by Node services |

Root manifest stays dependency-free. Any future addition belongs to the package that needs it, so
`npm ci` at the root keeps installing only what the foundation runs.

## 7. C3-R22 integration plan (future, gated)

1. **Authorize source and target configuration** — a temporary R28 policy; no staging or production path.
2. **Build catalog artifacts** — real Vite build of a real `apps/catalog`.
3. **Build Worker artifacts** — real esbuild bundle of the real `worker.mjs`.
4. **Recompute emitted hashes** — `artifactDigest` over both output trees (R31).
5. **Bind both to one generation** — `materializeGeneration` (R28) → `proposeBuildAttestation` × 2 (R29).
6. **Produce offline evidence** — a port of `buildOfflineEvidence`, with cleanup that R22 lacks.
7. **Verify with the R31 contract** — `verifyOfflineEvidence` recomputes and compares.
8. **Keep provenance and publication separately gated** — see §8.

**R22 assumptions that must change:** `HERE` (`new URL('../../')`) → explicit root validated by
`assertBuildRoot`; `LIBRARY_TARGETS` → policy targets; every `inspectLibraryPair` / `materializeGeneration` /
`proposeBuildAttestation` / `verifyBuildPair` call gains its required policy or target set; the hard-coded
`cloudflare/api/src/index.js` entry becomes the Worker's real entry; `outputRoot` gains policy containment;
and cleanup is added where the source leaves its whole output tree behind.

## 8. Trusted provenance boundaries — seven separate things

| # | Concept | What it would establish | Current status |
| --- | --- | --- | --- |
| 1 | **Source snapshot digest** | a named tree had these bytes when hashed, on the machine that hashed it | **available** — R31 `sourceSnapshot`; local evidence only |
| 2 | **Git commit verification** | those bytes correspond to a specific commit in a specific repository | **NOT ESTABLISHED** — the snapshot is a caller-nominated directory, not a commit |
| 3 | **Artifact content integrity** | the emitted bundle bytes match the recorded digest | **available** — R31 recomputation |
| 4 | **CI workload identity** | a specific CI job, in a specific repository, on a specific ref, produced the evidence | **NOT ESTABLISHED** — no OIDC, no issuer, no key material in the repo |
| 5 | **Signed build attestation** | a key with known provenance signed the evidence | **NOT ESTABLISHED** — nothing is signed |
| 6 | **Release approval** | a named human accepted this evidence for release | **NOT ESTABLISHED** |
| 7 | **Deployment authorization** | deployment is permitted, by policy, now | **NOT ESTABLISHED** — `deployAllowed:false`, deploy job disabled |

**Satisfying one never establishes another.** Concretely: (3) does not imply (2) — matching hashes say nothing
about origin; (1) does not imply (2) — a directory is not a commit; (2) would not imply (4) — a commit can be
built on a laptop; (5) would not imply (6) — a signature is not an approval; (6) would not imply (7) —
approval for release is not authorisation to deploy. The ported modules pin
`sourceCommitVerified:false`, `ciAttested:false`, `publicationAuthorized:false`, `deployAllowed:false` and
refuse evidence where any of them reads anything else.

## 9. Security and deployment gates

| Gate | State | Note |
| --- | --- | --- |
| Publication authorized | **false** | pinned in every record; a `true` value fails verification |
| Deployment allowed | **false** | `deployAllowed:false`; Cloudflare deploy job `if: ${{ false }}` |
| Staging / production target path | **not authorizable** | R28 refuses both tiers outright |
| Worker filesystem / DB access | **none** | `worker.mjs` has zero imports |
| Secrets in repo | **none** | verified by scan in earlier milestones |
| Branch protection / rulesets / environments | **absent** | GitHub reports none (C3-R25); nothing gates a merge |
| Action pinning enforced | **absent** | `sha_pinning_required:false` on the repository |
| Public repository | **yes** | any push publishes all history immediately |

The last three are repository settings, not code. No amount of local work substitutes for them.

## 10. Implementation sequence for C3-R33 and later

| Milestone | Content | Precondition |
| --- | --- | --- |
| **C3-R33** | Catalog **framework decision**: choose framework and package layout for `apps/catalog`; no implementation | this record accepted |
| **C3-R34** | Catalog application skeleton: `index.html`, `src/main.*`, `vite.config.js` — real entry points, minimal UI | C3-R33 decision |
| **C3-R35** | Worker bundle entry decision: what `esbuild` bundles from `worker.mjs`, and how generated library data enters it | C3-R34, plus a library generation that exists |
| **C3-R36** | Port `buildOfflineEvidence` with explicit root, policy containment and **cleanup** | C3-R35; toolchain already isolated (R30) |
| **C3-R37** | CI proposal update: separate job for the catalog/Worker build evidence, still validation-only and uninstalled | C3-R36 |

Each step is gated on the previous one being *reviewed*, not merely finished. No step authorizes publication.

## 11. Risks, unresolved decisions, acceptance criteria

### Risks

1. **Framework choice is deferred and could reopen the layout.** If `apps/catalog` later needs SSR, the
   static Vite build assumed here stops fitting.
2. **Two applications mean two deployments.** Option B trades the foundation's simplicity for isolation; a
   future operator must run both, and that cost is real.
3. **The public repository is the dominant risk**, not the build. Nothing here reduces it.
4. **No branch protection.** A workflow proposal protects nothing while merges are ungated.
5. **Symlink verification is platform-split.** R26/R28 verified on Linux; **R27's corrected fixture still
   needs a Linux rerun** before that case counts as verified.
6. **Asset provenance for 3D content is unresolved.** KCOE8006 remains on FITMENT HOLD; no catalog may
   surface unverified fitment data.
7. **Residual TOCTOU** in containment-then-read (R31 §5) is inherited by any future build path.

### Unresolved decisions

- Which framework for `apps/catalog` (Vite plain, React, other) — explicitly **not** decided here.
- Whether `packages/ui` is created before or after the catalog app.
- Whether the Worker serves assets directly or via R2 — deferred; R2 writes are prohibited today.
- Where `specs/asset-library.json` lives in the authoritative repo — it does not exist yet.

### Acceptance criteria for this record

- [x] References only files that exist; distinguishes implemented, reserved, prototype and proposed.
- [x] Recommends one catalog option with stated reasons, and records the cost of that choice.
- [x] Keeps the Worker fs-free, unmodified and unpublished.
- [x] Documents the R22 assumptions that must change, without creating placeholder inputs.
- [x] Keeps the seven provenance concepts separate and the four flags false.
- [x] No application code, no build artifacts, no manifests, no workflows, no commits.

## 12. Correction (C3-R35) — dependency ownership after C3-R34

Appended 2026-11-04. Sections 1–11 are the reviewed text and are unchanged. C3-R34 created `apps/catalog` as
an npm workspace with `three@0.180.0` and a `vite@7.3.7` devDependency, which changed what the root
*installation* contains. The reviewer resolved this as C3-R34 B1; the wording below is the accepted invariant.

### What this record says above that is now inaccurate

| Line | Claim | Status |
| --- | --- | --- |
| 46 | Root dependencies: **zero** | true of the root **manifest**, false of the root **install** since C3-R34 |
| 70 | "The foundation's defining property is zero dependencies." | overstated: the property is that the root *manifest* declares none and that runtime graphs stay isolated |
| 80 | "trades the foundation's dependency-free guarantee" | the guarantee is now about manifests and runtime import graphs, not about `node_modules` contents |
| 127–128 | "Root manifest stays dependency-free… so `npm ci` at the root keeps installing only what the foundation runs." | the first clause holds; the second does not — `npm ci` installs the catalog's build tooling too |

### What is still true, measured

- Root `package.json` declares **no** dependencies or devDependencies (`ac8d0bec1e87459b…`, byte-identical
  across C3-R30, C3-R33, C3-R34 and C3-R35), and `validate-foundation.mjs` still passes on 13 directories with
  that manifest.
- `apps/web` still resolves exactly `pg 8.16.3`, and nothing else.
- `infrastructure/cloudflare/worker.mjs` still has **zero imports** and no filesystem access; C3-R35 now
  enforces that with `assertWorkerBoundary`.
- `infrastructure/c3/build` still has its own manifest and lockfile, installs with `--ignore-scripts`, and is
  imported by nothing outside tests.

### The invariant that replaces the retired one

> The foundation validation and privileged runtime dependency boundaries remain protected. The root development
> workspace now installs catalog build tooling, while individual runtime dependency graphs remain isolated and
> independently audited.

So §6's ownership table stands as written, with one amendment: the row for `vite` is no longer only
`infrastructure/c3/build` — the catalog app also owns a Vite pin, at the identical version, and C3-R34 test 2
asserts the two cannot drift.

