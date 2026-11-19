# C3-R36C — Offline Evidence Persistence Contract

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local contract implementation, temporary-file testing and documentation only. `buildOfflineEvidence` is NOT
ported, no deployment or production authorisation exists or was created, and no commit was made. KCOE8006
FITMENT HOLD remains active; GitHub and production remain on HOLD.**

## 1. Outcome — B12 is answered: evidence has a format, and it is not an attestation

`infrastructure/c3/build/evidence-envelope.mjs` defines
`alp-c3-offline-evidence-envelope/v1`: a canonically serialized, digest-bound record that binds an R36A snapshot,
an R36B bundle record and the bytes on disk, states three things it verified locally and seven it cannot
establish, and refuses every attempt to raise a trust flag.

| Phase | Result |
| --- | --- |
| A — integrity gate | **no drift** — ten fingerprints matched; deployment still gated `if: ${{ false }}` |
| B — schema | **implemented** — 21 flat, uniquely named fields, canonical length-prefixed rows |
| C — claims | **classified** — 3 verified locally, 7 not established, 4 flags pinned false |
| D — persistence | **temporary-only**, exclusive creation, fsync, read-back verification |
| E — reader | **binds to real inputs** — a re-sealed forgery still fails |
| F — tests | **18/18 pass**, 5/5 mutation probes caught |
| G — regression | **5 commands, all exit 0** |

## 2. Phase A — integrity gate

| Check | Value |
| --- | --- |
| `worker-bundle.mjs` (R36B) | `75528944152e61ce…` — matches |
| `c3-worker-bundle-feasibility.test.mjs` | `c92f6a9e1228e14a…` — matches |
| `C3-R36B-WORKER-BUNDLE-FEASIBILITY.md` | `3ddc5e288482ff2e…` — matches |
| `source-snapshot.mjs` (R36A) | `47656cf695608057…` — matches |
| `build-input-contract.mjs` (R35) | `8fc0b8ccfb7df46f…` — matches |
| R30 `package.json` / lockfile | `b33b1db8bb9ac557…` / `aee38b5df3b732c9…` — unchanged |
| Isolated toolchain | `esbuild 0.28.2` installed in `infrastructure/c3/build/node_modules` |
| `worker.mjs` / `wrangler.jsonc` | `261732ecb9accae4…` / `df6486888a42317d…` — unchanged |
| Integration HEAD / status | `ea67a03`, 31 default / 60 `--untracked-files=all`, **0 staged** |
| Parent worktree | `ea67a03`, 30 entries — untouched |
| Staging drift | **0/7** — R25 reviewer 14/14 PASS |
| Deployment / production authorisation | **none** — the only workflow is `workflow_dispatch`, its Wrangler step is `--dry-run`, and the deploy job carries `if: ${{ false }}` |

## 3. Phase B — the envelope schema

Schema `alp-c3-offline-evidence-envelope`, version `1`. Every field name is unique across the whole document,
because uniqueness is what makes the duplicate-field check sound.

| Field | Type | Meaning |
| --- | --- | --- |
| `envelopeSchema`, `envelopeVersion` | string, int | identity of this format |
| `snapshotSchema`, `snapshotCombinedSha256`, `snapshotEntryCount` | string, hash, int | the R36A record this evidence is about |
| `workerSourceSha256`, `workerSourceBytes` | hash, int | the Worker source the bundle came from |
| `artifactRole`, `artifactPath` | `'worker'`, `'worker.mjs'` | artifact identity, as a **bare relative name** |
| `artifactSha256`, `artifactBytes` | hash, int | the bundle's own digest and length |
| `toolchainName`, `toolchainVersion`, `buildConfigId` | strings | `esbuild`, `0.28.2`, `alp-c3-r36b-worker-bundle-v1` |
| `verifiedLocally` | array(3) | exactly what this record's writer checked |
| `notEstablished` | array(7) | exactly what it cannot establish |
| `sourceCommitVerified`, `ciAttested`, `publicationAuthorized`, `deployAllowed` | `false` | pinned, never negotiable |
| `envelopeSha256` | hash | digest over the canonical rows |

