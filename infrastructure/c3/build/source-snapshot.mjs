// C3-R36A: multi-root source snapshot contract.
//
// B9 disposition: this module CONSUMES the C3-R35 validated mapping; it never infers a root. Every path it
// records comes from `assertBuildInputMapping`, which is the single place roots are resolved and authorised.
//
// WHAT A SNAPSHOT IS: a canonical, digest-bound description of the inputs at one moment, with an unambiguous
// serialization and a combined SHA-256. WHAT IT IS NOT: proof of Git origin, authorship, review, CI execution,
// approval or publication authority. Those four claims are pinned false, participate in the digest, and are
// re-derived on every verification.
//
// READ-ONLY BY CONSTRUCTION: no writes, no bundler, no network, no subprocess. Verification re-reads bytes and
// compares; it never repairs, recreates or authorises anything.
//
// C3-R35 is frozen at its verified fingerprint, so this module imports its public API rather than extending it.
// A dedicated test asserts the two implementations agree, so they cannot drift apart silently.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertBuildInputMapping, INPUT_KINDS, INPUT_ROLES } from './build-input-contract.mjs';

export const SNAPSHOT_SCHEMA = 'alp-c3-r36a-multi-root-snapshot';
export const SNAPSHOT_VERSION = 1;

const ROLE_RANK = Object.freeze({ repository: 0, catalog: 1, worker: 2 });
const ROLES = Object.freeze(Object.values(INPUT_ROLES));

// A snapshot may carry exactly these keys. Anything else is refused rather than ignored: an unknown field is
// either a schema this code does not understand or an attempt to smuggle a claim past the digest.
const ALLOWED_KEYS = Object.freeze([
  'schema', 'version', 'declared', 'entries', 'exclusions', 'limitations', 'compatibility', 'claims',
  'combinedSha256'
]);

// The four claims this contract can never raise. C3-R36A Phase D.
const CLAIMS = Object.freeze({
  sourceCommitVerified: false,
  ciAttested: false,
  publicationAuthorized: false,
  deployAllowed: false
});

// B10: historical R22 inputs the approved architecture does not have. Recorded as explicit exclusions, so an
// absence is part of the record rather than a silent gap — and never as an empty, "verified" directory.
export const REVIEWED_EXCLUSIONS = Object.freeze([
  Object.freeze({
    r22Path: 'lib/assets',
    disposition: 'ABSENT_BY_ARCHITECTURE',
    reason: 'Generated library data does not exist in this repository; C3-R35 declared it absent deliberately.'
  }),
  Object.freeze({
    r22Path: 'catalog.html',
    disposition: 'SUPERSEDED',
    reason: 'apps/catalog/index.html is the only catalog entry point (C3-R34).'
  }),
  Object.freeze({
    r22Path: 'cloudflare/api/src/',
    disposition: 'SUPERSEDED',
    reason: 'infrastructure/cloudflare/worker.mjs is the single Worker entry point (C3-R33, enforced by C3-R35).'
  })
]);

export const SNAPSHOT_LIMITATIONS = Object.freeze([
  'This record establishes consistency of the recorded inputs when it was checked. It establishes nothing about Git origin, authorship, review or approval.',
  'No build ran: there is no artifact, no generation id, no pair id and no attestation, and none is implied.',
  'This is not equivalent to a historical R22 snapshot: the roots, the input names and the exclusion set all differ.',
  'Declared directories are expanded to files. An empty declared directory is recorded as empty, which is not the same as absent.',
  'A same-path, same-byte substitution by a privileged actor between hashing and later use is not detectable here.',
  'Verification is local: it does not consult any remote, registry or CI system.'
]);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Length-prefixed field encoding. Concatenation ambiguity is the reason this exists: with a plain join, the pair
// (role 'a', path 'b/c') and (role 'a/b', path 'c') would serialize identically. '1:a|3:b/c' cannot be re-split
// into those two different inputs.
const encodeField = (value) => {
  const text = String(value);
  return `${text.length}:${text}`;
};
const encodeRow = (tag, fields) => [tag, ...fields].map(encodeField).join('|');
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const orderRows = (a, b) => (ROLE_RANK[a.role] - ROLE_RANK[b.role]) || compareText(a.path, b.path) || compareText(a.rootPath, b.rootPath);

