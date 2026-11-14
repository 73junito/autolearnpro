# C3-R36A — Multi-Root Snapshot and Evidence Contract

Date: 2026-11-04 · Root: `F:\autolearnpro-c3-r25-integration` · Branch `integration/c3-r25-ci-readiness`
`HEAD ea67a032d94bf283ab458c45bc622e75f1a219f1` · Node `v22.23.1` · npm `10.9.8`

**Local contract implementation and verification only. `buildOfflineEvidence` is NOT ported, the Worker was not
built or deployed, no manifest or lockfile changed, and no commit was made. KCOE8006 FITMENT HOLD remains
active; GitHub and production remain on HOLD.**

## 1. Outcome

B9 is resolved as an implementation, not a recommendation. `infrastructure/c3/build/source-snapshot.mjs`
consumes the C3-R35 mapping and produces a canonical, length-prefixed, digest-bound record of **eight input
files across three roots**, with a combined SHA-256, an explicit exclusion set, pinned false claims and stated
limitations. Verification re-derives everything through R35 and compares, without writing.

| Phase | Result |
| --- | --- |
| A — integrity gate | **no drift** — R35 contract, tests and record all match their reviewed fingerprints |
| B — snapshot format | **implemented** — versioned schema, role-labelled rows, canonical ordering, unambiguous encoding |
| C — missing historical inputs | **implemented** — three distinct states; `lib/assets` is an exclusion, never an empty verified directory |
| D — trusted claims | **pinned and digest-covered**; a forged flag is refused by name |
| E — security tests | **15/15 pass**, 5/5 mutation probes caught |
| F — regression | **5 commands, all exit 0**; not run concurrently; `npm ci` not run at all (no dependency change) |

## 2. Phase A — integrity gate

| Artifact / check | Value |
| --- | --- |
| `build-input-contract.mjs` | `8fc0b8ccfb7df46f…` — matches the verified R35 fingerprint |
| `tests/c3-build-input-contract.test.mjs` | `f6dd6c8e60342895…` — matches |
| `docs/c3-r35/C3-R35-BUILD-INPUT-CONTRACT.md` | `c952182297e91018…` — matches |
| Worker source | `worker.mjs` `261732ecb9accae4…`, `wrangler.jsonc` `df6486888a42317d…` — unchanged |
| Catalog source | all four files unchanged from the C3-R34 record |
| Root manifest / lockfile | `ac8d0bec1e87459b…` / `f805b6f77f392467…` — unchanged since R34 |
| R30 guard | `build-root-guard.mjs` `40d856d5941f9a18…` — unchanged |
| Integration HEAD / status | `ea67a03`, 27 default / 54 `--untracked-files=all`, **0 staged** |
| Parent worktree | `ea67a03`, 30 entries — untouched |
| R25 reviewer | **14/14 PASS**, exit 0 — staging drift zero |

## 3. Phase B — the snapshot format

### Schema

| Field | Type | Meaning |
| --- | --- | --- |
| `schema` | string | `alp-c3-r36a-multi-root-snapshot`. A different schema is refused; an R22-shaped one is refused with its own reason |
| `version` | integer | `1`; any other value is `R36A_SCHEMA_UNSUPPORTED` |
| `declared` | array | the nine declared inputs: `{ role, rootPath, path, kind }` |
| `entries` | array | the eight recorded files: `{ role, rootPath, path, kind, size, sha256 }` |
| `exclusions` | array | `{ r22Path, disposition, reason }` — deliberate absences, not emptiness |
| `limitations` | array | six statements, digest-covered so they cannot be stripped |
| `compatibility` | object | `{ historicalR22Equivalent: false, requiresVersionedDecision: true }` — both pinned |
| `claims` | object | four flags, all `false`, re-derived on every verification |
| `combinedSha256` | string | digest over the canonical encoding of everything above |

`role` is one of `repository`, `catalog`, `worker`. **`path` is repository-relative** (`apps/catalog/index.html`);
`rootPath` is relative to that role's root (`index.html`). Both are recorded because they are different claims:
the first says where the file sits in the tree, the second says which root was authorised to supply it.

Declared directories are expanded to their files. A declared file that also sits inside a declared directory
collapses into one row when the content agrees, and is refused as `R36A_PATH_COLLISION` when it does not — §5,
finding F-3.

### Canonical, unambiguous serialization

The digest is not taken over JSON. Each row is a tag plus length-prefixed fields:

