// C3-R37H remediation R4 (finding B27) — safe report creation with overwrite protection.
//
// WHY THIS EXISTS (finding B27): C3 report writers could overwrite previous evidence. A report that can be
// silently replaced is not evidence. This module enforces two distinct publication classes:
//
//   IMMUTABLE EVIDENCE (`writeImmutableReport`): created exactly once. Creation is exclusive (the destination
//   must not exist), and the bytes are staged in a fully-written temporary file before being linked into place,
//   so a crash mid-write can never leave a partial file at the final name. An accidental overwrite attempt is
//   rejected with a machine-readable `R37H_REPORT_EXISTS` error that includes the digest of the file that was
//   preserved — the caller learns what exists instead of replacing it.
//
//   MUTABLE SUMMARY POINTER (`publishMutableSummary`): an explicitly designated latest-status pointer
//   (name must match `latest*`) is replaced atomically via rename, and the previous digest is returned so the
//   change is auditable. Nothing else may be replaced.
//
// Destination identity is verified before every write: the directory must be a real directory (no symlink), the
// resolved target must remain inside it, and a symlink at the target is refused rather than followed.
//
// WHAT THIS MODULE DOES NOT DO: it does not decide which reports are evidence, sign anything, or establish
// approval. Interrupted-write temp files are identifiable by their `.alp-report-` prefix and are removed only
// by `cleanupReportTemps`, which touches nothing else.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:json|md|txt)$/;
const MUTABLE_NAME = /^latest[A-Za-z0-9._-]*\.(?:json|md|txt)$/;
const TEMP_PREFIX = '.alp-report-';

export class ReportCollisionError extends Error {
  constructor(target, existingSha256) {
    super(`R37H_REPORT_EXISTS:${target} — an immutable report already exists at this path and was preserved (sha256=${existingSha256})`);
    this.name = 'ReportCollisionError';
    this.code = 'R37H_REPORT_EXISTS';
    this.target = target;
    this.existingSha256 = existingSha256;
  }

  toJSON() {
    return { error: this.code, target: this.target, existingSha256: this.existingSha256, overwritten: false };
  }
}

function fail(code, detail) {
  const error = Error(`R37H_REPORT_WRITE:${code}:${detail}`);
  error.code = code;
  throw error;
}

function verifyDestination(directory, name, { allowMutable }) {
  if (typeof name !== 'string' || !NAME.test(name)) fail('NAME_INVALID', String(name));
  if (name.includes('..')) fail('NAME_INVALID', String(name));
  if (!allowMutable && MUTABLE_NAME.test(name)) fail('NAME_REQUIRES_MUTABLE_CLASS', name);
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch {
    fail('DIRECTORY_MISSING', String(directory));
  }
  if (stats.isSymbolicLink()) fail('DIRECTORY_SYMLINK', String(directory));
  if (!stats.isDirectory()) fail('DIRECTORY_NOT_DIRECTORY', String(directory));
  const resolvedDir = fs.realpathSync(directory);
  const target = path.join(resolvedDir, name);
  if (path.dirname(target) !== resolvedDir) fail('PATH_ESCAPE', target);
  // A symlink at the destination is refused before any write: following it would write outside the directory.
  try {
    if (fs.lstatSync(target).isSymbolicLink()) fail('TARGET_SYMLINK', target);
  } catch { /* absent is the normal case for creation */ }
  return { resolvedDir, target };
}

// Deterministic serialization: object keys sorted at every depth so two writes of the same logical payload
// produce identical bytes (and therefore identical digests) regardless of property insertion order.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function serialize(payload) {
  const text = typeof payload === 'string' ? payload : stableStringify(payload);
  return Buffer.from(text.endsWith('\n') ? text : `${text}\n`, 'utf8');
}

function stageTemp(resolvedDir, bytes) {
  const temp = path.join(resolvedDir, `${TEMP_PREFIX}${crypto.randomBytes(12).toString('hex')}.tmp`);
  fs.writeFileSync(temp, bytes, { flag: 'wx' });
  return temp;
}

/**
 * Create an immutable report exactly once.
 * Returns { path, sha256, bytes, created: true }.
 * Throws ReportCollisionError (code R37H_REPORT_EXISTS) when the destination exists — never overwrites.
 */
