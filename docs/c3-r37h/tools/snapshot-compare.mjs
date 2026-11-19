// C3-R37H remediation R5 (findings B14, B19, B20) — versioned visual snapshot comparison with reviewable diffs.
//
// Snapshot requirements this tool enforces:
//   - explicit snapshot versioning: a baseline manifest without `snapshotVersion` is rejected, never guessed;
//   - stable fixtures and controlled state are declared in the manifest (`controlledState`), and only content
//     hashes and sizes enter the comparison — no timestamps or environment-dependent values affect results;
//   - NO automatic approval: this tool never writes an approval, never updates a baseline, and always reports
//     `approved: false` with `reviewStatus: 'pending-review'` until a human records a decision elsewhere;
//   - snapshot changes produce reviewable diffs: every changed entry carries the baseline and candidate
//     digests and sizes so the difference can be reviewed byte-for-byte.
//
// WHAT THIS MODULE DOES NOT DO: it does not compare pixels, decide equivalence, approve baselines, or write
// any file. It is a pure function over directories and manifests.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SNAPSHOT_REPORT_SCHEMA = 'alp-c3-snapshot-diff-v1';

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function fail(code, detail) {
  const error = Error(`R37H_SNAPSHOT:${code}:${detail}`);
  error.code = code;
  throw error;
}

/**
 * Compare a candidate snapshot directory against a versioned baseline manifest.
 *
 * Manifest shape: {
 *   snapshotVersion: <string, required>,
 *   controlledState: <string, required — the fixed viewport/state under which baselines were captured>,
 *   entries: [ { file: <relative name>, sha256: <hex>, bytes: <int> }, ... ]
 * }
 */
export function compareSnapshotRuns({ baselineManifest, candidateDir }) {
  if (!baselineManifest || typeof baselineManifest !== 'object') fail('MANIFEST_INVALID', 'not an object');
  if (typeof baselineManifest.snapshotVersion !== 'string' || baselineManifest.snapshotVersion.length === 0) {
    fail('MANIFEST_VERSION_MISSING', 'snapshotVersion is required; baselines are never implicitly versioned');
  }
  if (typeof baselineManifest.controlledState !== 'string' || baselineManifest.controlledState.length === 0) {
    fail('MANIFEST_CONTROLLED_STATE_MISSING', 'controlledState must declare the fixed capture conditions');
  }
  if (!Array.isArray(baselineManifest.entries)) fail('MANIFEST_ENTRIES_INVALID', 'entries must be an array');

  const entries = baselineManifest.entries.map((entry) => {
    if (!entry || typeof entry.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.file)) {
      fail('MANIFEST_ENTRY_INVALID', String(entry?.file));
    }
    const candidatePath = path.join(candidateDir, entry.file);
    let candidateBytes = null;
    try {
      candidateBytes = fs.readFileSync(candidatePath);
    } catch {
      fail('CANDIDATE_FILE_MISSING', entry.file);
    }
    const candidateSha256 = sha256Hex(candidateBytes);
    return Object.freeze({
      file: entry.file,
      baselineSha256: entry.sha256,
      candidateSha256,
      baselineBytes: entry.bytes ?? null,
      candidateBytes: candidateBytes.length,
      changed: candidateSha256 !== entry.sha256
    });
  });

  return Object.freeze({
    schema: SNAPSHOT_REPORT_SCHEMA,
    snapshotVersion: baselineManifest.snapshotVersion,
    controlledState: baselineManifest.controlledState,
    changedCount: entries.filter((entry) => entry.changed).length,
    entries,
    // Approval is a human decision recorded elsewhere. This tool never emits it.
    approved: false,
    reviewStatus: 'pending-review'
  });
}