### Canonical serialization, specified

The digest is **not** taken over the JSON text. It is taken over tagged, length-prefixed rows in a fixed order:

```
schema|26:alp-c3-offline-evidence-envelope
version|1:1
snapshot|27:alp-c3-r36a-multi-root-snapshot|64:58d5eccc…|1:8
source|64:261732ec…|3:613
artifact|6:worker|10:worker.mjs|64:a955e25f…|3:579
toolchain|7:esbuild|6:0.28.2|30:alp-c3-r36b-worker-bundle-v1
verified|34:sourceBytesMatchRecordedDigest
… one row per array element …
claims|5:false|5:false|5:false|5:false
```

Three consequences, each tested:

1. **Boundaries are unambiguous.** With a plain join, `surface` + `a` + `b` and `surface` + `ab` would collide; a
   length prefix cannot be re-split.
2. **Key order in the stored file is irrelevant**, because the digest is computed from the rows, not from the
   serialized JSON. Test 1 rewrites the document with reordered keys and verifies successfully.
3. **Nothing environment-dependent enters the digest**: no timestamp, no absolute path, no hostname, no username,
   no random identifier. Test 1 asserts the canonical text contains no drive letter, no `/tmp/` and no ISO date.

### The real envelope, recorded

```
envelopeSha256       f03921ace88f8f6c1cfa736f3b54cac01060f3ffc5eea1782fdc8713ec93e525
snapshotCombinedSha256 58d5eccc1babe48611f198ccd999341cc98b354efbfe616be8b42d4ef03c3f10
workerSourceSha256  261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e  (613 B)
artifactSha256      a955e25fbb32a6cd5677091ffe24db7a04355821ee76fd7aead547e6d234278a  (579 B)
file               1,231 B, sha256 1f46a2570f91d44c9a0ff97e12a176b59575111cca452e57fb8b5b23f78f7804
```

Every digest agrees with the milestone that first recorded it: the snapshot with C3-R36A, the worker and bundle
with C3-R36B. That agreement is the point — the envelope did not invent values, it bound existing ones.

## 4. Phase C — claim classification

### Verified locally (3) — operations the writer performed, not promises

| Claim | What it means mechanically |
| --- | --- |
| `sourceBytesMatchRecordedDigest` | the Worker source was re-read and re-hashed, and the digest equals the one the snapshot recorded |
| `artifactBytesMatchRecordedDigest` | the emitted bundle bytes were hashed and match what the envelope records |
| `snapshotMatchesReviewedContract` | the snapshot's schema, combined digest and entry count are the reviewed R36A contract's |

### Not established (7) — stated on every record, digest-covered so they cannot be deleted

`gitOrigin` · `ciWorkloadIdentity` · `publisherIdentity` · `signedReleaseAttestation` · `humanReleaseApproval` ·
`publicationAuthorization` · `deploymentAuthorization`

### The four flags

`sourceCommitVerified`, `ciAttested`, `publicationAuthorized`, `deployAllowed` are **`false` in every record this
module can produce or accept**. The writer refuses a true flag; the reader refuses a document containing one; and
because the flags participate in the digest, flipping one also breaks the digest — two independent reasons a
forgery fails.

**A caller-supplied claim never becomes verified evidence.** `createEvidenceEnvelope` takes a snapshot, a bundle
and a toolchain. It takes no claim arguments at all, so there is no parameter through which authority could be
passed in.

## 5. Phase D — temporary persistence

| Requirement | Implementation |
| --- | --- |
| Validate before writing | `assertEnvelopeShape` runs first; an invalid envelope never reaches the filesystem |
| Caller-supplied destination | `evidenceRoot` is required, with no default anywhere in the module |
| Refuse existing destinations | `lstat` then `openSync(destination, 'wx')` — never overwrite, never repair |
| Exclusive creation + durability | `'wx'` plus `fsyncSync` on the file descriptor |
| Verify final bytes | the file is read back and re-hashed; `R36C_WRITE_VERIFY_FAILED` if it differs |
| Refuse link escapes | the destination is resolved with `realpathSync` and checked against the policy root; a linked destination is refused by name |
| Never default to staging/production | impossible: `assertPolicy` issues only a temporary tier, whose root must resolve inside `os.tmpdir()` |
| Never write into source | `R36C_EVIDENCE_ROOT_INSIDE_SOURCE` when `roots` are supplied |
| No repair of malformed evidence | an existing file blocks the write; verification never rewrites |
| Cleanup limited to owned resources | `removeEvidenceFile` deletes only the envelope, refuses links, and reports `R36C_EVIDENCE_MISSING` rather than succeeding quietly |

