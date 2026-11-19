// C3-R31: read-only extraction from C3-R22 (build-evidence-r22.mjs).
//
// SOURCE BASELINE (reviewed, unmodified): lib/assets/build-evidence-r22.mjs
//   sha256 262d6ecbac5da4e8963cfdd88ce6813a57acc6a1c46061171cfe732733f91ece (92 lines, staging workspace)
//
// EXTRACTED (read-only)      : artifactDigest, sourceSnapshot, verifyOfflineEvidence (+ internal safeFiles)
// DELIBERATELY NOT PORTED    : buildOfflineEvidence — the only function that imports vite/esbuild, creates
//                              directories, writes artifacts and writes the evidence file. No top-level
//                              bundler import survives here, so this module loads with no toolchain installed.
//
// WHAT THIS PROVES:
//   - supplied artifact bytes match the digests recorded in a supplied evidence file
//   - the recorded pair is internally consistent with a verified generation
//   - the recorded source snapshot identifier is the same string the build records carry
// WHAT IT DOES NOT PROVE:
//   - that any build actually ran, that a Git commit exists, who produced the bytes, or that any CI ran.
//     `sourceSnapshot` is a LOCAL evidence value. It is never a verified Git commit, and this module never
//     reports one.
//   - that publication is authorized: that flag is read as false and anything else is a failure.
//
// READ-ONLY. No writes, no directory creation, no subprocess, no network, no repair, no artifact creation.
// NODE-ONLY: never import from the Cloudflare Worker, a request handler, or a route.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { verifyGeneration } from '../library/library-generation-r20.mjs';
import { verifyBuildPair } from '../library/build-provenance-r21.mjs';
import { assertPolicy } from '../library/target-policy.mjs';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// The exact inputs R22's snapshot contract requires. Listed explicitly so a caller can see why a snapshot
// failed without reading the implementation.
export const SOURCE_SNAPSHOT_INPUTS = Object.freeze([
  'package.json', 'package-lock.json', 'vite.config.js', 'catalog.html', 'index.html',
  'cloudflare/api/wrangler.jsonc',
]);
export const SOURCE_SNAPSHOT_DIRS = Object.freeze(['src', 'cloudflare/api/src', 'lib/assets']);

// Claim classes, so a consumer cannot mistake a recorded value for a verified one.
export const EVIDENCE_CLAIMS = Object.freeze({
  recordedArtifactDigests: Object.freeze(['catalog.sha256', 'worker.sha256']),
  recomputedArtifactDigests: Object.freeze(['catalog.sha256', 'worker.sha256']),
  localSourceSnapshotClaims: Object.freeze(['sourceSnapshotSha256', 'catalog.build.sourceCommit', 'worker.build.sourceCommit']),
  neverEstablishedLocally: Object.freeze(['actualGitCommitProvenance', 'trustedCiAttestation', 'publicationAuthorized']),
});

// R31 ADAPTATION 1 - containment is re-derived at the point of access, from the live filesystem, through the
// shared R28 policy validator. A directory swapped after policy creation is caught here.
function containedDir(policy, directory, label) {
  const authorised = assertPolicy(policy);
  if (typeof directory !== 'string') throw Error(`R31_${label}_REQUIRED`);
  let dir;
  try {
    dir = fs.realpathSync(directory);
  } catch {
    throw Error(`R31_${label}_UNAVAILABLE`);
  }
  if (!inside(authorised.rootDir, dir)) throw Error(`R31_${label}_OUTSIDE_POLICY`);
  return { dir, authorised };
}

// Unchanged from the source: refuse symlinks and non-regular files while walking an artifact tree.
const safeFiles = (dir, relative = '') => {
  const files = [];
  for (const entry of fs.readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('R31_SYMLINK_OUTPUT');
    const name = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) files.push(...safeFiles(dir, name));
    else if (entry.isFile()) files.push(name);
    else throw Error('R31_NONREGULAR_OUTPUT');
  }
  return files.sort();
};

// R31 ADAPTATION 2 - policy is a required argument, and containment is revalidated before the walk.
export function artifactDigest({ policy, directory } = {}) {
  const { dir } = containedDir(policy, directory, 'ARTIFACT_DIR');
  const files = safeFiles(dir);
  if (files.length === 0) throw Error('R31_EMPTY_BUILD');
  const entries = files.map((name) => ({ path: name, sha256: sha(fs.readFileSync(path.join(dir, name))) }));
  return { sha256: sha(Buffer.from(JSON.stringify(entries))), files: entries };
}