// Canonical bytes covered by the combined digest. Ordered, tagged and length-prefixed, so no two distinct
// snapshots can serialize identically and no field can be silently dropped.
function canonicalText({ schema, version, declared, entries, exclusions, limitations, compatibility, claims }) {
  const lines = [
    encodeRow('schema', [schema]),
    encodeRow('version', [version]),
    ...declared.map((row) => encodeRow('declared', [row.role, row.rootPath, row.path, row.kind])),
    ...entries.map((row) => encodeRow('entry', [row.role, row.rootPath, row.path, row.kind, row.size, row.sha256])),
    ...exclusions.map((row) => encodeRow('exclusion', [row.r22Path, row.disposition, row.reason])),
    ...limitations.map((row) => encodeRow('limitation', [row])),
    encodeRow('compatibility', [compatibility.historicalR22Equivalent, compatibility.requiresVersionedDecision]),
    encodeRow('claims', [claims.sourceCommitVerified, claims.ciAttested, claims.publicationAuthorized, claims.deployAllowed])
  ];
  return lines.join('\n');
}

// A recorded path must be repository-relative, forward-slash separated, and free of traversal segments.
function assertRecordedPath(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw Error(`R36A_ENTRY_PATH_INVALID:${label}`);
  if (path.isAbsolute(value) || /^[a-zA-Z]:/.test(value)) throw Error(`R36A_ENTRY_PATH_ABSOLUTE:${label}`);
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') throw Error(`R36A_ENTRY_PATH_TRAVERSAL:${label}`);
  }
  return value;
}

function toRepositoryRelative(repositoryRoot, absolute) {
  const relative = path.relative(repositoryRoot, absolute).split(path.sep).join('/');
  if (relative === '' || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw Error(`R36A_PATH_OUTSIDE_REPOSITORY:${absolute}`);
  }
  return relative;
}

// Turns an R35 mapping into the canonical record. Directory inputs are expanded to their files, and every file
// is re-read and re-hashed here, so a change between mapping and snapshot is caught instead of recorded.
function describeMapping(mapping) {
  if (!mapping || mapping.ok !== true || !mapping.roots || !Array.isArray(mapping.inputs)) throw Error('R36A_MAPPING_REQUIRED');
  const { repository } = mapping.roots;
  const declared = [];
  const entries = [];

  for (const input of mapping.inputs) {
    if (!ROLES.includes(input.role)) throw Error(`R36A_ROLE_UNKNOWN:${String(input.role)}`);
    if (input.kind !== INPUT_KINDS.FILE && input.kind !== INPUT_KINDS.DIRECTORY) {
      throw Error(`R36A_INPUT_KIND_UNKNOWN:${input.role}/${input.path}`);
    }
    const rootPath = assertRecordedPath(input.path, `${input.role}/${input.path}`);
    const repoPath = toRepositoryRelative(repository, input.absolute);
    declared.push({ role: input.role, rootPath, path: repoPath, kind: input.kind });

    if (input.kind === INPUT_KINDS.FILE) {
      const bytes = fs.readFileSync(input.absolute);
      const digest = sha256(bytes);
      if (digest !== input.sha256) throw Error(`R36A_INPUT_CHANGED:${repoPath}`);
      entries.push({ role: input.role, rootPath, path: repoPath, kind: INPUT_KINDS.FILE, size: bytes.length, sha256: digest });
      continue;
    }

    for (const [type, name, digest] of input.entries) {
      if (type !== 'f') continue;
      const relative = assertRecordedPath(name, `${input.role}/${rootPath}/${name}`);
      const absolute = path.join(input.absolute, ...relative.split('/'));
      const bytes = fs.readFileSync(absolute);
      if (sha256(bytes) !== digest) throw Error(`R36A_INPUT_CHANGED:${repoPath}/${relative}`);
      entries.push({
        role: input.role,
        rootPath: `${rootPath}/${relative}`,
        path: `${repoPath}/${relative}`,
        kind: INPUT_KINDS.FILE,
        size: bytes.length,
        sha256: digest
      });
    }
  }

  declared.sort(orderRows);
  entries.sort(orderRows);

  // A declared file may also be inside a declared directory: R35's reviewed spec lists both `src` and
  // `src/main.js` for the catalog. That is a redundant declaration, not a conflict, so identical rows collapse
  // into one. A collision is only a collision when the same role+path carries *different* content.
  const unique = [];
  for (const row of entries) {
    const previous = unique[unique.length - 1];
    if (previous && previous.role === row.role && previous.path === row.path) {
      if (previous.sha256 !== row.sha256 || previous.size !== row.size) {
        throw Error(`R36A_PATH_COLLISION:${row.role}/${row.path}`);
      }
      continue;
    }
    unique.push(row);
  }
  return { declared, entries: unique };
}

function freezeRow(row) {
  return Object.freeze({ ...row });
}

