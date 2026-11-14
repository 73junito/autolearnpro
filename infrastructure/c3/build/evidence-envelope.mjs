// C3-R36C: offline evidence envelope (B12).
//
// WHAT THIS IS: a versioned, canonically serialized record that binds three things already established locally —
// the C3-R36A source snapshot, the C3-R36B Worker bundle record, and the bytes on disk — plus the toolchain
// identity, and it states plainly which claims it does and does not support.
//
// WHAT THIS IS NOT: an attestation. No Git origin, CI identity, publisher identity, signature, human approval,
// publication authority or deployment authorisation is created, implied or accepted. The four trusted flags are
// pinned false, and a caller-supplied claim never becomes verified evidence: the writer refuses a true flag, and
// the reader re-derives the flags from the file rather than trusting them.
//
// DETERMINISM: the envelope digest covers only facts about bytes and configuration. It contains no timestamps, no
// absolute paths, no usernames, no hostnames, no random identifiers and no environment lookups. The same inputs on
// any machine produce the same digest.
//
// PERSISTENCE: writing is restricted to a caller-supplied directory inside an R28 temporary policy root, uses
// exclusive creation, and is read back and re-hashed before being reported as written.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertPolicy } from '../library/target-policy.mjs';
import { BUNDLE_CONFIG_ID, BUNDLE_FILE_NAME } from './worker-bundle.mjs';
import { SNAPSHOT_SCHEMA } from './source-snapshot.mjs';

export const ENVELOPE_SCHEMA = 'alp-c3-offline-evidence-envelope';
export const ENVELOPE_VERSION = 1;
export const EVIDENCE_FILE_NAME = 'evidence.json';

// WHAT THE WRITER ACTUALLY CHECKED. Each entry is an operation this code performed, not a promise.
export const VERIFIED_LOCALLY = Object.freeze([
  'sourceBytesMatchRecordedDigest',
  'artifactBytesMatchRecordedDigest',
  'snapshotMatchesReviewedContract'
]);

// WHAT THIS RECORD CANNOT ESTABLISH, whatever else is true about it.
export const NOT_ESTABLISHED = Object.freeze([
  'gitOrigin',
  'ciWorkloadIdentity',
  'publisherIdentity',
  'signedReleaseAttestation',
  'humanReleaseApproval',
  'publicationAuthorization',
  'deploymentAuthorization'
]);

export const ENVELOPE_CLAIMS = Object.freeze({
  sourceCommitVerified: false,
  ciAttested: false,
  publicationAuthorized: false,
  deployAllowed: false
});

// Flat, globally unique field names. Uniqueness is load-bearing: the duplicate-field check counts occurrences of
// each name in the raw text, so two different fields may never share a name.
export const ENVELOPE_FIELDS = Object.freeze([
  'envelopeSchema',
  'envelopeVersion',
  'snapshotSchema',
  'snapshotCombinedSha256',
  'snapshotEntryCount',
  'workerSourceSha256',
  'workerSourceBytes',
  'artifactRole',
  'artifactPath',
  'artifactSha256',
  'artifactBytes',
  'toolchainName',
  'toolchainVersion',
  'buildConfigId',
  'verifiedLocally',
  'notEstablished',
  'sourceCommitVerified',
  'ciAttested',
  'publicationAuthorized',
  'deployAllowed',
  'envelopeSha256'
]);

const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// Length-prefixed field encoding, for the same reason C3-R36A uses it: with a plain join, ('ab','c') and
// ('a','bc') would serialize identically.
const encodeField = (value) => {
  const text = String(value);
  return `${text.length}:${text}`;
};
const encodeRow = (tag, fields) => [tag, ...fields].map(encodeField).join('|');

/**
 * Canonical bytes covered by the envelope digest. Order is fixed and every value is length-prefixed, so two
 * different envelopes cannot serialize identically and no field can be silently dropped from the digest.
 */
export function canonicalEvidenceText(envelope) {
  return [
    encodeRow('schema', [envelope.envelopeSchema]),
    encodeRow('version', [envelope.envelopeVersion]),
    encodeRow('snapshot', [envelope.snapshotSchema, envelope.snapshotCombinedSha256, envelope.snapshotEntryCount]),
    encodeRow('source', [envelope.workerSourceSha256, envelope.workerSourceBytes]),
    encodeRow('artifact', [envelope.artifactRole, envelope.artifactPath, envelope.artifactSha256, envelope.artifactBytes]),
    encodeRow('toolchain', [envelope.toolchainName, envelope.toolchainVersion, envelope.buildConfigId]),
    ...envelope.verifiedLocally.map((entry) => encodeRow('verified', [entry])),
    ...envelope.notEstablished.map((entry) => encodeRow('notEstablished', [entry])),
    encodeRow('claims', [
      envelope.sourceCommitVerified,
      envelope.ciAttested,
      envelope.publicationAuthorized,
      envelope.deployAllowed
    ])
  ].join('\n');
}

