# C3-R37A — Evidence Retention Decision

**Scope:** how the C3 integration should treat the evidence files currently untracked in the worktree.
**Status:** proposed policy · nothing staged, committed, deleted or rewritten · awaiting independent review.

## 1. The conflict this resolves

C3-R37 proposed excluding "generated evidence" from the integration. That collides with a real obligation: several
accepted milestone records cite SHA-256 values for files in that same set. Excluding them wholesale would leave
fingerprints pointing at bytes that exist nowhere, which is precisely the failure mode C3-R36H.2 was criticised for.

The resolution is not "commit everything" or "commit nothing". It is a test each file must pass:

> **A file is committed if it is the sole surviving support for an accepted claim, or if it is a distinct byte
> sequence a record cites. A file is excluded if its bytes are already retained elsewhere, or if its content is
> per-run output that a record summarises.**

## 2. Three retention classes

### R1 — immutable reference evidence (commit)

Machine-readable results cited by a record, manifests, tools, and **one canonical copy of each distinct screenshot byte
sequence**. These are small, named, and referenced by hash in reviewed documents.

Retained under this rule include `C3-R36F-MANIFEST-VERIFICATION.json`, `C3-R36G-PACKAGE-COMPLETENESS.json`,
`C3-R36G-LINUX-MANIFEST-V2.json`, `C3-R36E-LINUX-MANIFEST.json`, `C3-R27-LINUX-RERUN-MANIFEST.json`,
`c3-integration-source-manifest.json`, `c3-dependency-graph.json`, the four `C3-R36H3-*.json` results, the three
`C3-R36H*` result JSONs, the three canonical screenshots, and the two `EXITCODES` captures.

### R2 — reproducible transient output (exclude)

**12 of the 15 screenshots** and **3 `runs/*/gate-results.json`**. Two distinct reasons, both measured:

- The 12 screenshots are **byte-identical duplicates** of a canonical set. The inventory groups PNGs by content hash
  and keeps one per distinct hash; keeping both copies would double-count one piece of evidence and inflate the repo.
- The 3 `runs/gate-results.json` embed an **ephemeral port and an absolute path** (finding B21), so they cannot be
  reproduced byte-for-byte by anyone, anywhere. The milestone records carry their verdicts.

### R3 — never committed

`node_modules/` anywhere, `apps/catalog/dist/`, throwaway clean exports, and any `%TEMP%` artefact. Already handled by
`.gitignore`; no change proposed.

## 3. The awkward cases, stated rather than smoothed over

| File | Situation | Proposal |
| --- | --- | --- |
| `docs/c3-r36h1/gate-*.png` | Excluded by the duplicate rule; the **identical bytes** are retained as `docs/c3-r36h/catalog-*.png`. The C3-R36H.1 record cites `78b14739…`, `d5f7bbce…`, `60f253e7…` — those fingerprints are satisfied by the retained copy, because a fingerprint names bytes, not a path. | Keep the duplicate rule; document the substitution. **Reviewer may prefer the later milestone's paths** — swapping the canonical choice is a one-line rule change. |
| `docs/c3-r36h3/C3-R36H3-OUTPUT-BOUNDARY.json` | Current bytes (`0c7af86a…`) are the **independent reviewer's rerun**, not the author's (`a9c39fd3…`, destroyed by B27). | Retain, but the file is the only committed artefact in the set that was produced by a different party than the milestone author. This needs an explicit decision: commit it labelled as the review run, or exclude it because it is not the reviewed bytes. **Unresolved.** |
| `docs/c3-r36h3/C3-R36H3-FAILURE-INJECTION.json` | Holds the **third** run (7/8, `ff3e562d…`). The earlier 8/8 summary (`3152db68…`) was overwritten in place. | Retain the file, and retain the two console logs — they are the only surviving trace of the 8/8 run and of the two 7/8 runs. Excluding the logs would erase the only support for C3-R36H.3's own claims. |
| `docs/c3-r36h3/C3-R36H3-B23-RACE-TRIALS.json` | Post-fix trials (10/10). The pre-fix 14-trial run survives only as a console log. | Retain both. |
| `docs/c3-r36e/C3-R36E-LINUX-MANIFEST.json` | Declares `executed: false`; superseded by the v2 package. | Retain as history. Deleting it would erase the record of the first package's defect. |

## 4. What the policy implies for future milestones

1. **Evidence a record cites must be committed**, or the record must stop citing it. There is no third option.
2. **Per-run output does not get a fixed path.** A run writes into its own directory; a milestone may publish one
   aggregate manifest that names each run and its digests.
3. **A report file that can be silently overwritten is not evidence.** This is B27, and it is why R2 exists.
4. **Screenshots are deduplicated by content hash**, not by path, so re-running a milestone does not multiply the
   repository.
5. **If a file's digest is cited, its bytes must be reproducible** — which is exactly what the line-ending decision
   (C3-R37A §4 of the main record) has to guarantee before any source fingerprint claim survives a clone.

## 5. Consequences that follow from this decision

- Committing R1 makes the records honest: every quoted hash resolves to a committed file.
- Excluding R2 keeps 15 files (≈0.5 MB of duplicates and per-run output) out of Git without weakening any claim.
- The one claim that becomes **weaker** rather than stronger: the 8/8 injection run is represented only by a log, not
  by a result file. That is a consequence of B27, and it is recorded rather than hidden.

## 6. Not done in this milestone

No file was deleted, moved, rewritten, staged, or committed. No milestone record was amended. The `a9c39fd3…` bytes
are not fabricated back. This document is a proposal.
