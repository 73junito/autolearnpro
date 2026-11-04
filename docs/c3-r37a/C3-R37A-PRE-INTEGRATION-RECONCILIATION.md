# C3-R37A — Pre-Integration Inventory and Line-Ending Reconciliation

**Milestone:** C3-R37.1 — read-only reconciliation
**Workspace:** `F:\autolearnpro-c3-r25-integration`
**Date:** 2026-11-04
**Status:** reconciliation complete · awaiting independent review
**Authority used:** read-only Git inspection, two generated artefacts, four disposable-repository clones, one read-only
SSH query.
**Not done:** no staging, commit, merge, push, publish, deployment, `.gitattributes`, application change, dependency
change, or reviewed-contract change. Nothing was deleted or rewritten.

## 1. Phase A — baseline

| Check | Value |
| --- | --- |
| Integration HEAD | `ea67a032d94bf283ab458c45bc622e75f1a219f1` |
| Parent HEAD | `ea67a03`, 30 default entries |
| Integration status | **45 default / 121 individual**, 0 staged |
| `C3-R37-CLEAN-CHECKOUT-AUDIT.md` | `d169f4294729c7519074d0b5a253c2c9eb3aae1d700c4fdf52a17b1dbd168989` — matches the review |
| `C3-R36G-LINUX-MANIFEST-V2.json` | `9f710618…`; 35 entries |
| Worker / Wrangler | `261732ec…` / `df648688…` — unchanged |
| Catalog `index.html` | `a1d340cc…` — unchanged |
| Root `package.json` | `ac8d0bec…` — unchanged |
| R25 source integrity | `verify-review.mjs` exit 0 |
| `core.autocrlf` | **`true`** |
| `.gitattributes` present | **no** |

## 2. F-8 reconciled — the counts, from explicit paths

The C3-R37 §5.2 table was wrong twice over, and your reading of it was right:

- **98 was an arithmetic error.** The listed groups sum to 100, as you calculated.
- **100 was also not a valid additions total.** The "documentation 58" row was a *directory-level* count of `docs/`
  containing mixed kinds — 34 `.md`, 21 `.json`, PNGs, logs, and 2 tooling files — which also overlapped the other
  rows. Adding those rows together double-counts.

The measured truth comes from one row per path:

| Action | Rows | Composition |
| --- | --- | --- |
| **add** | **104** | 35 documentation (27 `docs/*.md` + 7 scaffold READMEs + `infrastructure/c3/build/README.md`), 33 source, 20 evidence, 14 test, 2 tooling |
| **modify** | **2** | `.gitignore`, `package-lock.json` |
| **exclude** | **15** | 12 duplicate screenshots + 3 per-run `runs/*/gate-results.json` |
| **defer** | **0** | every path matched a stated rule |
| total | **121** | = 119 untracked + 2 modified tracked, exactly the Git candidate set |

Plus **7 milestone additions** (this record, the retention decision, the two JSON analyses, and the three tools),
listed separately in the manifest so the inventory never contains its own digest. Measured proposed integration set:
**104 rows + 7 milestone additions = 111 additions, 2 modifications, 15 exclusions** — every one an explicit path in
`C3-R37A-FILE-INVENTORY.json`, with SHA-256, byte count, Git status, action, kind, and justification per row.

Invariants enforced by the generator, not by inspection: `duplicatePaths: []`, `deferredCount: 0`, every file exists
on disk (`R37A_MISSING_FILE` throws otherwise), and the row count is stable across re-runs.

## 3. F-7 confirmed — and the mechanism is named

Your finding is correct. I was measuring it wrongly in C3-R37, and you were right to re-measure with Git blobs.

**The configuration is the cause:** `core.autocrlf=true`, with no `.gitattributes`. Git therefore stores **LF in the
blob** and converts to **CRLF on checkout**. Measured per file — for every text file, `worktreeBytes − blobBytes`
equals the CRLF pair count exactly:

| File | Worktree bytes | CRLF pairs | Blob bytes | Delta | Substantive |
| --- | --- | --- | --- | --- | --- |
| `package.json` | 779 | 20 | 759 | 20 | **0** |
| `infrastructure/cloudflare/worker.mjs` | 613 | 14 | 599 | 14 | **0** |
| `infrastructure/cloudflare/wrangler.jsonc` | 366 | 15 | 351 | 15 | **0** |
| `package-lock.json` | 42,451 | 1,307 | 6,029 | 36,422 | **35,115** |
| `README.md` | 898 | 17 | 881 | 17 | **0** |
| `.npmrc` | 61 | 4 | 57 | 4 | **0** |