function buildSnapshot(mapping, exclusions) {
  const { declared, entries } = describeMapping(mapping);
  const sortedExclusions = exclusions
    .map((row) => freezeRow({ r22Path: row.r22Path, disposition: row.disposition, reason: row.reason }))
    .sort((a, b) => compareText(a.r22Path, b.r22Path));

  const draft = {
    schema: SNAPSHOT_SCHEMA,
    version: SNAPSHOT_VERSION,
    declared: declared.map(freezeRow),
    entries: entries.map(freezeRow),
    exclusions: sortedExclusions,
    limitations: SNAPSHOT_LIMITATIONS,
    compatibility: Object.freeze({ historicalR22Equivalent: false, requiresVersionedDecision: true }),
    claims: CLAIMS
  };

  return Object.freeze({
    ...draft,
    declared: Object.freeze(draft.declared),
    entries: Object.freeze(draft.entries),
    exclusions: Object.freeze(draft.exclusions),
    combinedSha256: sha256(Buffer.from(canonicalText(draft), 'utf8'))
  });
}

// Creates a snapshot from the R35 mapping. `policy`, `outputRoot` and `roots` are exactly the R35 arguments:
// the temporary-policy gate is not bypassed or re-implemented here.
export function createSourceSnapshot({ policy, outputRoot, roots, inputs, exclusions = REVIEWED_EXCLUSIONS } = {}) {
  if (!Array.isArray(exclusions)) throw Error('R36A_EXCLUSIONS_INVALID');
  const mapping = inputs
    ? assertBuildInputMapping({ policy, outputRoot, roots, inputs })
    : assertBuildInputMapping({ policy, outputRoot, roots });
  return buildSnapshot(mapping, exclusions);
}

// Structural validation of a record supplied from outside. Everything is checked before a byte is read.
function assertSnapshotShape(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw Error('R36A_SNAPSHOT_REQUIRED');

  // Historical R22 records are refused with their own reason, not as a generic schema error: they must not enter
  // this verifier on the strength of looking similar.
  if (snapshot.schema !== SNAPSHOT_SCHEMA) {
    const historical = (typeof snapshot.schema === 'string' && /r22|alp-c3-r2/i.test(snapshot.schema))
      || 'generationId' in snapshot || 'pairId' in snapshot;
    if (historical) throw Error('R36A_HISTORICAL_R22_REQUIRES_DECISION');
    throw Error(`R36A_SCHEMA_INVALID:${String(snapshot.schema)}`);
  }
  if (snapshot.version !== SNAPSHOT_VERSION) throw Error(`R36A_SCHEMA_UNSUPPORTED:${String(snapshot.version)}`);

  for (const key of Object.keys(snapshot)) {
    if (!ALLOWED_KEYS.includes(key)) throw Error(`R36A_FIELD_UNEXPECTED:${key}`);
  }
  for (const key of ALLOWED_KEYS) {
    if (!Object.hasOwn(snapshot, key)) throw Error(`R36A_FIELD_MISSING:${key}`);
  }
  for (const key of ['declared', 'entries', 'exclusions', 'limitations']) {
    if (!Array.isArray(snapshot[key])) throw Error(`R36A_SHAPE_INVALID:${key}`);
  }

  for (const row of snapshot.declared) {
    if (!row || typeof row !== 'object') throw Error('R36A_DECLARED_INVALID');
    if (!ROLES.includes(row.role)) throw Error(`R36A_ROLE_UNKNOWN:${String(row.role)}`);
    assertRecordedPath(row.path, `${row.role}/${String(row.path)}`);
    assertRecordedPath(row.rootPath, `${row.role}/${String(row.rootPath)}`);
    if (row.kind !== INPUT_KINDS.FILE && row.kind !== INPUT_KINDS.DIRECTORY) {
      throw Error(`R36A_INPUT_KIND_UNKNOWN:${row.role}/${row.path}`);
    }
  }

  const seen = new Set();
  for (const row of snapshot.entries) {
    if (!row || typeof row !== 'object') throw Error('R36A_ENTRY_INVALID');
    if (!ROLES.includes(row.role)) throw Error(`R36A_ROLE_UNKNOWN:${String(row.role)}`);
    assertRecordedPath(row.path, `${row.role}/${String(row.path)}`);
    assertRecordedPath(row.rootPath, `${row.role}/${String(row.rootPath)}`);
    if (row.kind !== INPUT_KINDS.FILE) throw Error(`R36A_ENTRY_INVALID:${row.role}/${row.path}`);
    if (!Number.isInteger(row.size) || row.size < 0) throw Error(`R36A_ENTRY_INVALID:${row.role}/${row.path}`);
    if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) throw Error(`R36A_ENTRY_INVALID:${row.role}/${row.path}`);
    const key = `${row.role}\u0000${row.path}`;
    if (seen.has(key)) throw Error(`R36A_PATH_COLLISION:${row.role}/${row.path}`);
    seen.add(key);
  }

  for (const row of snapshot.exclusions) {
    if (!row || typeof row.r22Path !== 'string' || row.r22Path.length === 0) throw Error('R36A_EXCLUSION_INVALID');
    if (typeof row.disposition !== 'string' || typeof row.reason !== 'string') throw Error('R36A_EXCLUSION_INVALID');
    // An absence may never be recorded as a verified emptiness.
    if (/^VERIFIED/i.test(row.disposition)) throw Error(`R36A_EXCLUSION_INVALID:${row.r22Path}`);
  }

  for (const row of snapshot.limitations) {
    if (typeof row !== 'string' || row.length === 0) throw Error('R36A_LIMITATION_INVALID');
  }

  if (!snapshot.claims || typeof snapshot.claims !== 'object' || Array.isArray(snapshot.claims)) throw Error('R36A_FORGED_CLAIM:claims');
  for (const [key, expected] of Object.entries(CLAIMS)) {
    if (snapshot.claims[key] !== expected) throw Error(`R36A_FORGED_CLAIM:${key}`);
  }
  if (Object.keys(snapshot.claims).length !== Object.keys(CLAIMS).length) throw Error('R36A_FORGED_CLAIM:unexpected-claim');

  const compatibility = snapshot.compatibility;
  if (!compatibility || typeof compatibility !== 'object') throw Error('R36A_COMPATIBILITY_INVALID');
  if (compatibility.historicalR22Equivalent !== false) throw Error('R36A_COMPATIBILITY_INVALID:historicalR22Equivalent');
  if (compatibility.requiresVersionedDecision !== true) throw Error('R36A_COMPATIBILITY_INVALID:requiresVersionedDecision');

  if (typeof snapshot.combinedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.combinedSha256)) throw Error('R36A_DIGEST_INVALID');
}

