# C3-R48 — Synthetic Geometry Complexity and Admission Boundaries

**Authorization:** development/testing only. **Production publication and Cloudflare Workers deployment remain HOLD**. No hosted Supabase/DNS changes or real automotive parts are included.

## What changed

R48 adds `apps/catalog/src/lib/synthetic-geometry-budget.js`, a pure GLB 2.0 byte validator used by the isolated local viewer **after R39 byte-length/SHA-256 verification and before lazy importing Three.js**. Geometry limits are explicitly smaller than the general R39 manifest asset-byte allowance. R48 validates the GLB header/chunks, one glTF scene/node/mesh and triangle primitive, tightly bounded position/index accessors, finite coordinates, declared bounds and index references. It rejects unexpected fields, unknown extensions, materials, textures, external URIs, corrupted binary ranges, nonfinite coordinates and excess geometry.

| Development-only budget | Limit |
|---|---:|
| GLB file | 65,536 bytes |
| POSITION vertices | 128 |
| Triangle faces | 256 |
| Index entries | 768 |
| Mesh primitives | 1 |
| Coordinate magnitude | ≤1,000 |

These are *admission/test budgets*, not statements of geometric engineering accuracy, equipment suitability or performance for complex vehicle assemblies.

## Deterministic non-automotive fixture

`infrastructure/scripts/c3-build-complexity-fixture.mjs` generates a reproducible **748-byte, eight-vertex, 12-triangle indexed cube** as `tests/fixtures/c3-r48-synthetic-cube.glb`. It is stored **only** under `tests/fixtures`, not in `apps/catalog/sample`, any public asset folder, or the production catalog. The script supports an explicit `--write` mode and read-only `--check`, and rejects output symlinks.

The existing R40 demonstration triangle is unchanged. The viewer's separate synthetic route still only permits its **three-vertex, one-triangle** geometry even when a cube is valid under the wider R48 test limits. A manipulated GLB with an otherwise matching R39 SHA-256 fails before the renderer is imported.

## Reproduce acceptance

```sh
node infrastructure/scripts/c3-build-complexity-fixture.mjs --check
node --test tests/c3-synthetic-geometry-budget.test.mjs tests/c3-geometry-viewer-boundary.test.mjs
node infrastructure/scripts/c3-build-sample.mjs --check
npm run build --workspace @autolearnpro/catalog
npm run build:viewer:dev --workspace @autolearnpro/catalog
```

The required Foundation/Academic CI job enforces both new checks and retains all existing R39–R47, browser/WebGL, disposable database, and governance gates. No private signing keys, credentials, public deployment or new publication approvals were created.

## Known boundaries

This is a deliberately restrictive glTF subset parser; supporting legitimate richer glTF data requires a **separately reviewed schema and threat model**. It does not evaluate visual model accuracy, collision, watertightness, animation, physics, material semantics, mechanical dimensions, or real-world automotive tolerances. The R41 signed approval system remains development-only and is not a publication authorization.
