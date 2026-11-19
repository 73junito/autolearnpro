# C3-R41 — Signed synthetic-development approval boundary

**Authorization:** development/testing only. **Production publication and deployment remain HOLD.**

## Cryptographic verification

The pure Node module `apps/catalog/src/lib/catalog-approval.js` accepts a detached Ed25519 signature, raw R40 manifest/provenance/source/generator bytes, an injected asset reader, and an **independently owner-supplied** trust map. It requires a nonrevoked Ed25519 public-only SPKI PEM key scoped to `catalog-synthetic-development-review`. There is no trust-on-first-use, implicit key acquisition, trusted key embedded in the approval, or publication key.

A domain-separated, fixed-format claim includes approval ID, key ID, SHA-256 of the exact manifest and provenance bytes, and **development-only** environment and scope. The verifier rejects extra fields, unsupported algorithms, changed signatures, production scopes, missing trust anchors and revoked keys. It validates the R40 unsigned provenance's SHA-256 chain to the exact source fixture, generator, manifest and synthetic triangle GLB. R39 enforces the asset's exact SHA-256 and byte length through an injected reader.

The result is immutable and explicitly states `publicationAuthorized:false` and `deploymentAuthorized:false`. The sample is a triangle, **not an automotive part or engineering specification**.

## External signing and key custody

`signDevelopmentClaims` requires an **external signing callback** and has no key generation, private-key storage, filesystem or network operations. Tests create ephemeral Ed25519 keys in memory and discard them. No actual owner signing key, signed release approval, or production trust anchor is committed. A signature from a test key is not a release authorization.

## Acceptance and restrictions

```sh
node --test tests/c3-catalog-signed-approval.test.mjs
node infrastructure/scripts/c3-build-sample.mjs --check
```

Negative controls cover forgery, wrong/revoked/absent public keys, private-key PEM substitution, unsupported scope, tampered R40 evidence, source/generator changes and missing/corrupt GLB. The required GitHub Foundation/Academic CI job runs the new tests; R1 and R7 remain mandatory.

The browser catalog remains disconnected from the sample. No production publication, Cloudflare deployment, hosted Supabase migration, DNS, secrets or branch-protection modification is authorized.

**Next:** C3-R42 can prototype a lazy-loaded **local synthetic-only** Three.js viewer after separate review. A real publishing workflow needs independent key custody, trust-anchor distribution, revocation policy and an explicit owner release decision.
