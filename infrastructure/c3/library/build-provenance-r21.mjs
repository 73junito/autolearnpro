// C3-R29: isolated port of the C3-R21 offline build-attestation contract.
//
// SOURCE BASELINE (reviewed, unmodified): lib/assets/build-provenance-r21.mjs
//   sha256 68aee3121c28b3d00a6371645856c4b246ee8a5f3626ea13e05bbf4a7cc3db0c (48 lines, staging workspace)
//
// WHAT THIS PROVES AND WHAT IT DOES NOT:
//   - A matching SHA-256 proves THOSE BYTES match a recorded digest.
//   - It does not prove who produced them, which Git commit they came from, or that any CI system ran.
//   - sourceCommit is a CALLER-ASSERTED snapshot identifier (64 hex). It is never a verified Git commit and
//     is never described as one. sourceCommitVerified / ciAttested are pinned false and cannot be raised by
//     anything in this module.
//   - publicationAuthorized and deployAllowed are pinned false. A verified pair is evidence, not approval.
//
// READ-ONLY: no writes, no deletes, no locks, no journals, no Worker publication.
// NODE-ONLY: never import from the Cloudflare Worker, a request handler, or a route.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyGeneration } from './library-generation-r20.mjs';
import { assertTargetsApproved } from './library-pair-recovery.mjs';
import { assertPolicy } from './target-policy.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;
const surfaces = new Set(['catalog', 'cloudflare-worker']);
const keys = (o) => Object.keys(o).sort().join('|');
const expected = (names) => [...names].sort().join('|');
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// R29 ADAPTATION 3 - the four claim flags. They exist in the record so an absent or forged value is a hard
// failure rather than a silent default. Every one of them is FALSE by construction.
const CLAIM_FLAGS = Object.freeze({
  publicationAuthorized: false,
  deployAllowed: false,
  sourceCommitVerified: false,
  ciAttested: false,
});

const expectedFields = [
  'schema', 'surface', 'buildId', 'sourceCommit', 'artifactSha256',
  'generationId', 'libraryFile', 'librarySha256', ...Object.keys(CLAIM_FLAGS),
];

// Exported so callers can see which fields were verified and which were merely asserted.
export const CLAIM_CLASSES = Object.freeze({
  assertedByCaller: Object.freeze(['buildId', 'sourceCommit', 'artifactSha256']),
  verifiedFromEvidence: Object.freeze(['generationId', 'librarySha256']),
  neverLocallyVerifiable: Object.freeze(Object.keys(CLAIM_FLAGS)),
});

// R29 ADAPTATION 1 - the surface pair is caller-supplied through the authorised policy. There is no default
// target set and no staging fallback; the contract needs exactly two distinct approved targets.
function surfaceTargets(authorised) {
  let targets;
  try {
    targets = assertTargetsApproved(authorised.targets);
  } catch {
    throw Error('R21_TARGET_SET_INVALID');
  }
  if (targets.length !== 2) throw Error('R21_TARGET_SET_INVALID');
  return [targets[0], targets[1]];
}

// R29 ADAPTATION 4 - containment is re-derived AT THE FILESYSTEM OPERATION from the live filesystem, not
// trusted from the policy object created earlier. A directory swapped after policy creation is re-checked.
function containedGenerationDir(policy, generationDir) {
  const authorised = assertPolicy(policy);
  let dir;
  try {
    dir = fs.realpathSync(generationDir);
  } catch {
    return { ok: false, reason: 'R21_GENERATION_UNAVAILABLE' };
  }
  if (!inside(authorised.rootDir, dir)) return { ok: false, reason: 'R21_GENERATION_OUTSIDE_POLICY' };
  return { ok: true, dir, authorised };
}