```
entry|8:repository|17:package-lock.json|17:package-lock.json|4:file|5:42451|64:f805b6f7…
```

The lengths are what make it unambiguous. Under a plain `|`-join, *(role `a`, path `b/c`)* and *(role `a/b`,
path `c`)* serialize identically, so two different inputs would share a digest. With `2:a|3:b/c` they cannot.
Rows are emitted in a fixed order — schema, version, declared, entries, exclusions, limitations, compatibility,
claims — and both arrays sort by role rank then path, so the caller's declaration order cannot move the digest.
Test 2 proves that by reversing every role's spec and asserting an identical digest.

### The real snapshot, recorded

Taken from this repository through the R35 mapping, combined digest
`58d5eccc1babe48611f198ccd999341cc98b354efbfe616be8b42d4ef03c3f10`:

| Role | Repository-relative path | Bytes | SHA-256 |
| --- | --- | --- | --- |
| repository | `package-lock.json` | 42,451 | `f805b6f77f392467…` |
| repository | `package.json` | 779 | `ac8d0bec1e87459b…` |
| catalog | `apps/catalog/index.html` | 4,555 | `a1d340cc27c4edfc…` |
| catalog | `apps/catalog/package.json` | 456 | `effd027830259cee…` |
| catalog | `apps/catalog/src/main.js` | 1,697 | `04876dc917197177…` |
| catalog | `apps/catalog/vite.config.js` | 1,391 | `47ed28141b710657…` |
| worker | `infrastructure/cloudflare/worker.mjs` | 613 | `261732ecb9accae4…` |
| worker | `infrastructure/cloudflare/wrangler.jsonc` | 366 | `df6486888a42317d…` |

Nine declared inputs, eight entries; the difference is `src` and `src/main.js` collapsing.

**Every digest above is identical to the fingerprint an earlier milestone recorded independently.** That is the
useful property here: the contract re-derives the whole reviewed surface from the working tree, so one changed
byte in any of these files moves both its row and the combined digest.

## 4. Input and role correspondence

### Declared input → recorded entry

| Role | Declared `rootPath` | Kind | Recorded `path` |
| --- | --- | --- | --- |
| repository | `package.json` | file | `package.json` |
| repository | `package-lock.json` | file | `package-lock.json` |
| catalog | `package.json` | file | `apps/catalog/package.json` |
| catalog | `index.html` | file | `apps/catalog/index.html` |
| catalog | `src` | directory | `apps/catalog/src/main.js` (expanded) |
| catalog | `src/main.js` | file | `apps/catalog/src/main.js` (collapses with the row above) |
| catalog | `vite.config.js` | file | `apps/catalog/vite.config.js` |
| worker | `worker.mjs` | file | `infrastructure/cloudflare/worker.mjs` |
| worker | `wrangler.jsonc` | file | `infrastructure/cloudflare/wrangler.jsonc` |

### Historical R22 name → where it is now (B9 decision: role-labelled manifest)

| R22 name | Appears in this record as | Role |
| --- | --- | --- |
| `package.json` | `package.json` | repository |
| `package-lock.json` | `package-lock.json` | repository |
| `vite.config.js` | `apps/catalog/vite.config.js` | catalog |
| `catalog.html` | *exclusion* — `SUPERSEDED` | — |
| `index.html` | `apps/catalog/index.html` | catalog |
| `cloudflare/api/wrangler.jsonc` | `infrastructure/cloudflare/wrangler.jsonc` | worker |
| `src/` | `apps/catalog/src/main.js` | catalog |
| `cloudflare/api/src/` | *exclusion* — `SUPERSEDED`, replaced by the single `worker.mjs` entry | — |
| `lib/assets/` | *exclusion* — `ABSENT_BY_ARCHITECTURE` | — |

The manifest is **role-labelled** rather than prefix-based, which is exactly the B9 disposition: the lockfile
belongs to the repository while its consumers live in an application, and no single walked prefix expresses
that.

## 5. Phase C — the three states of a missing input

| State | How it appears | Evidence |
| --- | --- | --- |
| 1. Required, present, verified | a `declared` row **and** an `entries` row with size and digest | all nine of §4 |
| 2. Deliberately excluded by the approved architecture | an `exclusions` row with `ABSENT_BY_ARCHITECTURE` or `SUPERSEDED` and a reason | `lib/assets`, `catalog.html`, `cloudflare/api/src/` |
| 3. Required but missing unexpectedly | **`R35_INPUT_MISSING` at creation and at verification — no record can be produced** | test 11 |

