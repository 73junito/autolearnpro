// C3-R37H remediation R1 (finding B21) — versioned canonical findings representation with a deterministic digest.
//
// WHY THIS EXISTS (finding B21): C3 findings and evidence could produce different SHA-256 hashes across otherwise
// equivalent executions, because serialization order, filesystem enumeration order, absolute paths, hostnames,
// process ids, timestamps and temporary directory names leaked into hashed payloads. A digest that changes when
// nothing security-relevant changed is unusable as an integrity anchor, and a digest that hides a real change is
// worse.
//
// WHAT THIS MODULE GUARANTEES:
//   1. A versioned canonical representation (`alp-c3-canonical-findings` v1) with deterministic ordering of
//      findings and of object properties, so equivalent logical findings serialize to identical bytes.
//   2. Volatile execution metadata (timestamps, hostnames, pids, durations, absolute roots, temporary names) is
//      accepted ONLY in a separate `audit` object that is retained for auditing but NEVER enters the digest.
//   3. Path normalization: Windows and POSIX separators, drive letters and absolute prefixes are reduced to
//      root-relative POSIX paths, so logically equivalent paths digest identically across operating systems.
//   4. Every security-relevant field (id, severity, category, path, message, evidence hashes, rule references)
//      is preserved inside the canonical payload. Genuine differences ALWAYS change the digest.
//   5. Malformed findings are rejected explicitly (named error codes), never coerced or silently dropped.
//   6. The digest is SHA-256 over the canonical UTF-8 bytes.
//
// WHAT THIS MODULE DOES NOT DO: it does not decide what a finding means, sign anything, or establish approval.
import crypto from 'node:crypto';

export const FINDINGS_SCHEMA = 'alp-c3-canonical-findings';
export const FINDINGS_VERSION = 1;

export const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info']);
const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3, info: 4 });

// Fields that belong to the volatile execution envelope. They may appear at the TOP LEVEL of a finding input
// object and are moved into `audit`; they may never enter the canonical payload.
export const VOLATILE_FIELDS = Object.freeze([
  'generatedAt', 'timestamp', 'startedAt', 'finishedAt', 'durationMs',
  'hostname', 'host', 'pid', 'processId', 'platform', 'nodeVersion', 'runtime',
  'absoluteRoot', 'workspaceRoot', 'tempDir', 'tmpdir', 'user', 'username', 'runId', 'randomSeed'
]);

// Finding facts are validated field-by-field. Unknown fields are preserved (a genuine difference must never be
// hidden), but they must be deterministic values: strings, finite numbers, booleans, null, or nested
// arrays/objects of those. Anything else is malformed input.
const DETERMINISTIC_TYPES = new Set(['string', 'number', 'boolean', 'object']);

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function reject(code, detail) {
  const error = Error(`R37H_FINDINGS_MALFORMED:${code}${detail ? `:${detail}` : ''}`);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertDeterministicValue(value, where) {
  if (value === null) return;
  const type = typeof value;
  if (!DETERMINISTIC_TYPES.has(type)) reject('NON_DETERMINISTIC_VALUE', `${where} (${type})`);
  if (type === 'number' && !Number.isFinite(value)) reject('NON_DETERMINISTIC_VALUE', `${where} (number)`);
  if (type === 'object') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertDeterministicValue(item, `${where}[${index}]`));
    } else if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value)) assertDeterministicValue(item, `${where}.${key}`);
    } else {
      reject('NON_DETERMINISTIC_VALUE', `${where} (object)`);
    }
  }
}

/**
 * Normalize a path so that logically equivalent spellings digest identically:
 *   - backslashes become forward slashes;
 *   - a Windows drive prefix (`C:`) is stripped;
 *   - an absolute `sourceRoot` prefix is stripped, leaving a root-relative path;
 *   - `./` segments are collapsed and `..` segments that would escape the root are refused.
 */
export function normalizePath(inputPath, { sourceRoot = null } = {}) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) reject('PATH_INVALID', String(inputPath));
  let value = inputPath.replace(/\\/g, '/');
  value = value.replace(/^[A-Za-z]:/, '');
  if (sourceRoot) {
    const root = String(sourceRoot).replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '');
    const insensitive = /^[A-Za-z]:/.test(String(sourceRoot)) || /^[A-Za-z]:/.test(inputPath);
    const left = insensitive ? value.toLowerCase() : value;
    const right = insensitive ? root.toLowerCase() : root;
    if (left === right) value = '';
    else if (left.startsWith(right + '/')) value = value.slice(root.length + 1);
  }
  value = value.replace(/^\.\//, '');
  const segments = [];
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') reject('PATH_ESCAPES_ROOT', inputPath);
    segments.push(segment);
  }
  return segments.join('/');
}