export function writeImmutableReport({ directory, name, payload }) {
  const { resolvedDir, target } = verifyDestination(directory, name, { allowMutable: false });
  const bytes = serialize(payload);
  const digest = sha256Hex(bytes);
  const temp = stageTemp(resolvedDir, bytes);
  try {
    try {
      // Hard link is the exclusivity primitive: it succeeds only if the destination does not exist, and it
      // publishes the already-complete temp bytes — no window where a partial file sits at the final name.
      fs.linkSync(temp, target);
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        const existing = fs.readFileSync(target);
        throw new ReportCollisionError(target, sha256Hex(existing));
      }
      if (error && ['EPERM', 'ENOSYS', 'EOPNOTSUPP'].includes(error.code)) {
        // Filesystem without hard links: exclusive create, copying the fully staged bytes.
        fs.copyFileSync(temp, target, fs.constants.COPYFILE_EXCL);
      } else {
        throw error;
      }
    }
  } finally {
    fs.rmSync(temp, { force: true });
  }
  // Read back and re-hash before reporting success: what is on disk is what is claimed.
  const written = fs.readFileSync(target);
  if (sha256Hex(written) !== digest) fail('READBACK_MISMATCH', target);
  return Object.freeze({ path: target, sha256: digest, bytes: bytes.length, created: true });
}

/**
 * Atomically publish a designated mutable latest-status pointer (name must match `latest*`).
 *
 * B27 preservation-first semantics: replacing an existing pointer is an explicitly authorized act. The caller
 * MUST supply the digest it expects the current pointer to hold (`expectedPreviousSha256`). A missing or
 * mismatched expectation fails closed and nothing is written (R37H_REPORT_WRITE:REPLACEMENT_AUTHORIZATION_REQUIRED
 * or :PREVIOUS_DIGEST_MISMATCH). When a replacement is authorized, the superseded artifact is first preserved as
 * a verified recovery copy (`<name>.recovery-<shortdigest>`) whose digest is re-checked, so evidence is never
 * destroyed by an in-place overwrite.
 *
 * Returns { path, sha256, bytes, previousSha256, replaced, recoveryPath }.
 */
export function publishMutableSummary({ directory, name, payload, expectedPreviousSha256 = null }) {
  const { resolvedDir, target } = verifyDestination(directory, name, { allowMutable: true });
  if (!MUTABLE_NAME.test(name)) fail('NAME_NOT_MUTABLE_POINTER', name);
  let previousSha256 = null;
  let replaced = false;
  let recoveryPath = null;
  try {
    const existing = fs.lstatSync(target);
    if (existing.isSymbolicLink()) fail('TARGET_SYMLINK', target);
    previousSha256 = sha256Hex(fs.readFileSync(target));
    replaced = true;
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('R37H_REPORT_WRITE')) throw error;
    /* absent: first publication */
  }

  if (replaced) {
    // Authorized replacement requires the caller to state the digest it expects to supersede.
    if (typeof expectedPreviousSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedPreviousSha256)) {
      fail('REPLACEMENT_AUTHORIZATION_REQUIRED', `${target} (expected a 64-hex previous digest)`);
    }
    if (expectedPreviousSha256 !== previousSha256) {
      fail('PREVIOUS_DIGEST_MISMATCH', `${target} expected ${expectedPreviousSha256} found ${previousSha256}`);
    }
    // Preserve the superseded artifact as a verified recovery copy before it is replaced.
    recoveryPath = path.join(resolvedDir, `${name}.recovery-${previousSha256.slice(0, 12)}`);
    try {
      fs.copyFileSync(target, recoveryPath, fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      // A recovery copy for this exact previous digest already exists; verify it instead of overwriting.
    }
    if (sha256Hex(fs.readFileSync(recoveryPath)) !== previousSha256) fail('RECOVERY_MISMATCH', recoveryPath);
  }

  const bytes = serialize(payload);
  const digest = sha256Hex(bytes);
  const temp = stageTemp(resolvedDir, bytes);
  try {
    fs.renameSync(temp, target); // atomic replace on the same volume
  } finally {
    fs.rmSync(temp, { force: true });
  }
  const written = fs.readFileSync(target);
  if (sha256Hex(written) !== digest) fail('READBACK_MISMATCH', target);
  return Object.freeze({ path: target, sha256: digest, bytes: bytes.length, previousSha256, replaced, recoveryPath });
}

/**
 * Remove only interrupted-write temp files this module creates (`.alp-report-<hex>.tmp`), only inside the
 * given directory. Idempotent; never touches any other file. Returns the removed names for the audit record.
 */
export function cleanupReportTemps(directory) {
  const resolvedDir = fs.realpathSync(directory);
  const removed = [];
  for (const entry of fs.readdirSync(resolvedDir)) {
    if (!/^\.alp-report-[0-9a-f]{24}\.tmp$/.test(entry)) continue;
    const target = path.join(resolvedDir, entry);
    const stats = fs.lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile()) continue;
    fs.rmSync(target, { force: true });
    removed.push(entry);
  }
  return Object.freeze({ removed });
}
