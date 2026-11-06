# Primary repository migration plan (planning only)

**Decision (2026-10-27):** [73junito/autolearnpro](https://github.com/73junito/autolearnpro) is the single **primary** development repository for AutoLearnPro/TorqueMind. [73junito/car-diagnosis-simulator](https://github.com/73junito/car-diagnosis-simulator), its Cloudflare Worker deployments, and the local `F:\TorqueMind` tree are **legacy sources** pending a controlled transition.

**Status:** Inventory and architecture planning only. No component transfer, production cutover, Worker deletion, repository archive, or Stage 3 advancement is authorized by this document.

## Verified baseline and boundaries

| Source | Observed inventory (2026-10-27) | Treatment |
| --- | --- | --- |
| `73junito/autolearnpro` | Small repository: `.github/`, `docs/`, `README.md`; existing manual ClinePass review | Primary target; avoid assuming application runtime already exists here |
| `73junito/car-diagnosis-simulator` | App, dashboard, components, tests, Supabase migrations, worker entries, multiple Wrangler configs, extensive CI/governance workflows | Legacy GitHub source; preserve functionality and provenance during selection |
| `F:\TorqueMind` | Local checkout with origin `73junito/car-diagnosis-simulator`, HEAD `d007287ab90efe7f67d7e7b4bdbe179fe144b2a4`, branch `feature/protection-rules-main-asset-promotion-review`, nonclean index and working tree, untracked worktrees | **Preservation hold**; do not clean/reset/delete/overwrite until all local-only changes have been inventoried and backed up |

This table is based on repository metadata, source configuration, and a read-only top-level/local Git inspection. It is **not** a complete asset, database, or live Cloudflare account audit.

## Target ownership and source mapping (proposed, not yet copied)

| Capability | Legacy source candidate | Intended destination under primary | Acceptance boundary |
| --- | --- | --- | --- |
| Public site | `public-site/`, `worker/public-index.js`, `wrangler.jsonc` | `apps/public/`, `infrastructure/cloudflare/` | Public routes, legal/contact/health checks and redirects validated |
| Learner and Circuit/Sensor/Starting labs | `dashboard/`, `src/`, `components/`, `assets/`, `engineering/` | `apps/learner/`, `packages/simulation/`, `packages/ui/` | Feature flags, tests, WebGL fallback, circuit behavior and accessibility retained |
| Training/assessment | `assessment/`, `exam-site/`, `wrangler.exam.jsonc` | `apps/exam/`, `packages/assessment/` | Training/scoring/eligibility separation; no automatic publication or approval |
| API and orchestration | `api/`, `torquemind-api/`, `worker/index.js` | `apps/api/`, `packages/domain/` | Authentication, ownership, failure behavior and rate limiting verified |
| Curriculum/evidence | `data/`, `schemas/`, `evidence/`, `reference-library/` | `packages/curriculum/`, `packages/evidence/` | Provenance, rights, approval and licensing preserved |
| Database and identity | `supabase/`, `db/`; Stage 2 frozen evidence held separately | `infrastructure/database/`, `packages/auth/` | Independently verify migrations/roles/RLS; no automatic `service_role` risk acceptance |
| CI and AI advisory | Existing legacy `.github/workflows/` and primary ClinePass pilot | `.github/workflows/`, `scripts/` | Reintroduce only required checks; manual AI reviews remain advisory/read-only |

These paths are **architecture proposals**, not commitments to a monorepo framework or proof that every legacy file belongs in the target.

## Cloudflare configuration inventory (not proof of live state)

Legacy config names: `autolearnpro-public` (`wrangler.jsonc`), `autolearnpro-app` (`wrangler.app.jsonc`, custom domain `app.autolearnpro.com`), `autolearnpro-exam` (`wrangler.exam.jsonc`, custom domain `exam.autolearnpro.com`); staging names include `car-diagnosis-simulator-staging` and `autolearnpro-app-staging`.

Legacy configuration also declares Cloudflare Durable Object `TORQUEMIND_RATE_LIMITER`, Supabase integration (separate production and preview/staging references), Semantic Scholar secret binding, and Ollama AI connectivity. **Do not assume** that configured names match the currently deployed Worker versions, routes, bindings, or active data stores. Obtain a separately approved read-only Cloudflare inventory before cutover.

## Security and migration exclusions

**Never import or publish** local credential files (`.env*`, `.dev.vars*` containing values), Cloudflare secret values, private certificates/keys, tokens, personal/student data, database dumps, local `.git/`, `node_modules/`, `dist/`, `.wrangler/`, `.vercel/`, Playwright reports, log files, temporary/test artifacts, local agent state, or unreviewed worktrees. Examples/templates may be migrated **only after manual redaction review**. Use secret scanning and license/provenance review for source selection.

Do not treat a filename allowlist or automated scanner as proof that content is free of secrets or protected material.

## Migration stages and release gates

1. **Preserve and inventory.** Snapshot/backup the legacy local index, untracked paths and worktrees using a reviewed process; inventory Git branches/remotes and current deployment/config dependencies without reading secret values. Record owners, provenance and selected version SHA for each transferred component.
2. **Approve target structure.** Review proposed `apps/`, `packages/`, `infrastructure/` divisions, dependency boundaries, CI costs and naming before moving any code. Set branch protections and secret ownership in the primary repository.
3. **Migrate in isolated PRs.** Start with non-executing static or unit-testable pieces. Copy only explicitly reviewed files; preserve licenses, tests, external attribution and risk decisions. Do not merge local staged/untracked content blindly.
4. **Prove equivalence.** Run tests, public-site and lab accessibility checks, auth negative tests, migration replay, rights/assessment validation and security gates on the new primary environment. Preserve Stage 2 frozen evidence and compare fingerprints; obtain independent review.
5. **Prepare reversible cutover.** Verify actual Cloudflare Worker bindings, DNS/routes, custom domains, cache/asset behavior, Supabase identities, rollback plan, observability and traffic; schedule change approval.
6. **Cut over and monitor.** Switch production ownership only after formal approval; verify functionality and rollback readiness. Maintain legacy infrastructure throughout a defined observation window.
7. **Retire legacy.** Archive repositories and disable Workers **only after** confirming no active traffic, dependencies, retention obligation, or fallback need.

## Stop conditions

- An unreviewed working-tree change or credential is at risk of transfer.
- Production DNS, Cloudflare Workers, Supabase authentication/migrations, assessment authority, or Stage 2 acceptance evidence would change without explicit owner authorization.
- Tests fail or source-to-destination provenance is unclear.
- The migration would require assuming the recorded Stage 2 service-role exception was approved.

## Next decision

Approve the target architecture and start a **separate read-only detailed source/deployment inventory**. No file transfer or deletion is part of this PR.
