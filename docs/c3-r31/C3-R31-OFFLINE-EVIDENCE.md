# C3-R31 — Offline Artifact Evidence Verification

Date: 2026-11-04 · Local only. **R22's build orchestration is not ported.** No commit, push, PR or deployment.

## 1. The two capabilities, kept separate

| | **A. Offline artifact verification** — implemented now | **B. Catalog/Worker build integration** — deferred |
| --- | --- | --- |
| What it does | validates *supplied* evidence: recomputes digests over supplied bytes, re-verifies the generation and the pair, checks the recorded snapshot string | would *produce* that evidence by running Vite and esbuild |
| Requires | a temporary policy, an evidence directory, a target set | `vite.config.js`, `catalog.html`, `index.html`, `cloudflare/api/src/index.js`, `cloudflare/api/wrangler.jsonc`, `src/`, `cloudflare/api/src/`, `lib/assets/` |
| Available in `F:\autolearnpro`? | yes — pure Node, no toolchain needed | **no — 7 of 9 inputs are absent** (measured in C3-R30) |
| Authorized | yes | **no** |

**No placeholder applications were created to satisfy the input inspector.** Creating `catalog.html` and
`cloudflare/api/src/index.js` just to make a build appear to run would manufacture exactly the evidence this
milestone exists to check.

## 2. Extraction boundaries

| Function | Lines in source | Status | Reason |
| --- | --- | --- | --- |
| `safeFiles` (internal) | 16–26 | **extracted** | pure directory walk, read-only |
| `artifactDigest` | 27–33 | **extracted** | hashes supplied bytes; no writes |
| `sourceSnapshot` | 35–44 | **extracted** | hashes a source tree; read-only |
| `verifyOfflineEvidence` | 74–92 | **extracted, adapted** | read-only verification; needed new signatures |
| `buildOfflineEvidence` | 45–73 | **NOT PORTED** | the only function containing `viteBuild` (56), `esbuild` (58), `mkdirSync` (53, 57) and `writeFileSync` (71) |
| top-level `import … from 'vite'` / `'esbuild'` | 8–9 | **NOT PORTED** | importing the module would otherwise require the toolchain |

Mechanically confirmed: the extracted module contains **no** `vite`/`esbuild` import, no `child_process`, no
`spawn`/`execSync`/`fetch`/`http`, and no `writeFileSync`/`mkdirSync`/`renameSync`/`rmSync`/`copyFileSync`.
Test 15 re-checks this on every run by scanning the file's non-comment lines.

## 3. Adaptations — five

1. **Containment re-derived at the point of access.** Every function takes a `policy` and resolves
   `realpathSync` itself, then checks against `realpathSync(policy.rootDir)` via the shared R28
   `assertPolicy` — which re-derives the tier, the publication flag, the target list and containment from the
   object's values. A forged `{tier:'temporary', rootDir: process.cwd()}` is refused, not trusted.
2. **`artifactDigest` requires the policy** and therefore refuses to hash anything outside the authorised root.
3. **`sourceSnapshot` takes an explicit root.** R22's only root assumption is in the *build* function
   (`HERE`), so the extracted snapshot never had one — but it is now explicit anyway, with no staging fallback.
4. **`verifyOfflineEvidence` takes `policy`, `outputRoot` and `allowedTargets`.** The source called
   `verifyGeneration`/`verifyBuildPair` with one argument; the ported R28/R29 contracts require the target set
   and the policy, so every call site changed.
5. **Provenance/deployment flags are read as truths, not hints.** `publicationAuthorized`,
   `sourceCommitVerified` and `ciAttested` must each be exactly `false`; `deployAllowed: true` is refused if
   the key is present. Any other value is `R31_INVALID_POLICY`.

Deliberate fidelity: `sourceSnapshot` still returns a digest **string** (as in the source) so an evidence
record compares identically, and `artifactDigest` still returns `{sha256, files}` with the same fold.

## 4. Evidence validation — the six things kept apart

| Concept | Where it comes from | Status in the verdict |
| --- | --- | --- |
| **Recorded artifact digests** | `offline-evidence.json` (`catalog.sha256`, `worker.sha256`) | a *claim* — compared against recomputation |
| **Recomputed digests** | this module, hashing supplied bytes | **verified** — `digests.*.recomputed` |
| **Local source snapshot** | `sourceSnapshotSha256`, `build.sourceCommit` | **local evidence only** — `claims.localSourceSnapshotOnly` |
| **Actual Git commit provenance** | nothing local | `NOT_ESTABLISHED` |
| **Trusted CI attestation** | nothing local | `NOT_ESTABLISHED` |
| **Publication authorization** | a flag that must read `false` | `false`, or the record is refused |

A matching SHA-256 proves *these bytes* match *that digest*. It does not prove who produced them, which commit
they came from, or that any CI system ran. `sourceSnapshot` is explicitly a **local evidence value**: it hashes
a source tree the caller nominated, on a machine the caller controls, for a snapshot that exists only because
the caller said so. The verdict states this in `claims.notEstablished` on **every** successful verification —
not only in this document.

## 5. Filesystem security and remaining TOCTOU

Closed: policy re-derived per call; containment checked against live `realpathSync`; traversal refused; junction
escape refused (`R31_EVIDENCE_DIR_OUTSIDE_POLICY`); symlinked artifacts refused inside the walk
(`R31_SYMLINK_OUTPUT`); symlinked evidence file refused (`R31_SYMLINK_EVIDENCE`); verification never repairs,
recreates or writes — test 4 asserts a deleted `worker/` stays deleted, test 14 asserts a byte-identical tree.

