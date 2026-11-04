# `infrastructure/c3/build` — isolated build-only toolchain

**Status: dependency boundary only. C3-R22 is NOT ported here. No build script exists yet.**

## Why this package exists

C3-R22 needs `vite` and `esbuild`. Adding them to the authoritative root manifest would put two build
toolchains (plus their transitive trees and native binaries) behind the foundation runtime, which serves only
`/health` and the role-approval endpoints. A separate, private package keeps that tree out of the root project
while still giving R22 a reproducible dependency boundary.

## Isolation facts (verified, not assumed)

| Question | Answer |
| --- | --- |
| Is this a root npm workspace? | **No.** Root `workspaces` is `["apps/*","packages/*"]`; `infrastructure/c3/build` matches neither glob. |
| Does it have its own lockfile? | **Yes**, `package-lock.json` in this directory. |
| Can `npm ci` install it reproducibly? | **Yes** — verified by deleting `node_modules` and reinstalling from this lockfile. |
| Is the root manifest touched? | **No.** Root `package.json` and `package-lock.json` are byte-identical before and after. |
| Runtime impact | **None.** Nothing in `apps/`, `infrastructure/cloudflare/` or `packages/` may import this package. |

## Pinned versions and provenance

| Package | Version | Why this version |
| --- | --- | --- |
| `vite` | `7.3.7` | the version actually resolved and reviewed in the staging workspace (declared there as `^7.1.0`) |
| `esbuild` | `0.28.2` | the version actually resolved in staging — **where it is undeclared**, present only as a transitive dependency of `vite`, yet imported directly by `build-evidence-r22.mjs` |

Both are pinned **exactly** (no `^`). The esbuild pin is a deliberate correction: relying on a transitive
dependency that a module imports directly means an unrelated `vite` upgrade could silently change or remove it.

Engines: `vite@7.3.7` declares `^20.19.0 || >=22.12.0`; `esbuild@0.28.2` declares `>=18`. Local Node is
22.23.1, so both are satisfied. The package declares `>=22.12.0 <23` to keep CI on the same major line as the
root project.

## Installing

```powershell
cd infrastructure/c3/build
npm ci --ignore-scripts
```

`--ignore-scripts` is required: no lifecycle script from this tree is reviewed, and `esbuild` obtains its
platform binary through optional dependencies rather than a postinstall hook.

## Rules this package must keep

1. **No deploy or publish capability.** No script, ever: no `wrangler deploy`, `npm publish`, no credentials.
2. **No runtime import.** Cloudflare Worker and request code stay dependency-free.
3. **No write outside a temporary, authorised root.** Any future build script takes an explicit root and
   refuses anything but a temporary output policy (`infrastructure/c3/library/target-policy.mjs`).
4. **No invented evidence.** A build that did not really run must never be presented as R22 evidence.
5. `node_modules/` here is git-ignored by the root `.gitignore` (`node_modules/`), so only the manifest and
   lockfile are tracked.