export function proposeBuildAttestation({ policy, generationDir, surface, buildId, sourceCommit, artifactSha256 } = {}) {
  if (!surfaces.has(surface) || typeof buildId !== 'string' || !ID.test(buildId)
    || typeof sourceCommit !== 'string' || !HASH.test(sourceCommit)
    || typeof artifactSha256 !== 'string' || !HASH.test(artifactSha256)) throw Error('R21_INVALID_BUILD_METADATA');
  const located = containedGenerationDir(policy, generationDir);
  if (!located.ok) throw Error(located.reason);
  const targets = surfaceTargets(located.authorised);
  const proof = verifyGeneration({ generationDir: located.dir, allowedTargets: targets });
  if (!proof.ok) throw Error('R21_GENERATION_UNVERIFIED');
  const libraryFile = surface === 'catalog' ? targets[0] : targets[1];
  return {
    schema: 'alp-c3-r21-build-v1',
    surface,
    buildId,
    sourceCommit,
    artifactSha256,
    generationId: proof.generationId,
    libraryFile,
    librarySha256: proof.hashes[libraryFile],
    ...CLAIM_FLAGS,
  };
}

export function verifyBuildPair({ policy, generationDir, catalog, worker } = {}) {
  let targets;
  let proof;
  try {
    const located = containedGenerationDir(policy, generationDir);
    if (!located.ok) return { ok: false, reason: located.reason };
    targets = surfaceTargets(located.authorised);
    proof = verifyGeneration({ generationDir: located.dir, allowedTargets: targets });
  } catch {
    return { ok: false, reason: 'R21_POLICY_INVALID' };
  }
  if (!proof.ok) return { ok: false, reason: 'R21_GENERATION_UNVERIFIED' };
  const verify = (record, surface, libraryFile) => {
    if (!record || Array.isArray(record) || typeof record !== 'object' || keys(record) !== expected(expectedFields)) return 'R21_INVALID_SHAPE';
    if (record.schema !== 'alp-c3-r21-build-v1') return 'R21_INVALID_POLICY';
    // R29 ADAPTATION 3 - every claim flag must be exactly false. A forged `true` is refused here, and this
    // module has no code path that could ever produce one.
    for (const [flag, value] of Object.entries(CLAIM_FLAGS)) {
      if (record[flag] !== value) return 'R21_INVALID_POLICY';
    }
    if (record.surface !== surface || record.libraryFile !== libraryFile) return 'R21_SURFACE_MISMATCH';
    if (typeof record.buildId !== 'string' || !ID.test(record.buildId) || !HASH.test(record.sourceCommit)
      || !HASH.test(record.artifactSha256) || !HASH.test(record.generationId) || !HASH.test(record.librarySha256)) return 'R21_INVALID_METADATA';
    if (record.generationId !== proof.generationId || record.librarySha256 !== proof.hashes[libraryFile]) return 'R21_GENERATION_MISMATCH';
    return null;
  };
  const a = verify(catalog, 'catalog', targets[0]);
  if (a) return { ok: false, reason: a };
  const b = verify(worker, 'cloudflare-worker', targets[1]);
  if (b) return { ok: false, reason: b };
  if (catalog.sourceCommit !== worker.sourceCommit) return { ok: false, reason: 'R21_COMMIT_MISMATCH' };
  const pair = {
    schema: 'alp-c3-r21-pair-v1',
    generationId: proof.generationId,
    sourceCommit: catalog.sourceCommit,
    catalogBuildId: catalog.buildId,
    workerBuildId: worker.buildId,
    catalogArtifactSha256: catalog.artifactSha256,
    workerArtifactSha256: worker.artifactSha256,
    ...CLAIM_FLAGS,
  };
  return {
    ok: true,
    reason: null,
    pairId: sha(JSON.stringify(pair)),
    pair,
    // Caller-visible separation: hashes were verified against evidence; the commit id was not.
    claims: {
      assertedByCaller: [...CLAIM_CLASSES.assertedByCaller],
      verifiedFromEvidence: [...CLAIM_CLASSES.verifiedFromEvidence],
      neverLocallyVerifiable: [...CLAIM_CLASSES.neverLocallyVerifiable],
    },
  };
}