So three files are **logically unchanged, representationally different**, and the lockfile carries a **genuine
35,115-byte change** on top of its line endings. Two distinct facts, not to be merged.

**Why my earlier clean-tree comparison said "match":** `git archive` applies the same eol conversion, so the exported
tree held CRLF and matched the reviewed hashes. The blobs were LF all along. The measurement was consistent; my
conclusion — that the files were byte-identical to HEAD — was not.

**The Linux validation inherited the same bytes.** The v2 package was a `tar` transfer of the Windows worktree, so its
files are CRLF. Verified on `ubuntu-server`:

```
261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e  infrastructure/cloudflare/worker.mjs
ac8d0bec1e87459b7c779eca70f9ff0c7b021ecf0855f2d576ed09c9b9bfb4ad  package.json
a1d340cc27c4edfc4c16715ee498884eb910f47f85880fe8f0278bb0fb9d612a0  apps/catalog/index.html
```

All three equal the **Windows worktree** values. The 191/191 Linux result therefore ran on CRLF bytes that never came
from Git — which is also why it says nothing about what a clone would produce.

## 4. Phase C — line-ending policy, tested rather than argued

Four policies, each committed in a disposable repository and then **cloned twice** — once with `core.autocrlf=false`
(POSIX-like) and once with `core.autocrlf=true` (this Windows host). Source file: 21 bytes, 3 CRLF pairs,
`96e4d66c5a42d171e8aa107059eacaf52d3c2c095cbba1316b590a7392497718`.

| Policy | Blob | Win checkout | POSIX checkout | Reproduces reviewed bytes? |
| --- | --- | --- | --- | --- |
| **A** status quo (no attributes, `autocrlf=true`) | 18 B LF | 21 B CRLF `96e4…` | 18 B LF `6666…` | **Windows only** |
| **B** `* text=auto eol=lf` | 18 B LF | 18 B LF `6666…` | 18 B LF `6666…` | **neither** |
| **C** `* -text` | 21 B CRLF | 21 B CRLF `96e4…` | 21 B CRLF `96e4…` | **both** |
| **D** scoped `-text` | 21 B CRLF | 21 B CRLF `96e4…` | 21 B CRLF `96e4…` | **both** |

**Recommendation: policy D — a scoped `.gitattributes` marking evidence-sensitive paths `-text`, plus an explicit note
that `core.autocrlf` must not be relied on.**

Why D over B: B is the conventional answer and makes fingerprints platform-stable, but it changes **every recorded
digest** — all 30+ fingerprints in the C3 records become wrong, and re-baselining them would rewrite accepted
evidence. D keeps every recorded fingerprint valid on every platform, which is the property the evidence contracts
actually need. The cost is that CRLF bytes live in the repository for those paths, which some tooling dislikes — a real
trade-off, and yours to weigh.

Proposed content, for approval in a future milestone (not created here):

```
# Evidence-sensitive C3 paths: bytes are stored and checked out verbatim so the SHA-256 fingerprints recorded in the
# milestone documents survive a clone on any platform. Do not add `text` rules for these paths.
infrastructure/c3/**        -text
tests/c3-*.test.mjs         -text
tests/fixtures/**           -text
docs/c3-r2*/**              -text
docs/c3-r3*/**              -text
apps/catalog/**             -text
```

Note the boundary: with D, paths **outside** that list keep following `core.autocrlf`, so `package.json` and
`README.md` would still differ between platforms. Neither has a recorded fingerprint depending on it, but
`package.json` is read by tooling and `wrangler.jsonc` sits beside the Worker. Whether to widen to repository-wide
`* -text` is **unresolved, and deliberately not decided unilaterally.**


## 5. Phase D — evidence exclusions

Full policy in `C3-R37A-EVIDENCE-RETENTION-DECISION.md`. In one line: **commit what is the sole support for an accepted
claim, or a distinct cited byte sequence; exclude duplicates and per-run output.** That yields 15 exclusions —
12 duplicate screenshots (deduplicated by content hash) and 3 `runs/*/gate-results.json` (port- and path-bearing, B21)
— while retaining every result JSON, every manifest, the canonical screenshot set, the `EXITCODES` captures and the
four C3-R36H.3 console logs.

