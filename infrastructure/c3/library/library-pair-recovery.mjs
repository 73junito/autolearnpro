// C3-R26: isolated port of the C3-R17/R20A library-pair recovery contract.
//
// SOURCE BASELINE (reviewed, unmodified): lib/assets/library-pair-recovery.mjs
//   sha256 eb9bac60dfb23d630888538484ee01e0711be2d76ab1d441740e7ffa17336e3c
//   4030 bytes / 72 lines, in F:\autolearnpro-meshy-staging
//
// This file is a deliberate adaptation, not a copy. Each change is marked "R26 ADAPTATION" below and
// documented in docs/c3-r26/C3-R26-RECOVERY-PORT.md.
//
// NODE-ONLY. Never import this from infrastructure/cloudflare/worker.mjs, a request handler, or a route:
// it opens, fsyncs and deletes files, which a Worker runtime cannot and must not do.
//
// SCOPE: this module does not recover a journal-free orphan lock. With no journal it returns
// {recovered:false,reason:'NO_JOURNAL'} before touching the lock. That behaviour belongs to the separate
// R20A contract and is not claimed here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const JOURNAL_NAME = '.c3-r17-library-journal.json';
export const LOCK_NAME = '.c3-r16-library-write.lock';

// R26 ADAPTATION 1 — the staging allow-list is kept as provenance, never as a default.
// Those two paths do not exist in the authoritative repository (`specs/` and `cloudflare/api/src/` are
// absent), so using them as a default would key the authorization boundary to paths that never exist.
// Callers must supply an approved list; there is no implicit fallback.
export const STAGING_LIBRARY_TARGETS = Object.freeze([
  'specs/asset-library.json',
  'cloudflare/api/src/asset-library.generated.js',
]);

export const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const journalFile = (root) => path.join(root, 'specs', JOURNAL_NAME);
export const lockFile = (root) => path.join(root, 'specs', LOCK_NAME);
const validHash = (x) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const within = (root, child) => child.toLowerCase().startsWith((root + path.sep).toLowerCase());

// R26 ADAPTATION 2 — explicit, fail-closed target authorization.
// Rejects: absent/empty/non-array, non-string, absolute POSIX or Windows paths, any '..' segment,
// duplicates after backslash normalisation. Returns a frozen list so a caller cannot mutate it later.
export function assertTargetsApproved(targets) {
  if (!Array.isArray(targets) || targets.length === 0) throw Error('R17_TARGETS_NOT_APPROVED');
  const seen = new Set();
  for (const target of targets) {
    if (typeof target !== 'string' || target.length === 0) throw Error('R17_TARGETS_NOT_APPROVED');
    const posix = target.replaceAll('\\', '/');
    if (posix.startsWith('/')) throw Error('R17_TARGETS_NOT_APPROVED');
    if (/^[a-zA-Z]:/.test(posix)) throw Error('R17_TARGETS_NOT_APPROVED');
    if (posix.split('/').includes('..')) throw Error('R17_TARGETS_NOT_APPROVED');
    if (seen.has(posix)) throw Error('R17_TARGETS_NOT_APPROVED');
    seen.add(posix);
  }
  return Object.freeze([...seen]);
}

// R26 ADAPTATION 3 — the test hook requires explicit intent AND a test-runner context.
// The environment variable is a heuristic, not a hard security boundary; it raises the cost of accidental
// production use and makes the intent visible at the call site. Two gates, both must pass.
export function assertTestHookAllowed({ onRestored, allowTestHooks }) {
  if (onRestored === null || onRestored === undefined) return;
  if (typeof onRestored !== 'function') throw Error('R17_TEST_HOOK_INVALID');
  if (allowTestHooks !== true) throw Error('R17_TEST_HOOK_FORBIDDEN');
  if (!process.env.NODE_TEST_CONTEXT) throw Error('R17_TEST_HOOK_FORBIDDEN');
}

// Unchanged from the source: exclusive create at 0600, then fsync the data before releasing the handle.
export function syncFile(file, data) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Unchanged from the source. Windows requires a write-capable handle for fsyncSync on many filesystems.
export function syncExisting(file) {
  const fd = fs.openSync(file, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function recoverLibraryPair({ rootDir, allowedTargets, allowStaleLock = false, onRestored = null, allowTestHooks = false } = {}) {
  if (typeof rootDir !== 'string') throw Error('R17_ROOT_REQUIRED');
  // Both gates run before any filesystem read, so an unauthorized call cannot even observe state.
  const allowedList = assertTargetsApproved(allowedTargets);
  assertTestHookAllowed({ onRestored, allowTestHooks });
  const allowed = new Set(allowedList);
  const root = fs.realpathSync(rootDir), journal = journalFile(root), lock = lockFile(root);
  if (!fs.existsSync(journal)) return { recovered: false, reason: 'NO_JOURNAL' };
  if (fs.existsSync(lock) && allowStaleLock !== true) throw Error('R17_EXPLICIT_STALE_LOCK_OVERRIDE_REQUIRED');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(journal, 'utf8'));
  } catch {
    throw Error('R17_JOURNAL_INVALID');
  }
  if (state?.version !== 1 || !/^[a-f0-9]{16}$/.test(state.nonce) || !Array.isArray(state.entries)
    || state.entries.length < 1 || state.entries.length > 2) throw Error('R17_JOURNAL_INVALID');
  const names = new Set(), actions = [];
  for (const entry of state.entries) {
    if (!allowed.has(entry.relative) || names.has(entry.relative) || typeof entry.existed !== 'boolean'
      || (entry.existed && !validHash(entry.oldSha)) || (!entry.existed && entry.oldSha !== null)
      || !validHash(entry.newSha)) throw Error('R17_JOURNAL_INVALID');
    names.add(entry.relative);
    const destination = path.join(root, entry.relative), parent = fs.realpathSync(path.dirname(destination));
    if (!within(root, parent)) throw Error('R17_PATH_ESCAPE');
    const backup = destination + '.r16-backup-' + state.nonce;
    const staged = destination + '.r16-new-' + state.nonce;
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw Error('R17_TARGET_SYMLINK');
    const current = fs.existsSync(destination) ? sha(fs.readFileSync(destination)) : null;
    if (current !== entry.oldSha && current !== entry.newSha) throw Error('R17_DESTINATION_DRIFT');
    if (entry.existed) {
      // After a previous recovery restored this entry, cleanup may already have removed
      // its backup. Only permit that state when the destination is exactly the old hash.
      if (fs.existsSync(backup)) {
        if (sha(fs.readFileSync(backup)) !== entry.oldSha) throw Error('R17_BACKUP_INVALID');
      } else if (current !== entry.oldSha) throw Error('R17_BACKUP_INVALID');
    }
    actions.push({ entry, destination, backup, staged });
  }
  // Validation above is complete before mutating any destination.
  for (const a of actions) {
    if (a.entry.existed && fs.existsSync(a.backup)) fs.copyFileSync(a.backup, a.destination);
    else if (!a.entry.existed) fs.rmSync(a.destination, { force: true });
    if (a.entry.existed) syncExisting(a.destination);
    // Test harness uses this hook to terminate a child after a verified restore.
    // Gated by assertTestHookAllowed above; unreachable from the operational CLI.
    if (typeof onRestored === 'function') onRestored(a.entry.relative);
  }
  for (const a of actions) {
    fs.rmSync(a.staged, { force: true });
    fs.rmSync(a.backup, { force: true });
  }
  fs.rmSync(journal, { force: true });
  if (fs.existsSync(lock)) fs.rmSync(lock, { force: true });
  return { recovered: true, restored: actions.map((a) => a.entry.relative) };
}
