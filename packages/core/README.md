# `packages/core` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no stable API.**

## Intended responsibility

Shared domain logic that more than one application needs: validation, contracts and pure computation
with no framework coupling.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `packages/*` workspace
glob does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- The engineering contract work (schemas, lifecycle rules, domain checker) was developed and validated
  in a separate staging workspace under `docs/web-first-architecture-review/shared-contract-c3/`. **It
  has not been integrated into this repository**, and nothing here implies it has.
- If that contract is later integrated, it must be brought in as reviewed source with its own tests and
  a pinned validator version — not by bulk-copying a directory whose package manifest differs from this
  one.
- Shared logic added here must not acquire a dependency on a specific application or on `pg`.