// Exported so a test — or an attacker — can re-seal an edited envelope. That is deliberate: the point is that a
// re-sealed forgery still fails, because verification binds the record to real bytes rather than to itself.
export function computeEnvelopeDigest(envelope) {
  return sha256(Buffer.from(canonicalEvidenceText(envelope), 'utf8'));
}

// JSON text as it is written to disk. Field order is fixed, but nothing depends on it: the digest is computed
// from canonicalEvidenceText, not from this string.
export function serializeEvidence(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

// Strict structural validation of a supplied envelope, before any byte of artifact is trusted.
function assertEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw Error('R36C_ENVELOPE_REQUIRED');

  if (envelope.envelopeSchema !== ENVELOPE_SCHEMA) {
    // A historical R22 evidence record keeps its own refusal, for the reason C3-R36A established.
    const historical = (typeof envelope.envelopeSchema === 'string' && /r22|alp-c3-r2/i.test(envelope.envelopeSchema))
      || 'generationId' in envelope || 'pairId' in envelope;
    if (historical) throw Error('R36C_HISTORICAL_R22_REQUIRES_DECISION');
    throw Error(`R36C_SCHEMA_INVALID:${String(envelope.envelopeSchema)}`);
  }
  if (envelope.envelopeVersion !== ENVELOPE_VERSION) {
    throw Error(`R36C_SCHEMA_UNSUPPORTED:${String(envelope.envelopeVersion)}`);
  }

  for (const key of Object.keys(envelope)) {
    if (!ENVELOPE_FIELDS.includes(key)) throw Error(`R36C_FIELD_UNEXPECTED:${key}`);
  }
  for (const key of ENVELOPE_FIELDS) {
    if (!Object.hasOwn(envelope, key)) throw Error(`R36C_FIELD_MISSING:${key}`);
  }

  if (envelope.snapshotSchema !== SNAPSHOT_SCHEMA) throw Error(`R36C_SNAPSHOT_SCHEMA_INVALID:${String(envelope.snapshotSchema)}`);
  for (const key of ['snapshotCombinedSha256', 'workerSourceSha256', 'artifactSha256', 'envelopeSha256']) {
    if (typeof envelope[key] !== 'string' || !HASH.test(envelope[key])) throw Error(`R36C_HASH_INVALID:${key}`);
  }
  for (const key of ['snapshotEntryCount', 'workerSourceBytes', 'artifactBytes']) {
    if (!Number.isInteger(envelope[key]) || envelope[key] < 0) throw Error(`R36C_FIELD_INVALID:${key}`);
  }

  if (envelope.artifactRole !== 'worker') throw Error(`R36C_ROLE_UNKNOWN:${String(envelope.artifactRole)}`);
  if (envelope.artifactPath !== BUNDLE_FILE_NAME) throw Error(`R36C_ARTIFACT_PATH_INVALID:${String(envelope.artifactPath)}`);
  if (envelope.toolchainName !== 'esbuild') throw Error(`R36C_TOOLCHAIN_UNKNOWN:${String(envelope.toolchainName)}`);
  if (typeof envelope.toolchainVersion !== 'string' || !VERSION.test(envelope.toolchainVersion)) {
    throw Error(`R36C_TOOLCHAIN_VERSION_INVALID:${String(envelope.toolchainVersion)}`);
  }
  if (envelope.buildConfigId !== BUNDLE_CONFIG_ID) throw Error(`R36C_CONFIG_UNKNOWN:${String(envelope.buildConfigId)}`);

  for (const key of ['verifiedLocally', 'notEstablished']) {
    if (!Array.isArray(envelope[key]) || envelope[key].some((entry) => typeof entry !== 'string')) {
      throw Error(`R36C_FIELD_INVALID:${key}`);
    }
  }
  if (JSON.stringify(envelope.verifiedLocally) !== JSON.stringify([...VERIFIED_LOCALLY])) throw Error('R36C_VERIFIED_LIST_INVALID');
  if (JSON.stringify(envelope.notEstablished) !== JSON.stringify([...NOT_ESTABLISHED])) throw Error('R36C_NOT_ESTABLISHED_LIST_INVALID');

  for (const [key, expected] of Object.entries(ENVELOPE_CLAIMS)) {
    if (envelope[key] !== expected) throw Error(`R36C_FORGED_CLAIM:${key}`);
  }
}

