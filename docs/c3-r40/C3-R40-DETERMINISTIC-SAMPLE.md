# C3-R40 — Deterministic synthetic dataset

This milestone is source-only and does **not** authorize publication, vehicle application, deployment or a user-facing catalog.

The fixed, human-readable source `apps/catalog/fixtures/demo-triangle.json` generates one synthetic triangle (not an automotive part). The deterministic GLB 2.0 asset, R39-compatible manifest and unsigned provenance are committed under `apps/catalog/sample/`. Provenance binds the exact input source SHA-256, generator-script SHA-256 and both output hashes and byte lengths, but it is **not** a cryptographic signature or proof of engineering correctness.

Generate: `node infrastructure/scripts/c3-build-sample.mjs --write`.
Verify without mutation: `node infrastructure/scripts/c3-build-sample.mjs --check`.
Negative controls: `node --test tests/c3-catalog-provenance.test.mjs`.

The source and output paths are fixed, and the generator rejects unreviewed fixture content and symlink outputs. The R39 injected-reader integrity contract independently verifies the generated binary. The browser catalog shell remains disconnected and the Cloudflare production and hosted Supabase HOLDs remain in effect.

Next: independently review a real dataset source and publication authority before integrating a lazy Three.js viewer.