// R31 ADAPTATION 3 - explicit root, no module-relative derivation, no staging fallback. Returns the digest
// string exactly as the source did, so an evidence record compares the same way.
export function sourceSnapshot({ policy, rootDir } = {}) {
  const { dir: root } = containedDir(policy, rootDir, 'ROOT');
  const entries = [];
  for (const name of SOURCE_SNAPSHOT_INPUTS) {
    const loc = path.join(root, name);
    if (!fs.existsSync(loc)) throw Error('R31_SOURCE_MISSING:' + name);
    entries.push([name, sha(fs.readFileSync(loc))]);
  }
  for (const folder of SOURCE_SNAPSHOT_DIRS) {
    for (const name of safeFiles(path.join(root, folder))) {
      entries.push([folder + '/' + name, sha(fs.readFileSync(path.join(root, folder, name)))]);
    }
  }
  entries.sort((a, b) => a[0].localeCompare(b[0], 'en'));
  return sha(Buffer.from(JSON.stringify(entries)));
}

// R31 ADAPTATION 4 - verifyOfflineEvidence takes the policy, the target set, and an explicit output root.
// It never repairs, never rebuilds, and never writes. Every failure is a returned reason, not a throw, so a
// caller cannot mistake an exception for a verdict.
export function verifyOfflineEvidence({ policy, outputRoot, allowedTargets } = {}) {
  try {
    const { dir: out } = containedDir(policy, outputRoot, 'EVIDENCE_DIR');
    const evidencePath = path.join(out, 'offline-evidence.json');
    if (fs.existsSync(evidencePath) && fs.lstatSync(evidencePath).isSymbolicLink()) {
      return { ok: false, reason: 'R31_SYMLINK_EVIDENCE' };
    }
    const record = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    if (record.schema !== 'alp-c3-r22-offline-evidence-v1') return { ok: false, reason: 'R31_INVALID_SCHEMA' };
    // R31 ADAPTATION 5 - provenance and deployment flags are read-only truths. Anything but false fails.
    for (const flag of ['publicationAuthorized', 'sourceCommitVerified', 'ciAttested']) {
      if (record[flag] !== false) return { ok: false, reason: 'R31_INVALID_POLICY' };
    }
    if ('deployAllowed' in record && record.deployAllowed !== false) return { ok: false, reason: 'R31_INVALID_POLICY' };

    const recordedCatalog = { sha256: record.catalog?.sha256, files: record.catalog?.files };
    const recordedWorker = { sha256: record.worker?.sha256, files: record.worker?.files };
    if (typeof recordedCatalog.sha256 !== 'string' || typeof recordedWorker.sha256 !== 'string') {
      return { ok: false, reason: 'R31_INVALID_SHAPE' };
    }

    let recomputedCatalog;
    let recomputedWorker;
    try {
      recomputedCatalog = artifactDigest({ policy, directory: path.join(out, 'catalog') });
      recomputedWorker = artifactDigest({ policy, directory: path.join(out, 'worker') });
    } catch (error) {
      return { ok: false, reason: 'R31_ARTIFACT_UNREADABLE:' + error.message };
    }
    if (JSON.stringify(recomputedCatalog) !== JSON.stringify(recordedCatalog)
      || JSON.stringify(recomputedWorker) !== JSON.stringify(recordedWorker)) {
      return { ok: false, reason: 'R31_ARTIFACT_TAMPERED' };
    }

    if (typeof record.generationId !== 'string' || !/^[a-f0-9]{64}$/.test(record.generationId)) {
      return { ok: false, reason: 'R31_INVALID_SHAPE' };
    }
    const generationDir = path.join(out, 'generations', 'sha256-' + record.generationId);
    const generation = verifyGeneration({ generationDir, allowedTargets });
    if (!generation.ok) return { ok: false, reason: 'R31_GENERATION_TAMPERED' };

    const pair = verifyBuildPair({ policy, generationDir, catalog: record.catalog?.build, worker: record.worker?.build });
    if (!pair.ok || pair.pairId !== record.pairId) return { ok: false, reason: 'R31_PAIR_MISMATCH' };

    if (record.sourceSnapshotSha256 !== record.catalog?.build?.sourceCommit
      || record.sourceSnapshotSha256 !== record.worker?.build?.sourceCommit) {
      return { ok: false, reason: 'R31_SNAPSHOT_MISMATCH' };
    }

    return {
      ok: true,
      reason: null,
      pairId: pair.pairId,
      generationId: record.generationId,
      // Recorded vs independently recomputed, side by side. They matched or we would have failed above.
      digests: {
        catalog: { recorded: recordedCatalog.sha256, recomputed: recomputedCatalog.sha256 },
        worker: { recorded: recordedWorker.sha256, recomputed: recomputedWorker.sha256 },
        fileCount: recomputedCatalog.files.length + recomputedWorker.files.length,
      },
      claims: {
        verifiedByRecomputation: ['catalog.sha256', 'worker.sha256', 'generationId', 'pairId'],
        localSourceSnapshotOnly: ['sourceSnapshotSha256', 'catalog.build.sourceCommit', 'worker.build.sourceCommit'],
        notEstablished: {
          actualGitCommitProvenance: 'NOT_ESTABLISHED',
          trustedCiAttestation: 'NOT_ESTABLISHED',
          publicationAuthorized: false,
        },
      },
    };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}
