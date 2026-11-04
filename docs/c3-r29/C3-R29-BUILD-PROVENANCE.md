# C3-R29 — Isolated Build Provenance Contract

Date: 2026-11-04 · Local only. No commit, push, PR, workflow, dependency change or deployment.

## 1. Fingerprints

| Artifact | SHA-256 |
| --- | --- |
| Source baseline `build-provenance-r21.mjs` (staging, unchanged) | `68aee3121c28b3d00a6371645856c4b246ee8a5f3626ea13e05bbf4a7cc3db0c` |
| Port `infrastructure/c3/library/build-provenance-r21.mjs` | `0e36970ca8b2d5a5…` |
| Tests `tests/c3-build-provenance.test.mjs` | `30fe55451581ece1…` |

**Phase A gate cleared before any write:** r21 source matched the C3-R25 manifest exactly; R26 `c23777a2…`,
R27 `820b4d3b…`, R28 policy `b07ff9a9…` and R28 generation `7003b7b3…` were all **unchanged**; 0/7 reviewed
sources drifted.

## 2. Adaptation inventory — four

| # | Adaptation | Why |
| --- | --- | --- |
| 1 | `LIBRARY_TARGETS` → the authorised policy's target pair, requiring **exactly two** distinct targets (`R21_TARGET_SET_INVALID`) | no default, no staging fallback; the contract has exactly two surfaces |
| 2 | every `verifyGeneration` call now passes `allowedTargets` | R28 requires the expected set; without it the manifest target check is meaningless |
| 3 | four claim flags added to the record and pinned `false`: `sourceCommitVerified`, `ciAttested`, `publicationAuthorized`, `deployAllowed`; any forged `true` → `R21_INVALID_POLICY` | an absent flag is a silent default; an explicit false that must be re-asserted is a check |
| 4 | containment re-derived **at the filesystem operation** from the live filesystem, not from the policy object | a directory can be swapped after policy creation |

Preserved from the source: schema/field key-set equality, surface↔library-file mapping, `R21_INVALID_SHAPE`,
`R21_SURFACE_MISMATCH`, `R21_GENERATION_MISMATCH`, `R21_COMMIT_MISMATCH`, deterministic `pairId`,
`publicationAuthorized:false` in both record and pair.

## 3. The four distinctions this module refuses to blur

| Concept | What a hash proves | What it does **not** prove | Where it lives here |
| --- | --- | --- | --- |
| **Integrity evidence** | these bytes match a recorded digest | who produced them, or that the digest itself is trustworthy | `generationId`, `librarySha256` — **verified** |
| **Build provenance** | a build record was made against that evidence | that the build ran where it claims | `buildId`, `artifactSha256` — **asserted by caller** |
| **Trusted CI identity** | nothing, locally | that any CI system produced the evidence, or that a key belongs to a workload identity | `ciAttested` — **pinned false** |
| **Publication authorization** | nothing, locally | that anything may be published or deployed | `publicationAuthorized`, `deployAllowed` — **pinned false** |

`sourceCommit` is a caller-asserted 64-hex **snapshot identifier**. It is never described as a verified Git
commit, and `sourceCommitVerified` cannot be raised by any code path in this module. `CLAIM_CLASSES` exports
the split so a consumer cannot mistake one for the other:

```
assertedByCaller     : buildId, sourceCommit, artifactSha256
verifiedFromEvidence : generationId, librarySha256
neverLocallyVerifiable: ciAttested, deployAllowed, publicationAuthorized, sourceCommitVerified
```

**A well-formed but wrong `artifactSha256` is accepted** — there is no built artifact in this scope to hash.
That is a documented limitation of the contract, not an oversight, and test 4 asserts the module *says so*
rather than leaving it implied.

## 4. Filesystem side-effect assessment

**The module performs no writes at all.** It uses `fs.realpathSync` (containment) and delegates every read to
`verifyGeneration`. No `writeFileSync`, `mkdirSync`, `rmSync`, `renameSync`, `copyFileSync`, lock or journal
access appears in the port. Test 14 confirms byte-level stability of both the generation root and the source
root across a successful verification and a refused one.

### Time-of-check / time-of-use — what is closed and what remains

**Closed this milestone:** containment is no longer taken from the policy object created earlier. Each call
resolves `realpathSync(generationDir)` itself and compares against the live `realpathSync(policy.rootDir)`
(re-derived by `assertPolicy`). Test 17 replaces the generation directory with a junction pointing outside
*after* the policy was valid, and both entry points refuse it with `R21_GENERATION_OUTSIDE_POLICY`.

**Remaining, stated rather than claimed eliminated:**

