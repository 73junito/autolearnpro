# `packages/ui` — reserved (no implementation)

**Status: reserved scaffold directory. No code, no components, no stable API.**

## Intended responsibility

Shared presentation components, so that `apps/web`, `apps/classroom` and `apps/simulator` do not
each reimplement the same interface elements.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

It is deliberately **not** a package: no `package.json` is present, so the root `packages/*` workspace
glob does not treat it as a workspace and `npm ci` is unaffected.

## Before adding code here

- **No UI framework has been adopted in this repository.** The separate engineering staging workspace
  does not use one either: it is Vite 7 with vanilla JavaScript ES modules and Three.js. Nothing may be
  inherited implicitly by copying a component out of that workspace.
- The framework decision that governs UI work here is
  `docs/c3-r33/C3-R33-CATALOG-FRAMEWORK-DECISION.md`: vanilla JavaScript ES modules, Three.js and Vite,
  with no React, no React Three Fiber and no TypeScript. `apps/catalog` implements it.
- **Correction (C3-R34).** This file previously stated that the staging workspace "uses React with Vite".
  That was never true — measured in C3-R33 §2.1, the staging workspace has zero `.jsx`/`.tsx`/`.ts` files
  and no React dependency. The sentence is corrected here rather than left to propagate.
- The first dependency added here becomes a decision for every consuming application. Record the choice
  and its justification in this file first.
- `apps/catalog` builds a UI as of C3-R34, so a dependency added here now has a second real consumer
  rather than a hypothetical one.