Two assertions make state 2 more than a comment:

- A disposition matching `/^VERIFIED/i` is refused (`R36A_EXCLUSION_INVALID`), so "verified empty" is not
  expressible. An absence can never be laundered into a checked emptiness.
- Attempting to *declare* `lib/assets` is refused by R35 before a snapshot exists
  (`R35_INPUT_MISSING:catalog/lib/assets`), and editing a finished record to add it is refused by the digest
  gate. Both paths are tested (test 12).

### Finding F-3 — R35's spec declares one input twice

`REVIEWED_MAPPING_SPEC.catalog` lists both `src` (directory) and `src/main.js` (file inside it). This is a
redundant declaration, not a conflict: expansion produces the same row twice. The snapshot layer **collapses
identical rows and refuses differing ones**, so a genuine collision on `role` + `path` still fails closed.

I did not "fix" R35: it is frozen at a fingerprint an independent reviewer verified. The redundancy is handled
downstream and recorded here. A future milestone may either drop the redundant file row in a new versioned spec,
or keep it deliberately as an assertion that the file exists inside the declared directory — the second is
arguably more useful, and that is why the collapse compares content rather than merely skipping the duplicate.

## 6. Phase D — trusted claims

Four flags are pinned, participate in the digest, and are re-derived on every verification:

| Claim | Value | Enforced by |
| --- | --- | --- |
| `sourceCommitVerified` | **false** | `R36A_FORGED_CLAIM:sourceCommitVerified` |
| `ciAttested` | **false** | `R36A_FORGED_CLAIM:ciAttested` |
| `publicationAuthorized` | **false** | `R36A_FORGED_CLAIM:publicationAuthorized` |
| `deployAllowed` | **false** | `R36A_FORGED_CLAIM:deployAllowed` |

A fifth key of any name is refused (`R36A_FORGED_CLAIM:unexpected-claim`), so an approval cannot be smuggled in
as an extra field. A successful verification returns exactly what it established and an explicit list of what it
did **not**:

```
establishes:      ['inputsConsistentWithSnapshot']
doesNotEstablish: ['gitOrigin','authorship','review','ciExecution','approval','publicationAuthority','buildArtifact']
```

The limitations array is digest-covered, which means a record cannot be circulated with its caveats deleted —
removing one changes `combinedSha256`.

## 7. Phase E — the security tests

`tests/c3-multi-root-snapshot.test.mjs`. Positive cases run against the real repository; negative cases copy the
real inputs into a temporary tree and change exactly one thing.

| # | Required case | Result |
| --- | --- | --- |
| 1 | Correct multi-root mapping | pass — 9 declared, 8 entries, forward-slash repository-relative paths, all resolving inside the repo; lockfile attributed to `repository`; `lib/assets` absent from `declared`/`entries`; compatibility and claims pinned |
| 2 | Canonical ordering | pass — a fully reversed spec yields an identical digest and identical row order; per-role sort and role rank verified |
| 3 | Deterministic combined digest | pass — repeated creation identical; reversed exclusion list identical |
| 4 | Single-byte input tampering | pass — `R36A_ENTRY_MISMATCH:catalog/apps/catalog/index.html` |
| 5 | Added and removed required files | pass — `R36A_ENTRY_ADDED` for a new file; removal caught at the mapping gate |
| 6 | Unexpected symlink or junction | pass — refused by R35's walk at both creation and verification |
| 7 | Root escape and traversal | pass — `R36A_ENTRY_PATH_TRAVERSAL`, `R36A_ENTRY_PATH_ABSOLUTE` |
| 8 | Role substitution | pass — `R36A_DIGEST_MISMATCH`; reordering likewise; unknown role refused by name |
| 9 | Path collision | pass — `R36A_PATH_COLLISION` |
| 10 | Malformed schema | pass — null, non-object, wrong schema, wrong version, unknown field, wrong type, bad digest, missing key, and both R22-shaped forms → `R36A_HISTORICAL_R22_REQUIRES_DECISION` |
| 11 | Missing inputs | pass — refused at the mapping gate for the root lockfile and the Worker entry |
| 12 | Deliberately excluded historical input | pass — exclusion recorded; not creatable as a declared directory; `VERIFIED_EMPTY` refused; R22-equivalence claim refused |
| 13 | Forged provenance or publication flags | pass — each of the four, plus an extra key, plus a null claim set |
| 14 | No filesystem mutation | pass — catalog and Worker trees digest identically before and after; the authorised output directory stays empty |
| 15 | No build, network or deployment | pass — no write/spawn/network API and no bundler import in the module; imports are exactly `node:crypto`, `node:fs`, `node:path`, `./build-input-contract.mjs`; **R35's Worker boundary still refuses a bare `pg` import after a snapshot is created** |

