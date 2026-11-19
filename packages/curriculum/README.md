# `packages/curriculum` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no content model, no stable API.**

## Intended responsibility

The curriculum content model: course structure, lesson sequencing and pathway definitions, kept separate
from the applications that render them and from the database that stores learner progress.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `packages/*` workspace
glob does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- No curriculum content, licensing terms or source material have been reviewed into this repository.
  Material from legacy workspaces requires separate provenance and licensing review and must not be
  imported here.
- The academic schema is not merged on this branch (see `apps/classroom/README.md`); a content model
  written before the schema exists will drift from it.