### Windows versus Linux durability — the honest difference

| Aspect | POSIX (Linux/macOS) | Windows |
| --- | --- | --- |
| File flush | `fsync(fd)` | `fsync(fd)` |
| Directory entry flush | `fsync` on a directory handle is supported and **is** performed | a directory handle cannot be fsynced (it would raise `EPERM`), so it is skipped |
| Crash window | the entry is durable once both flushes return | contents are flushed; the **directory entry** is durable only per NTFS's own commit behaviour |
| Reported in the record | `durable: 'file+directory fsync'` | `durable: 'file fsync only (directory fsync unsupported on this platform)'` |

No atomic rename is used, deliberately: requirement 3 forbids overwriting, and rename-over would contradict it.
The consequence is that an interrupted write **can** leave a partial file at the destination — and that file is
detected and refused (test 15), not repaired. That is the trade this milestone chose, and it is stated in the
record itself rather than buried here.

## 6. Phase E — independent verification, and why self-consistency is not enough

`verifyEvidenceFile` takes the expected `snapshot` and `toolchain` **from the caller**, never from the file:

1. read the raw bytes; **detect duplicate fields in the raw text** (JSON.parse would silently keep the last one);
2. parse, validate the schema and every field, then recompute `envelopeSha256` from the canonical rows;
3. re-hash the artifact bytes from disk and compare size and digest;
4. compare `snapshotSchema`, `snapshotCombinedSha256` and `snapshotEntryCount` against the **independently
   supplied** snapshot;
5. compare `workerSourceSha256` and `workerSourceBytes` against the Worker entry in that snapshot;
6. compare `toolchainName`, `toolchainVersion` and `buildConfigId` against the **independently supplied**
   toolchain;
7. return what it establishes and what it does not, with all four claims `false`.

Steps 4–6 are what make a re-sealed forgery fail: the tests edit a field, recompute the envelope digest with the
module's own exported `computeEnvelopeDigest`, write it, and verification still refuses — because the file's
internal consistency was never the thing being checked.

### Source-to-evidence flow

```
  working tree                                   records                          bytes on disk
  ─────────────                                  ───────                          ─────────────
  repository root ──┐
  apps/catalog ─────┼─► R35 assertBuildInputMapping ─► R36A createSourceSnapshot ─► snapshot.combinedSha256
  worker root ──────┘        (9 inputs, 3 roots)          (8 entries)                        │
                     │                                                                       │
                     └─► R36B assertWorkerBoundary ─► esbuild 0.28.2 ─► bundle ─► artifactSha256 / bytes
                                                                              │                │
                                                      R36C createEvidenceEnvelope ◄──────────┘
                                                                 │  binds snapshot + bundle + toolchain,
                                                                 │  pins four flags false, states 3 and 7
                                                                 ▼
                                             writeEvidenceEnvelope ── 'wx' + fsync + read-back
                                                                 ▼
                                             evidence.json ──► verifyEvidenceFile
                                                                 │  re-reads bytes, recomputes digest,
                                                                 │  re-derives snapshot and toolchain
                                                                 ▼
                                                    ok / refused, with establishes[] and doesNotEstablish[]
```

## 7. Phase F — the tests

`tests/c3-offline-evidence-persistence.test.mjs`, 18 cases, all passing. Every fixture is a disposable temporary
directory under an R28 temporary policy; the real Worker and the real catalog are the subject.