### Mutation probes — the guards are not vacuous

| Probe | Weakened | Caught by |
| --- | --- | --- |
| M1 | the pre-filesystem digest recomputation deleted | tests **8 and 12** |
| M2 | the claims comparison deleted | test **13** |
| M3 | `/^VERIFIED/i` exclusion check disabled | test **12** |
| M4 | `R36A_ENTRY_ADDED` turned into `continue` | test **5** |
| M5 | `entries.sort(orderRows)` deleted | tests **2, 4, 5, 14, 15** |

Every probe restored **byte-identically** (`47656cf695608057…` before and after the sequence).

## 8. Compatibility disposition for historical R22 evidence

**A C3-R36A snapshot is not R22 evidence, and R22 evidence is not admissible here.**

| Aspect | Historical R22 record | C3-R36A snapshot |
| --- | --- | --- |
| Root model | one root, nine fixed names | three explicit roots, role-labelled |
| Input identity | path under one prefix | `(role, rootPath, repository-relative path)` |
| Digest | `sourceSnapshotSha256` string | combined digest over a length-prefixed canonical encoding |
| Absent input | reported as `R22_SOURCE_MISSING` | an explicit exclusion with a disposition, or a hard refusal |
| Claims | `sourceCommit` fields with recorded values | four flags pinned false and re-derived |
| Schema | `alp-c3-r2x…` / `generationId` + `pairId` | `alp-c3-r36a-multi-root-snapshot` v1 |

Mechanically: `verifySourceSnapshot` refuses an R22-shaped record with
`R36A_HISTORICAL_R22_REQUIRES_DECISION` — not a generic schema error, because "does not parse" would be the
wrong reason. Test 10 covers both a bare R22 record and a valid new record relabelled with an R22 schema and a
`generationId`.

**What a future versioned compatibility decision would have to establish**, none of which exists today:

1. a mapping from each R22 input name to a `(role, path)` pair, with the three exclusions explicitly declared;
2. a statement that R22's single `sourceSnapshotSha256` cannot be reproduced from three roots — it would have to
   be re-issued, not compared;
3. a decision that historical records remain readable *as history* and are never re-signed into the new schema;
4. a migration note recording which historical claims survive, which are void, and why.

## 9. Phase F — regression, exact exit codes

Run **sequentially**, in this order, from `F:\autolearnpro-c3-r25-integration`:

| Command | Exit | Result |
| --- | --- | --- |
| `npm run validate:foundation` | **0** | `Foundation 1 validated: 13 directories…` |
| `npm run test:runtime` | **0** | 3 pass / 0 fail / 0 skipped |
| `node --test "tests/c3-*.test.mjs"` | **0** | **145 tests · 141 pass · 0 fail · 4 skipped** |
| `node docs/c3-r25/verify-review.mjs` | **0** | **14/14 PASS** |
| `npm run build --workspace @autolearnpro/catalog` | **0** | 2 files, `✓ built in 79ms` |

`npm ci` was **not** run: no manifest or lockfile changed in this milestone, and it must never run concurrently
with tests. C3 totals moved from 130 tests (C3-R35) to **145** because this milestone adds 15.

The four skips are unchanged host-capability cases: library generation 8b, library reader 11, offline evidence
13 and the journal symlink case — all Windows refusals of file symlinks without elevation. R26–R28 passed on
Ubuntu with zero skips; **R31's and R35's link cases remain unverified on Linux** (B6). This milestone adds no
skip: its link case uses a directory junction, which this host permits, and it ran.

## 10. Changed-file inventory and fingerprints

### Created — 3 files

| Path | Bytes | SHA-256 |
| --- | --- | --- |
| `infrastructure/c3/build/source-snapshot.mjs` | 17,798 | `47656cf695608057e1daa955670280a8f665b06a4d6dfcc35de98bf2bbe0ef03` |
| `tests/c3-multi-root-snapshot.test.mjs` | 22,396 | `7025534fc2faeee7a905c4b64ceaf84690e592b6c52e63be38d3a37924afca38` |
| `docs/c3-r36a/C3-R36A-MULTI-ROOT-SNAPSHOT.md` | this file | reported with the handoff, not inside itself |