// Verifies a supplied record against the inputs that exist now. Read-only: it re-reads bytes and compares.
export function verifySourceSnapshot({ policy, outputRoot, roots, snapshot } = {}) {
  assertSnapshotShape(snapshot);

  // The recorded digest is recomputed from the recorded fields before any filesystem access, so a substituted
  // role, a reordered row or an edited digest fails here rather than being masked by a later check.
  if (sha256(Buffer.from(canonicalText(snapshot), 'utf8')) !== snapshot.combinedSha256) throw Error('R36A_DIGEST_MISMATCH');

  // Rebuild the R35 input spec from the snapshot's own declaration, then let R35 re-resolve and re-hash. The
  // snapshot never gets to say where a root is; it may only say which declared inputs to re-check.
  const spec = {};
  for (const row of snapshot.declared) {
    if (!spec[row.role]) spec[row.role] = [];
    spec[row.role].push({ path: row.rootPath, kind: row.kind });
  }
  const mapping = assertBuildInputMapping({ policy, outputRoot, roots, inputs: spec });
  const rebuilt = buildSnapshot(mapping, snapshot.exclusions);

  const declaration = snapshot.declared.map((row) => ({ role: row.role, rootPath: row.rootPath, path: row.path, kind: row.kind }));
  if (JSON.stringify(declaration) !== JSON.stringify(rebuilt.declared)) throw Error('R36A_DECLARED_MISMATCH');

  const recorded = new Map(snapshot.entries.map((row) => [`${row.role}\u0000${row.path}`, row]));
  for (const row of rebuilt.entries) {
    const key = `${row.role}\u0000${row.path}`;
    const previous = recorded.get(key);
    if (!previous) throw Error(`R36A_ENTRY_ADDED:${row.role}/${row.path}`);
    if (previous.sha256 !== row.sha256 || previous.size !== row.size) throw Error(`R36A_ENTRY_MISMATCH:${row.role}/${row.path}`);
    recorded.delete(key);
  }
  for (const key of recorded.keys()) throw Error(`R36A_ENTRY_MISSING:${key.split('\u0000')[1]}`);

  if (rebuilt.combinedSha256 !== snapshot.combinedSha256) throw Error('R36A_DIGEST_MISMATCH');

  return Object.freeze({
    ok: true,
    schema: SNAPSHOT_SCHEMA,
    version: SNAPSHOT_VERSION,
    declared: rebuilt.declared.length,
    entries: rebuilt.entries.length,
    exclusions: rebuilt.exclusions.length,
    combinedSha256: rebuilt.combinedSha256,
    claims: CLAIMS,
    establishes: Object.freeze(['inputsConsistentWithSnapshot']),
    doesNotEstablish: Object.freeze([
      'gitOrigin', 'authorship', 'review', 'ciExecution', 'approval', 'publicationAuthority', 'buildArtifact'
    ]),
    limitations: SNAPSHOT_LIMITATIONS
  });
}