| # | Case | Result |
| --- | --- | --- |
| 1 | Deterministic serialization and hashing | pass — repeat digest identical; canonical text carries no drive letter, temp path or ISO date; reordered JSON keys still verify |
| 2 | Successful temporary persistence | pass — written inside the authorised directory, read-back digest matches, durability string names the flush actually performed |
| 3 | Independent reload and verification | pass — artifact digest equals the R36B bundle; source digest equals the snapshot's Worker entry |
| 4 | Single-byte corruption | pass — edited count and flipped hash character each refused |
| 5 | Forged snapshot digest | pass — re-sealed forgery → `R36C_SNAPSHOT_MISMATCH` |
| 6 | Forged bundle digest | pass — re-sealed artifact digest, byte count and source digest each refused |
| 7 | Missing bundle | pass — refused, and **not** rebuilt |
| 8 | Duplicate artifact entries | pass — `R36C_DUPLICATE_FIELD:artifactSha256`, caught in the raw text |
| 9 | Unknown schema version | pass — `R36C_SCHEMA_UNSUPPORTED:2`; an R22-shaped schema is refused with its own reason |
| 10 | Additional unexpected fields | pass — unknown and missing fields each refused by name |
| 11 | Forged CI or Git provenance | pass — each flag refused; the writer cannot create such a record |
| 12 | Forged publication authority | pass — both flags refused |
| 13 | Existing destination refusal | pass — existing evidence is byte-unchanged after the refusal |
| 14 | Symlink/junction escape | pass — outside-policy root, junctioned root and source-directory placement all refused |
| 15 | Crash or interrupted write | pass — truncated file refused as unreadable and left untouched |
| 16 | Repeated verification without mutation | pass — two verifications identical; three trees digest identically before and after |
| 17 | Cleanup limited to owned resources | pass — only the envelope is removed; an unrelated file survives; a second removal fails loudly |
| 18 | No network, cloud, GitHub or deployment activity | pass — no such token in the module; imports are exactly the R28 policy, R36A, R36B and three Node builtins |

No skip was used: every case ran on this host. The link case uses a directory junction, which Windows permits
without elevation.

### Mutation probes — the guards are not vacuous

| Probe | Weakened | Caught by |
| --- | --- | --- |
| M1 | duplicate-field scan removed | test **8** |
| M2 | artifact digest comparison removed | test **6** |
| M3 | snapshot binding to the expected digest removed | test **5** |
| M4 | trust-flag comparison removed | tests **11 and 12** |
| M5 | `R36C_DESTINATION_EXISTS` refusal removed | test **13** |

Every probe restored **byte-identically** (`47f2a7770c519fbb…` before and after the sequence).

**What the tests do not prove:** that this survives a privileged adversarial actor, that the record is admissible
in any external review, or that a persisted envelope still verifies after the repository changes — it will not,
and that is by design.

## 8. Phase G — regression, exact exit codes

Run **sequentially**, in this order:

| Command | Exit | Result |
| --- | --- | --- |
| `node --test "tests/c3-*.test.mjs"` | **0** | **176 tests · 172 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run validate:foundation` | **0** | `Foundation 1 validated: 13 directories…` |
| `npm run test:runtime` | **0** | 3 pass / 0 fail / 0 skipped |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 95ms` |

No dependency installation ran, so nothing could be disturbed by a concurrent install. C3 totals moved from 158
tests (C3-R36B) to **176** because this milestone adds 18.

The four skips are unchanged host-capability cases: library generation 8b, library reader 11, offline evidence 13
and the journal symlink case. R26–R28 passed on Ubuntu with zero skips; **R31's and R35's link cases remain
unverified on Linux (B6)**.

## 9. B12 disposition

| Blocker | Status | Basis |
| --- | --- | --- |
| **B12 — evidence-file format** | **Resolved for the local contract** | A versioned envelope exists, with a specified canonical serialization, a temporary-only writer, an independent reader, and 18 tests including five probes |
| What it still does not authorise | — | Persisting evidence anywhere permanent. **No repository evidence directory was created**, nothing was written outside a disposable temporary tree, and no CI job consumes the format |