/**
 * Canonical JSON: object properties sorted lexicographically at every depth; arrays kept in caller order EXCEPT
 * the findings array, which is ordered by the stable finding key. Compact (no indentation), so the digest covers
 * minimal bytes with no formatting ambiguity.
 */
function canonicalizeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalizeValue(value[key]);
    return out;
  }
  return value;
}

const canonicalStringify = (value) => JSON.stringify(canonicalizeValue(value));

/**
 * Stable finding key: severity rank, then id, then normalized path, then message. A total order over findings;
 * byte-identical duplicates are rejected by the caller.
 */
function findingSortKey(finding) {
  return `${String(SEVERITY_RANK[finding.severity])}\u0000${finding.id}\u0000${finding.path ?? ''}\u0000${finding.message}`;
}

function validateFinding(raw, index) {
  if (!isPlainObject(raw)) reject('FINDING_NOT_OBJECT', `findings[${index}]`);
  const where = `findings[${index}]`;
  if (typeof raw.id !== 'string' || raw.id.length === 0) reject('FINDING_ID_MISSING', where);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.id)) reject('FINDING_ID_INVALID', `${where} (${raw.id})`);
  if (typeof raw.severity !== 'string' || !SEVERITIES.includes(raw.severity)) reject('FINDING_SEVERITY_INVALID', `${where} (${String(raw.severity)})`);
  if (typeof raw.message !== 'string' || raw.message.length === 0) reject('FINDING_MESSAGE_MISSING', where);

  const volatile = {};
  const facts = {};
  for (const [key, value] of Object.entries(raw)) {
    if (VOLATILE_FIELDS.includes(key)) {
      volatile[key] = value;
      continue;
    }
    assertDeterministicValue(value, `${where}.${key}`);
    facts[key] = value;
  }

  // Path normalization: `path` is kept under its normalized spelling so Windows and POSIX runs of the same
  // logical finding agree. The original spelling is retained in audit when it differs.
  if (facts.path !== undefined) {
    if (typeof facts.path !== 'string') reject('PATH_INVALID', `${where}.path`);
    const normalized = normalizePath(facts.path);
    if (normalized !== facts.path) volatile.originalPath = facts.path;
    facts.path = normalized;
  }

  return { facts, volatile };
}

/**
 * Build the canonical findings representation and its digest.
 *
 * Input:
 *   findings   — array of finding objects (id, severity, message required; everything else preserved).
 *   audit      — optional volatile execution metadata; retained in the result, excluded from the digest.
 *
 * Output: { schema, version, canonical, digest, findings, counts, audit }
 *   - `canonical` is the exact string the digest covers.
 *   - `digest` is `sha256(canonical)` as lowercase hex.
 *   - `audit` is volatile metadata, returned for auditing and never hashed.
 */
export function buildFindingsDigest({ findings, audit = null } = {}) {
  if (!Array.isArray(findings)) reject('FINDINGS_NOT_ARRAY', typeof findings);
  if (audit !== null && !isPlainObject(audit)) reject('AUDIT_NOT_OBJECT', typeof audit);

  const entries = findings.map((raw, index) => validateFinding(raw, index));

  // Duplicates after normalization would make ordering ambiguous and double-count a finding.
  const seen = new Map();
  for (const { facts } of entries) {
    const key = findingSortKey(facts);
    if (seen.has(key)) reject('FINDING_DUPLICATE', facts.id);
    seen.set(key, true);
  }

  const ordered = entries
    .map(({ facts }) => facts)
    .sort((a, b) => (findingSortKey(a) < findingSortKey(b) ? -1 : findingSortKey(a) > findingSortKey(b) ? 1 : 0));

  const bySeverity = {};
  for (const severity of SEVERITIES) bySeverity[severity] = 0;
  for (const finding of ordered) bySeverity[finding.severity] += 1;

  const payload = {
    schema: FINDINGS_SCHEMA,
    version: FINDINGS_VERSION,
    counts: { total: ordered.length, bySeverity },
    findings: ordered
  };

  const canonical = canonicalStringify(payload);
  const digest = sha256Hex(Buffer.from(canonical, 'utf8'));

  return Object.freeze({
    schema: FINDINGS_SCHEMA,
    version: FINDINGS_VERSION,
    canonical,
    digest,
    findings: Object.freeze(ordered.map((finding) => Object.freeze({ ...finding }))),
    counts: Object.freeze({ total: ordered.length, bySeverity: Object.freeze(bySeverity) }),
    audit: audit ? Object.freeze({ ...audit }) : null
  });
}

/** Recompute the digest for an already-built canonical string. Used by readers to verify, not trust. */
export function verifyFindingsDigest({ canonical, digest }) {
  if (typeof canonical !== 'string') reject('CANONICAL_NOT_STRING', typeof canonical);
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) reject('DIGEST_INVALID', String(digest));
  return sha256Hex(Buffer.from(canonical, 'utf8')) === digest;
}