### Modified — none

No existing file was edited. `build-input-contract.mjs` (`8fc0b8ccfb7df46f…`),
`tests/c3-build-input-contract.test.mjs` (`f6dd6c8e60342895…`), `build-root-guard.mjs`
(`40d856d5941f9a18…`), `target-policy.mjs`, `worker.mjs` (`261732ecb9accae4…`), `wrangler.jsonc`
(`df6486888a42317d…`), all four `apps/catalog` sources, root `package.json` (`ac8d0bec1e87459b…`) and root
`package-lock.json` (`f805b6f77f392467…`) are byte-identical to their previously verified values.

### Dependency and manifest state

No dependency added, removed or moved; no lockfile written; the R30 toolchain package and its lockfile are
untouched; R28's temporary-storage restrictions are unchanged and remain the only policy the contract accepts.

## 11. Final Git state and blocker register

| Item | Value |
| --- | --- |
| HEAD (integration / parent) | `ea67a032d94bf283ab458c45bc622e75f1a219f1` / `ea67a03` — unchanged |
| Staged | **0** |
| Modified tracked | `.gitignore` (pre-existing, R30), `package-lock.json` (C3-R34, authorised) |
| Status entries | **29** default / **57** `--untracked-files=all` (was 27 / 54) |
| Commits, pushes, merges, PRs, workflow activation, deploys | **none** |
| Cloudflare, Supabase, R2, Docker, parent-repo changes | **none** |
| Parent status entries | 30 — untouched |

### Blocker register after C3-R36A

| # | Status | Note |
| --- | --- | --- |
| **B5** | **Open** | 7 scaffold READMEs plus `infrastructure/c3/build/README.md` remain untracked; a clean checkout of `HEAD` still fails `validate:foundation` (measured in R35 §7). Snapshotting does not change that, and no commit is authorised. |
| **B6** | **Open** | Linux verification pending for R31 and for the R35/R36A link cases. |
| **B7** | **Open** | No browser test harness; accessibility still asserted by construction only. |
| **B8** | **Accepted** | `three@0.180.0` declared, unused, and not to be papered over with an invented scene. |
| **B9** | **Resolved** | Role-labelled manifest with a deterministic combined digest, implemented and tested (§3–§4). |
| **B10** | **Resolved as a disposition** | `lib/assets` is an explicit `ABSENT_BY_ARCHITECTURE` exclusion; no R22-compatibility claim is made or possible (§5, §8). |
| **B11** | **Open** | Worker bundling feasibility still unproven; the recommended next step is the separate temporary-only check. |
| **B12** | **New** | The snapshot is not yet consumed by anything, is never written to disk, and has no authorised evidence-file format. R36 must decide whether it is persisted as JSON and where. |

## 12. Acceptance criteria

- [x] R35 contract, tests and record hashes verified before any write; no unexplained drift (§2).
- [x] Format defined with schema version, role, repository-relative path, per-input digest, directory expansion, canonical ordering, combined digest and explicit limitations (§3).
- [x] Unambiguous serialization: length-prefixed tagged rows, with the concatenation-ambiguity case stated and tested (§3, test 2).
- [x] Bound to the R35 mapping — no root inferred, no path resolved by this module (§3, test 15).
- [x] Three missing-input states kept distinct; `lib/assets` never recorded as an empty verified directory (§5, test 12).
- [x] Historical R22 evidence refused with its own reason, plus a written compatibility disposition (§8, test 10).
- [x] All four claims pinned false, digest-covered, re-derived, and refused when forged (§6, test 13).
- [x] 15 focused tests pass; 5 mutation probes prove they can fail; all restored byte-identically (§7).
- [x] R28 temporary-storage restrictions retained; the R35 Worker boundary is not weakened (§7, test 15).
- [x] No filesystem mutation, no build, no network and no deployment surface (§7, tests 14–15).
- [x] Regression captured with exact exit codes, run sequentially, without `npm ci` (§9).
- [x] No commits, pushes, merges, PRs, workflow activation, deployment, Supabase, R2, Docker or parent-repo changes (§11).

**Status: SNAPSHOT CONTRACT IMPLEMENTED AND VALIDATED · LOCAL VERIFICATION PASSED · AWAITING INDEPENDENT
REVIEW.** B9 resolved; B10 dispositioned; B5, B6, B7, B11 and the new B12 remain open. The full R22
build-evidence port stays deferred. KCOE8006 FITMENT HOLD, GitHub and production remain on HOLD.





