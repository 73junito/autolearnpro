# C3-R39 — Catalog Data Contract (source-only)

## Status and authority
This milestone defines a **read-only, untrusted-input validation boundary**. It does not publish a catalog, attest to engineering accuracy, permit student access, authorize a vehicle fitment claim, deploy a Worker, or contact hosted Supabase. The R38 browser shell is not wired to an external dataset.

## Version 1 envelope
The manifest is a JSON object with **exactly** three keys:

- `schemaVersion`: integer `1` (future versions rejected until explicitly reviewed)
- `records`: array of at most 1,000 entries, each with exactly `id`, `title`, `assetId`
- `assets`: array of at most 1,000 entries, each with exactly `id`, `path`, `sha256`, `byteLength`, `mimeType`

Each record ID and asset ID uses lowercase kebab-case and is unique. Asset references must exist; orphaned assets are rejected. Titles must be nonempty trimmed strings without control characters. An empty manifest is valid and contains **no claim** of populated catalog data.

An asset path must be relative and contained under `assets/<segment>/<filename>.glb` (or .gltf/.bin), with conservative ASCII characters and no traversal, URLs, encoded slash, query, or fragment. Asset metadata uses lowercase SHA-256 hex, exact positive byte count (25 MiB maximum), and an allowlisted MIME type.

## Verification and trust boundary
`validateCatalogManifest(input)` validates structure and returns a fully frozen copy. `loadVerifiedCatalog(input, { readAsset, cryptoProvider })` calls an **injected binary reader**, then checks the length and SHA-256 of **every** asset before returning any records. No implicit fetch, filesystem access, or writes. Caller must constrain the injected reader to a trusted asset store; digest verification alone is not a publication signature or evidence of correctness. Reader failures and missing WebCrypto fail closed.

Record titles are labels only; do not treat them as HTML. No vehicle-application mapping, calibration, minimum thickness, torque specifications, or professional repair authorization is defined. No real asset file is included in R39.

## Acceptance
Run `node --test tests/c3-catalog-data-contract.test.mjs` and the existing catalog shell and accessibility tests. CI requires these checks within the Foundation/Academic job, in addition to the pre-existing R1 and R7 mandatory gates. No changes to branch-protection rules, production Cloudflare, DNS, secrets, or hosted Supabase are permitted.

## Next phase
C3-R40 should introduce an independently reviewed catalog dataset source, immutable build/provenance evidence, and then a separate, lazy-loaded Three.js viewer behind the verified loader. Production/publication must remain a separate authorization.