// JSON.parse silently keeps the last of duplicated keys, so duplicates must be found in the raw text.
function assertNoDuplicateFields(rawText) {
  for (const field of ENVELOPE_FIELDS) {
    const occurrences = rawText.split(`"${field}"`).length - 1;
    if (occurrences > 1) throw Error(`R36C_DUPLICATE_FIELD:${field}`);
  }
}

function resolveInsidePolicy(policy, directory, label) {
  const authorised = assertPolicy(policy);
  if (typeof directory !== 'string' || directory.length === 0) throw Error(`R36C_${label}_REQUIRED`);
  let resolved;
  try {
    resolved = fs.realpathSync(directory);
  } catch {
    throw Error(`R36C_${label}_UNAVAILABLE`);
  }
  if (!inside(authorised.rootDir, resolved)) throw Error(`R36C_${label}_OUTSIDE_POLICY`);
  return { authorised, resolved };
}

/**
 * Builds an envelope from records that already exist. Relationships are checked rather than copied: the bundle's
 * entry digest must be the Worker digest the snapshot recorded, and any snapshot reference the bundle carries must
 * be the same snapshot.
 */
export function createEvidenceEnvelope({ snapshot, bundle, toolchain } = {}) {
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.combinedSha256 !== 'string') throw Error('R36C_SNAPSHOT_REQUIRED');
  if (!bundle || typeof bundle !== 'object' || !bundle.entry || !bundle.output) throw Error('R36C_BUNDLE_REQUIRED');
  if (!toolchain || typeof toolchain !== 'object') throw Error('R36C_TOOLCHAIN_REQUIRED');

  if (snapshot.schema !== SNAPSHOT_SCHEMA) throw Error(`R36C_SNAPSHOT_SCHEMA_INVALID:${String(snapshot.schema)}`);
  if (bundle.configId !== BUNDLE_CONFIG_ID) throw Error(`R36C_CONFIG_UNKNOWN:${String(bundle.configId)}`);
  if (bundle.output.file !== BUNDLE_FILE_NAME) throw Error(`R36C_ARTIFACT_PATH_INVALID:${String(bundle.output.file)}`);
  if (bundle.snapshot && bundle.snapshot.combinedSha256 !== snapshot.combinedSha256) throw Error('R36C_SNAPSHOT_MISMATCH');

  const workerEntry = (snapshot.entries ?? []).find((entry) => entry.role === 'worker' && entry.path.endsWith(`/${BUNDLE_FILE_NAME}`));
  if (!workerEntry) throw Error('R36C_SNAPSHOT_WORKER_ENTRY_MISSING');
  if (workerEntry.sha256 !== bundle.entry.sha256) throw Error('R36C_SOURCE_MISMATCH');

  if (toolchain.name !== 'esbuild') throw Error(`R36C_TOOLCHAIN_UNKNOWN:${String(toolchain.name)}`);
  if (typeof toolchain.version !== 'string' || !VERSION.test(toolchain.version)) {
    throw Error(`R36C_TOOLCHAIN_VERSION_INVALID:${String(toolchain.version)}`);
  }

  const draft = {
    envelopeSchema: ENVELOPE_SCHEMA,
    envelopeVersion: ENVELOPE_VERSION,
    snapshotSchema: snapshot.schema,
    snapshotCombinedSha256: snapshot.combinedSha256,
    snapshotEntryCount: Array.isArray(snapshot.entries) ? snapshot.entries.length : 0,
    workerSourceSha256: workerEntry.sha256,
    workerSourceBytes: workerEntry.size,
    artifactRole: 'worker',
    artifactPath: bundle.output.file,
    artifactSha256: bundle.output.sha256,
    artifactBytes: bundle.output.bytes,
    toolchainName: toolchain.name,
    toolchainVersion: toolchain.version,
    buildConfigId: bundle.configId,
    verifiedLocally: [...VERIFIED_LOCALLY],
    notEstablished: [...NOT_ESTABLISHED],
    ...ENVELOPE_CLAIMS
  };

  const envelope = Object.freeze({ ...draft, envelopeSha256: computeEnvelopeDigest(draft) });
  assertEnvelopeShape(envelope);
  return envelope;
}

/**
 * Writes an envelope into a caller-supplied temporary directory. Exclusive creation, no overwrite, durability
 * flushed, and the final bytes re-read and re-hashed before the write is reported as complete.
 */
