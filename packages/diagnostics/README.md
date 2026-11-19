# `packages/diagnostics` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no probes, no stable API.**

## Intended responsibility

Diagnostic and health-check helpers that report on the state of running components, as distinct from
tests, which assert behaviour offline. `tests/runtime-health.test.mjs` already exercises runtime health;
the intended split is that reusable probe logic lives here and the test merely calls it.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `packages/*` workspace
glob does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- Diagnostics must be **read-only**. A probe that mutates state is not a diagnostic and does not belong
  in this package.
- No credential, connection string or role key may be embedded, logged or echoed by a probe.
- Do not import from application internals: diagnostics must keep working when an application is
  broken, which is the case they exist for.
