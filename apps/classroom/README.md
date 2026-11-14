# `apps/classroom` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no stable API, no build, no entry point.**

## Intended responsibility

The classroom application is intended to host course delivery and learner-facing surfaces. It is a
separate application boundary from `apps/web` because classroom traffic, authorization needs and rate
limits differ from the runtime/role-approval endpoints currently served there.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `apps/*` workspace glob
does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- An academic data model is **not** part of this branch. Academic migrations exist only as untracked
  work in the parent worktree `F:\autolearnpro` and are not merged, reviewed or applied here. Do not
  assume their schema, policies or naming.
- Any classroom surface touching learner data must be reviewed against row-level security boundaries
  before it is built, not after.
- Record the runtime and build tool here before introducing the first dependency.