export function writeEvidenceEnvelope({ policy, evidenceRoot, envelope, roots, fileName = EVIDENCE_FILE_NAME } = {}) {
  assertEnvelopeShape(envelope);
  const { resolved } = resolveInsidePolicy(policy, evidenceRoot, 'EVIDENCE_ROOT');

  // A source directory may never hold evidence, whatever the policy allows.
  for (const root of roots ? [roots.repository, roots.catalog, roots.worker] : []) {
    if (typeof root === 'string' && (resolved.toLowerCase() === root.toLowerCase() || inside(root, resolved))) {
      throw Error('R36C_EVIDENCE_ROOT_INSIDE_SOURCE');
    }
  }
  if (typeof fileName !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/i.test(fileName) || fileName.includes('..')) {
    throw Error(`R36C_FILE_NAME_INVALID:${String(fileName)}`);
  }

  const destination = path.join(resolved, fileName);
  if (!inside(resolved, destination)) throw Error('R36C_DESTINATION_ESCAPE');

  let existing = null;
  try {
    existing = fs.lstatSync(destination);
  } catch {
    existing = null;
  }
  if (existing) {
    // Refused, never repaired and never overwritten — including when the existing file is itself a link.
    if (existing.isSymbolicLink()) throw Error('R36C_DESTINATION_SYMLINK');
    throw Error('R36C_DESTINATION_EXISTS');
  }

  const bytes = Buffer.from(serializeEvidence(envelope), 'utf8');
  const descriptor = fs.openSync(destination, 'wx');
  try {
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }

  // Directory fsync makes the rename/creation durable on POSIX. On Windows a directory handle cannot be fsynced,
  // so the file-level flush above is the whole guarantee there; the difference is documented, not hidden.
  if (process.platform !== 'win32') {
    const directory = fs.openSync(resolved, 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  }

  const readBack = fs.readFileSync(destination);
  if (sha256(readBack) !== sha256(bytes)) throw Error('R36C_WRITE_VERIFY_FAILED');

  return Object.freeze({
    ok: true,
    path: destination,
    bytes: readBack.length,
    sha256: sha256(readBack),
    envelopeSha256: envelope.envelopeSha256,
    durable: process.platform !== 'win32' ? 'file+directory fsync' : 'file fsync only (directory fsync unsupported on this platform)'
  });
}

/**
 * Independent verification of a stored envelope.
 *
 * The file's own internal consistency is never sufficient: `snapshot` and `toolchain` are supplied by the caller
 * from an independent derivation, and every digest in the file is re-checked against real bytes. A re-sealed
 * forgery therefore still fails.
 */
export function verifyEvidenceFile({
  policy,
  evidenceRoot,
  artifactRoot,
  fileName = EVIDENCE_FILE_NAME,
  snapshot,
  toolchain
} = {}) {
  const { resolved: evidenceDir } = resolveInsidePolicy(policy, evidenceRoot, 'EVIDENCE_ROOT');
  if (typeof fileName !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/i.test(fileName) || fileName.includes('..')) {
    throw Error(`R36C_FILE_NAME_INVALID:${String(fileName)}`);
  }
  const evidencePath = path.join(evidenceDir, fileName);
  if (!inside(evidenceDir, evidencePath)) throw Error('R36C_EVIDENCE_PATH_ESCAPE');

  let stats;
  try {
    stats = fs.lstatSync(evidencePath);
  } catch {
    throw Error('R36C_EVIDENCE_MISSING');
  }
  if (stats.isSymbolicLink()) throw Error('R36C_EVIDENCE_SYMLINK');
  if (!stats.isFile()) throw Error('R36C_EVIDENCE_NOT_FILE');

  const raw = fs.readFileSync(evidencePath, 'utf8');
  assertNoDuplicateFields(raw);

  let envelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    // A truncated or interrupted write lands here and is refused, never repaired.
    throw Error('R36C_EVIDENCE_UNREADABLE');
  }
  assertEnvelopeShape(envelope);
  if (computeEnvelopeDigest(envelope) !== envelope.envelopeSha256) throw Error('R36C_DIGEST_MISMATCH');

  // The artifact bytes, re-hashed from disk.
  const { resolved: artifactDir } = resolveInsidePolicy(policy, artifactRoot, 'ARTIFACT_ROOT');
  const artifactPath = path.join(artifactDir, envelope.artifactPath);
  if (!inside(artifactDir, artifactPath)) throw Error('R36C_ARTIFACT_ESCAPE');
  let artifactStats;
  try {
    artifactStats = fs.lstatSync(artifactPath);
  } catch {
    throw Error('R36C_ARTIFACT_MISSING');
  }
  if (artifactStats.isSymbolicLink()) throw Error('R36C_ARTIFACT_SYMLINK');
  const artifactBytes = fs.readFileSync(artifactPath);
  if (artifactBytes.length !== envelope.artifactBytes) throw Error('R36C_ARTIFACT_MISMATCH:size');
  if (sha256(artifactBytes) !== envelope.artifactSha256) throw Error('R36C_ARTIFACT_MISMATCH:sha256');

  // The source, re-derived independently. Without this, the file would only be checking itself.
  if (!snapshot || typeof snapshot.combinedSha256 !== 'string') throw Error('R36C_EXPECTED_SNAPSHOT_REQUIRED');
  if (snapshot.schema !== envelope.snapshotSchema) throw Error('R36C_SNAPSHOT_MISMATCH:schema');
  if (snapshot.combinedSha256 !== envelope.snapshotCombinedSha256) throw Error('R36C_SNAPSHOT_MISMATCH:digest');
  if (Array.isArray(snapshot.entries) && snapshot.entries.length !== envelope.snapshotEntryCount) {
    throw Error('R36C_SNAPSHOT_MISMATCH:entryCount');
  }
  const expectedWorker = (snapshot.entries ?? []).find((entry) => entry.role === 'worker' && entry.path.endsWith(`/${BUNDLE_FILE_NAME}`));
  if (!expectedWorker) throw Error('R36C_SNAPSHOT_WORKER_ENTRY_MISSING');
  if (expectedWorker.sha256 !== envelope.workerSourceSha256) throw Error('R36C_SOURCE_MISMATCH:sha256');
  if (expectedWorker.size !== envelope.workerSourceBytes) throw Error('R36C_SOURCE_MISMATCH:size');

  // The toolchain, as an independently supplied expectation rather than a self-description.
  if (!toolchain || typeof toolchain !== 'object') throw Error('R36C_EXPECTED_TOOLCHAIN_REQUIRED');
  if (toolchain.name !== envelope.toolchainName) throw Error('R36C_TOOLCHAIN_MISMATCH:name');
  if (toolchain.version !== envelope.toolchainVersion) throw Error('R36C_TOOLCHAIN_MISMATCH:version');
  if (toolchain.configId !== envelope.buildConfigId) throw Error('R36C_TOOLCHAIN_MISMATCH:configId');

  return Object.freeze({
    ok: true,
    envelopeSha256: envelope.envelopeSha256,
    artifact: Object.freeze({ path: envelope.artifactPath, bytes: artifactBytes.length, sha256: envelope.artifactSha256 }),
    source: Object.freeze({ sha256: envelope.workerSourceSha256, bytes: envelope.workerSourceBytes }),
    snapshot: Object.freeze({ schema: envelope.snapshotSchema, combinedSha256: envelope.snapshotCombinedSha256 }),
    toolchain: Object.freeze({ name: envelope.toolchainName, version: envelope.toolchainVersion, configId: envelope.buildConfigId }),
    claims: ENVELOPE_CLAIMS,
    establishes: Object.freeze([...VERIFIED_LOCALLY]),
    doesNotEstablish: Object.freeze([...NOT_ESTABLISHED])
  });
}

// Removes only the envelope file this module writes, and only from an authorised temporary directory.
export function removeEvidenceFile({ policy, evidenceRoot, fileName = EVIDENCE_FILE_NAME } = {}) {
  const { resolved } = resolveInsidePolicy(policy, evidenceRoot, 'EVIDENCE_ROOT');
  if (typeof fileName !== 'string' || !/^[a-z0-9][a-z0-9.-]*$/i.test(fileName) || fileName.includes('..')) {
    throw Error(`R36C_FILE_NAME_INVALID:${String(fileName)}`);
  }
  const target = path.join(resolved, fileName);
  if (!inside(resolved, target)) throw Error('R36C_EVIDENCE_PATH_ESCAPE');
  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch {
    throw Error('R36C_EVIDENCE_MISSING');
  }
  // A link is not ours to delete: removing it would be a cleanup of something this module did not create.
  if (stats.isSymbolicLink()) throw Error('R36C_EVIDENCE_SYMLINK');
  if (!stats.isFile()) throw Error('R36C_EVIDENCE_NOT_FILE');
  fs.rmSync(target);
  return Object.freeze({ removed: 1, path: target });
}