**Remaining, stated rather than claimed eliminated:**

1. Between the containment `realpathSync` and the subsequent `readFileSync` calls there is a window. A
   directory swapped inside it would be read from the new location. `safeFiles` re-walks with `lstat` per entry
   and the digests must still match the recorded values, so a swap must also preserve bytes exactly — which
   reduces the attack to "same bytes, different location". Not closed; only made uninteresting.
2. Only an open-handle-then-hash design would close it. Not implemented.
3. A privileged actor can retarget junctions at any time.

## 6. Tests — 14 total, 13 pass, 0 fail, 1 skipped

| Requirement | Result |
| --- | --- |
| 1. Valid supplied evidence | **pass** — `ok:true`, pair and generation ids match |
| 2. Matching artifact SHA-256 | **pass** — recorded == recomputed for both surfaces |
| 3. Modified artifact bytes | **pass** — `R31_ARTIFACT_TAMPERED` |
| 4. Missing artifact | **pass** — `R31_ARTIFACT_UNREADABLE:…`, and **not recreated** |
| 5. Malformed records | **pass** — wrong schema, missing digests, invalid JSON, absent file all fail closed |
| 6. Invalid source snapshot | **pass** — `R31_SNAPSHOT_MISMATCH`; `R31_SOURCE_MISSING:vite.config.js` from the snapshot itself |
| 7. Forged Git-commit claim | **pass** — `R31_INVALID_POLICY` |
| 8. Forged CI attestation | **pass** — top-level `R31_INVALID_POLICY`; buried in a build record → `R31_PAIR_MISMATCH` |
| 9. Wrong catalog/Worker pairing | **pass** — refused |
| 10. Invalid temporary policy | **pass** — absent and forged-root policies refused; staging construction throws |
| 11. Path traversal | **pass** — refused |
| 12. Realpath escape | **pass** — junction → `R31_EVIDENCE_DIR_OUTSIDE_POLICY` |
| 13. Symlink behaviour | **SKIPPED** — host refuses file symlinks without elevation |
| 14. Deterministic repeats | **pass** — three deep-equal verdicts, tree unchanged |
| 15. No writes / subprocess / network | **pass** — static scan of non-comment lines on every run |
| 16. Publication authorization rejected | **pass** — `publicationAuthorized:true` and `deployAllowed:true` both `R31_INVALID_POLICY` |

**These are synthetic fixtures.** No catalog or Worker build exists and no bundler ran. Passing them is not
evidence that a build succeeded — only that supplied evidence is checked correctly.

## 7. Regression

| Command | Exit | Result |
| --- | --- | --- |
| `node --test tests/c3-offline-evidence.test.mjs` | **0** | 13 pass / 0 fail / **1 skip** |
| `node --test tests/c3-recovery.test.mjs` | **0** | 38 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-reader.test.mjs` | **0** | 14 pass / 0 fail / **1 skip** |
| `node --test tests/c3-library-generation.test.mjs` | **0** | 12 pass / 0 fail / **1 skip** |
| `node --test tests/c3-build-provenance.test.mjs` | **0** | 15 pass / 0 fail / 0 skip |
| `node --test tests/c3-build-toolchain.test.mjs` | **0** | 10 pass / 0 fail / 0 skip |
| `node docs/c3-r25/verify-review.mjs` | **0** | 14/14 |
| `npm run validate:foundation` | **0** | 13 directories |
| `npm run test:runtime` | **0** | 3 pass |

**C3 suites total: 102 pass, 0 fail, 4 skipped.** The four skips are Windows file-symlink cases (R26, R27, R28,
R31); each remains visible as `# SKIP`.

## 8. Fingerprints and state

| Artifact | SHA-256 (prefix) |
| --- | --- |
| `infrastructure/c3/build/offline-evidence-r22.mjs` | `49c03288d21cee1c…` |
| `tests/c3-offline-evidence.test.mjs` | `337f756c9e909606…` |
| Source baseline `build-evidence-r22.mjs` (unchanged) | `262d6ecbac5da4e8…` |

Integrity gate before writing: R22 source **MATCH**; 7 reviewed sources **0 drift**; R26 `c23777a2…`,
R27 `820b4d3b…`, R28 policy `b07ff9a9…`, R28 generation `7003b7b3…`, R29 `0e36970c…`, R30 guard `40d856d5…`
— all unchanged.

State: `HEAD ea67a03`, nothing staged, **41 untracked files**, **1 modified tracked file** (`.gitignore`, from
C3-R30). Root manifests untouched. Staging drift 0/7. Parent worktree untouched.

## 9. Limitations

1. **Three of four symlink cases unverified** on this platform — file-symlink creation needs elevation on
   Windows. The fourth (junction escape) runs and passes.
2. **Residual TOCTOU** around containment/read (§5).
3. **Intentional incompatibility with original staging evidence.** This verifier accepts evidence shaped by the
   *ported* R29 contract, which carries four claim flags the original R22 records did not. Old staging evidence
   fails `R21_INVALID_SHAPE`. That is correct behaviour, but it means staging evidence must not be fed here and
   treated as valid.
4. Nothing here establishes Git provenance or CI identity, and the module says so on every success.

## 10. Next milestone

The remaining R22 gap is **architectural, not code**: there is no catalog or Worker application to build.
Recommended C3-R32 is a **decision record** for that build — framework, entry points, output layout, Worker
boundary — with no implementation. Porting `buildOfflineEvidence` before that decision exists would encode a
build for an application that does not exist, which is exactly why it stays deferred here.
