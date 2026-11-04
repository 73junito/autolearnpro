# `apps/simulator` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no stable API, no build, no entry point.**

## Intended responsibility

The simulator application is intended to host engineering simulation surfaces for the platform. It is
declared in the scaffold because the architecture assumes an application boundary distinct from
`apps/web`, which today serves only runtime health and role-approval endpoints.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `apps/*` workspace glob
does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- Simulation work is not authorized by this scaffold. CAD and geometry remain governed by the separate
  engineering review process, and no dimension may be treated as verified — the KCOE8006 application
  register is on **FITMENT HOLD**.
- Native (C++/C#) toolchains are installed but their adoption gates are unmet; adding them here would
  require an explicit decision, not an incidental commit.
- Record the choice of runtime and build tool in this file before introducing the first dependency.