Two cases are flagged unresolved rather than decided: the canonical screenshot path (`c3-r36h` vs `c3-r36h1`, identical
bytes), and `C3-R36H3-OUTPUT-BOUNDARY.json`, whose current bytes are **your** run rather than mine.

## 6. Phase E — B27 and B21

B27 inventory, re-verified: **10 of 12 report writers overwrite their fixed path**; only the two browser gates use
`wx`. The recommended common policy stays as stated at C3-R37 §6.2 — required explicit destination, exclusive
creation, per-run ownership under `docs/c3-r3X/runs/<name>/`, cleanup scoped to the run, and one aggregate manifest per
milestone instead of one mutable summary.

B21 stays a recorded decision, kept separate from execution records: exclude `runtime`, `browser`, `target.origin`,
`output`, `observed` and any timestamp from a canonical findings digest; keep them in the full record; serialise the
digest with the tagged length-prefixed form from R36C. Not implemented.

## 7. Phase F — verification

| Test | Result |
| --- | --- |
| Inventory generator re-run with no file changes | identical row count (121), `duplicatePaths: []`, `deferred: []` |
| Every row's file exists on disk | enforced in code; `R37A_MISSING_FILE` throws otherwise |
| Row accounting | 104 add + 15 exclude + 2 modify = 121 = 119 untracked + 2 modified tracked |
| Line-ending experiment | four disposable repositories, each cloned twice; results in §4 |
| Experiment directories removed afterwards | temp base verified under `%TEMP%` before deletion |
| Integration worktree unchanged | HEAD `ea67a03`, 0 staged, tracked modifications still exactly `.gitignore` + `package-lock.json` |
| Parent worktree unchanged | `ea67a03`, 30 default entries |
| Reviewed contracts | no C3 security module, Worker or catalog file touched |

## 8. The two generated artefacts

| Artefact | Content |
| --- | --- |
| `C3-R37A-FILE-INVENTORY.json` | 121 rows + milestone additions + counts + invariants. Regenerated by `docs/c3-r37a/tools/build-integration-inventory.mjs`. |
| `C3-R37A-LINE-ENDING-ANALYSIS.json` | configuration, per-file blob/worktree deltas, and the four-policy experiment, produced by `docs/c3-r37a/tools/build-line-ending-analysis.mjs`, which runs `line-ending-experiment.mjs` in a temp directory. |

Both are regenerable from the tree; neither is hand-written. Their digests are in the handoff, and the manifest
deliberately does not contain its own.

## 9. Unresolved decisions for the reviewer

1. **Line-ending scope** — policy D as scoped above, or repository-wide `* -text`? (§4)
2. **Canonical screenshot path** — earliest milestone (`c3-r36h`) or the milestone whose record cites them most recently
   (`c3-r36h1`)? Same bytes either way. (§5)
3. **`C3-R36H3-OUTPUT-BOUNDARY.json`** — commit a third party's run, or exclude it as not-the-reviewed-bytes? (§5)
4. **The four C3-R36H.3 console logs** — they are the only surviving support for the 8/8 injection run after B27. I
   propose keeping them; excluding them weakens a claim C3-R36H.3 already made. (§5)
5. **Whether C3-R37.1's own records and tools belong in the same commit** as the integration set, or a separate
   documentation commit.

## 10. Final Git state

| Item | Value |
| --- | --- |
| Integration HEAD | `ea67a03` — unchanged |
| Parent HEAD | `ea67a03` — unchanged |
| Staged | **0** |
| Integration status | 46 default / 128 individual (121 before this milestone's files) |
| Modified tracked | `.gitignore`, `package-lock.json` — pre-existing, untouched here |
| Commits, pushes, merges, PRs, workflows, deployments | **none** |

## 11. What this does not establish

No integration is authorised by this document. No file was staged or committed. The file list is **proposed**, not
approved, and no line-ending change has been applied to the repository. The §4 recommendation is a tested proposal,
not a decision: D and B are both defensible, and B would invalidate every recorded fingerprint. Nothing here closes
B5, B13/B18, B14, B19–B21, B23, B26, B27 or B28 — it only makes the integration set, the byte representation and the
evidence policy explicit enough to be reviewed.

GitHub publication, production deployment and KCOE8006 fitment remain on HOLD.