1. A window exists between the containment check and `verifyGeneration`'s own reads. A directory swapped
   inside that window would be read from the new location. The mitigation is that `verifyGeneration`
   independently re-resolves `realpathSync`, re-parses the manifest and re-hashes every artifact against it —
   so a swapped directory must also carry a self-consistent manifest with an id-derived name. That raises the
   cost; it does not close the class.
2. Windows junctions and POSIX symlinks can be retargeted by a privileged actor at any time. No user-space
   re-checking makes this atomic; only an open-handle-then-verify design would, and that is not implemented.
3. Three symlink-dependent cases remain unexercised on this host (§6).

## 5. Tests — 15 total, 15 pass, 0 fail, 0 skipped

| Required coverage | Result |
| --- | --- |
| Valid temporary generation evidence | **pass** — verified pair, 64-hex `pairId` |
| Matching catalog/Worker generation identifiers | **pass** — shared `generationId`; each surface maps to its own file |
| Mismatched generation identifiers | **pass** — `R21_GENERATION_MISMATCH` |
| Incorrect artifact hashes | **pass** — malformed refused; well-formed-but-unverified accepted **and disclosed** via `CLAIM_CLASSES` |
| Missing / malformed records | **pass** — `null`, `undefined`, array, missing field → `R21_INVALID_SHAPE`; wrong schema → `R21_INVALID_POLICY` |
| Modified catalog / Worker artifacts | **pass** — both → `R21_GENERATION_UNVERIFIED`; restoring bytes restores the pair |
| Deterministic identifiers | **pass** — identical `pairId` on repeat; different asserted commit → different `pairId` |
| Forged source-commit / CI-attestation claims | **pass** — all four flags forced `true` → `R21_INVALID_POLICY`; module emits only `false` |
| Invalid temporary policies | **pass** — absent policy, forged non-temp root → `R21_POLICY_INVALID` |
| Staging / production rejection | **pass** — constructor throws; forged `production` policy → `R21_POLICY_INVALID` or `R28_PRODUCTION_NOT_AUTHORIZED` |
| Missing / inconsistent generation manifests | **pass** — deleted and corrupted → `R21_GENERATION_UNVERIFIED` |
| No persistent filesystem changes | **pass** — before/after snapshots identical |
| No deployment or publication authority | **pass** — all flags false; no `published`/`url`/`deployment`/`releaseAuthorized` keys |
| Interoperability with R26–R28 | **pass** — reader accepts the source pair, policy refuses other tiers, evidence produced by R28 |
| TOCTOU (added beyond the list) | **pass** — swapped directory caught at the operation |

## 6. Verification

| Command | Exit | Result |
| --- | --- | --- |
| `node --test tests/c3-recovery.test.mjs` | **0** | 38 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-reader.test.mjs` | **0** | 14 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-generation.test.mjs` | **0** | 12 pass / 0 fail / **1 skip** |
| `node --test tests/c3-build-provenance.test.mjs` | **0** | **15 pass / 0 fail / 0 skip** |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass |

**Library suites total: 79 pass, 0 fail, 3 skipped** — the three symlink cases, still visible as `# SKIP` in
TAP output and still unverified on this platform.

State: no `generation.json`, `sha256-*`, `.r20-staging-*` or `.r16-*` artefacts anywhere in the repository;
staging drift 0/7; parent `ea67a03` with 30 entries untouched; workflows unchanged (only
`cloudflare-foundation-staging.yml`); **0** imports of `c3/library` from Worker or request code; nothing
staged; **31 untracked files** (measured with `git status --short --untracked-files=all`).

## 7. Remaining security limitations

1. **Integrity ≠ authenticity.** A matching hash proves bytes, not origin. A fabricated `sourceCommit` and a
   fabricated `artifactSha256` both pass this contract by construction — they are asserted fields, and the
   module says so through `CLAIM_CLASSES`.
2. **No CI identity.** `ciAttested` is a hard `false`. No OIDC/workload attestation and no key material exist
   in this repository.
3. **Residual TOCTOU** (§4) — reduced, not eliminated.
4. **Three symlink cases unverified** on Windows.
5. `R22`/`R23`/`R24` unported; `vite`/`esbuild` remain absent from the root manifest.
6. **No staging or production target is authorised**, so no real evidence can currently be produced. That
   fail-closed state is intentional.

## 8. Next milestone

**Do not port `build-evidence-r22.mjs` yet.** R22 imports `vite` and `esbuild` at module load; adding them
changes the root manifest, which is outside this milestone's restrictions, and without them importing R22
throws — which would also make R23 and R24 unrunnable. The honest options are:

- **(a)** an explicit decision to add those two `devDependencies` with the lockfile change reviewed, or
- **(b)** a design change converting them to dynamic imports inside the functions that need them.

Until one is chosen, R22–R24 stay unported by design rather than unported by neglect. A staging-target
authorization decision should remain blocked behind the history-wide sensitive-data review and the
protected-CI work.