One constraint worth recording: the reader needs an **empty** output directory to re-derive the snapshot, because
R36A's mapping gate requires it. Three directories under one policy root (build, evidence, verify) is the
workaround this milestone used. A future versioned R36A API could remove the friction; modifying the frozen R36A
record to make this milestone tidier was not done.

## 10. Artifact fingerprints and changed-file inventory

### Created — 3 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/evidence-envelope.mjs` | 20,348 | `47f2a7770c519fbb9fbd9b88fc7cae34d5a2082fe6cc5f713ea7452d687ace70` |
| `tests/c3-offline-evidence-persistence.test.mjs` | 17,649 | `15b4b744e08f82bfcf4926bbcac8086716fdb343f0161dbbefd28c87a4373b47` |
| `docs/c3-r36c/C3-R36C-OFFLINE-EVIDENCE-PERSISTENCE.md` | this file | reported with the handoff, not inside itself |

### Ephemeral evidence from the recorded run (temporary only, gone afterwards)

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| `evidence.json` | 1,231 | `1f46a2570f91d44c9a0ff97e12a176b59575111cca452e57fb8b5b23f78f7804` |
| envelope digest | — | `f03921ace88f8f6c1cfa736f3b54cac01060f3ffc5eea1782fdc8713ec93e525` |

### Modified — none

No existing file was edited. Verified unchanged: `worker-bundle.mjs` (`75528944…`), `source-snapshot.mjs`
(`47656cf6…`), `build-input-contract.mjs` (`8fc0b8cc…`), `build-root-guard.mjs` (`40d856d5…`),
`target-policy.mjs`, `worker.mjs` (`261732ec…`), `wrangler.jsonc` (`df648688…`), R30 `package.json` /
`package-lock.json` (`b33b1db8…` / `aee38b5d…`), all four `apps/catalog` sources, root `package.json`
(`ac8d0bec…`), root `package-lock.json` (`f805b6f7…`), and every earlier C3 test suite.

### Dependency, manifest and target state

No dependency installed, added or removed; no lockfile written; no repository evidence directory created; no
staging or production target expressible, because the only policy this module accepts is the R28 temporary tier.

## 11. Final Git state

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **33** default / **63** `--untracked-files=all` (was 31 / 60) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, parent repo, TorqueMind | **none touched** |

## 12. Acceptance criteria

- [x] All ten upstream fingerprints verified before any write; deployment confirmed still gated `if: ${{ false }}` (§2).
- [x] Versioned schema with immutable fields covering snapshot, source, artifact, toolchain, claims and envelope digest (§3).
- [x] Canonical serialization with unambiguous, length-prefixed boundaries; key order and environment excluded from the digest (§3, test 1).
- [x] Unknown and duplicate fields, malformed hashes, unsupported versions and inconsistent relationships all refused (§7, tests 8–10).
- [x] Claim classification explicit: 3 verified locally, 7 not established, 4 flags pinned false and digest-covered (§4).
- [x] A caller-supplied claim has no route into the record — the builder takes no claim parameters (§4).
- [x] Persistence temporary-only, caller-supplied, exclusive, flushed, read-back verified, link-refusing, source-refusing (§5).
- [x] Windows/Linux durability difference documented and reported in the write result rather than glossed (§5).
- [x] Reader binds to independently supplied snapshot and toolchain; a re-sealed forgery still fails (§6, tests 5–6).
- [x] 18 tests pass; 5 mutation probes prove they can fail; all restored byte-identically (§7).
- [x] Regression captured with exact exit codes, run sequentially, with no concurrent install (§8).
- [x] No `buildOfflineEvidence` port, no catalog or Worker change, no manifest or lockfile change, no commit, no deployment (§10–§11).

**Status: EVIDENCE FORMAT IMPLEMENTED AND VALIDATED · LOCAL VERIFICATION PASSED · AWAITING INDEPENDENT REVIEW.**
B12 resolved for the local contract only. B5, B6 and B7 unchanged. The full R22 `buildOfflineEvidence` port is
still not authorised, and this milestone deliberately did not start it. KCOE8006 FITMENT HOLD, GitHub and
production remain on HOLD.




