// C3-R37H remediation R3 (finding B26) — run-resource ownership, structured cleanup, and safe recovery.
//
// WHY THIS EXISTS (finding B26): external termination can leave temporary files, locks, worker processes or
// partial evidence behind, because normal cleanup handlers never ran. Broad scavenging (by process name, or by
// temp-file pattern) is dangerous: it removes other people's data. This module gives every test/tool run an
// explicit ownership record instead:
//
//   * a run session is a directory containing `ownership.json` with a versioned schema, a random ownership
//     token, the owning pid, a status marker and the exact list of paths the run created;
//   * `release()` performs structured cleanup: only registered paths, only inside the run directory, symlinks
//     refused, idempotent on repeat;
//   * `recoverStaleRuns()` recovers after interrupted executions using the ownership metadata ONLY — never
//     process-name matching. A session whose owning pid is still alive is left alone; a session whose pid is
//     gone is removed together with exactly its registered paths. Anything not covered by the record — user
//     data, other sessions, files a run never registered — is never touched.
//
// WHAT THIS MODULE DOES NOT DO: it does not kill processes, decide timeouts, or establish approval. A run that
// registered nothing removes nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OWNERSHIP_SCHEMA = 'alp-c3-run-ownership';
export const OWNERSHIP_FILE = 'ownership.json';
const RUN_ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

const fail = (code, detail) => {
  const error = Error(`R37H_RUN_OWNERSHIP:${code}:${detail}`);
  error.code = code;
  throw error;
};

function inside(parent, child) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

function readOwnership(dir) {
  const file = path.join(dir, OWNERSHIP_FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const record = JSON.parse(raw);
    if (record?.schema !== OWNERSHIP_SCHEMA) return null;
    if (typeof record.token !== 'string' || !/^[0-9a-f]{32}$/.test(record.token)) return null;
    if (!Number.isInteger(record.pid) || record.pid <= 0) return null;
    if (!Array.isArray(record.ownedPaths)) return null;
    return record;
  } catch {
    return null;
  }
}

function writeOwnership(dir, record) {
  fs.writeFileSync(path.join(dir, OWNERSHIP_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function pidAlive(pid) {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM'; // exists but not ours: alive
  }
}

/**
 * Create a run session. `rootDir` must already exist and be a real directory; the session directory is
 * created beneath it. Every path the run creates should be registered via `register()`.
 */
export function createRunSession({ rootDir, runId = `run-${crypto.randomBytes(6).toString('hex')}` } = {}) {
  if (typeof runId !== 'string' || !RUN_ID.test(runId)) fail('RUN_ID_INVALID', String(runId));
  let rootStats;
  try {
    rootStats = fs.lstatSync(rootDir);
  } catch {
    fail('ROOT_MISSING', String(rootDir));
  }
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) fail('ROOT_INVALID', String(rootDir));
  const dir = path.join(fs.realpathSync(rootDir), runId);
  if (fs.existsSync(dir)) fail('RUN_DIR_EXISTS', dir);
  fs.mkdirSync(dir);
  const record = {
    schema: OWNERSHIP_SCHEMA,
    runId,
    token: crypto.randomBytes(16).toString('hex'),
    pid: process.pid,
    status: 'active',
    ownedPaths: []
  };
  writeOwnership(dir, record);

  const removeRegistered = () => {
    // Reverse order so files go before their directories; containment and non-symlink checks per path.
    for (const relative of [...record.ownedPaths].reverse()) {
      const target = path.join(dir, relative);
      if (!inside(dir, target)) continue; // a registered path may never escape the run directory
      let stats;
      try {
        stats = fs.lstatSync(target);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) continue; // a link is not ours to follow or remove
      fs.rmSync(target, { recursive: true, force: true });
    }
  };

  return {
    dir,
    runId,
    token: record.token,
    register(target) {
      const absolute = path.resolve(target);
      if (!inside(dir, absolute)) fail('REGISTER_OUTSIDE_RUN_DIR', absolute);
      const relative = path.relative(dir, absolute);
      if (!record.ownedPaths.includes(relative)) {
        record.ownedPaths.push(relative);
        record.ownedPaths.sort();
        writeOwnership(dir, record);
      }
      return Object.freeze({ registered: relative });
    },
    release() {
      // Idempotent: a second release finds nothing and reports the same empty state.
      const current = readOwnership(dir);
      if (!current) return Object.freeze({ released: true, removedPaths: [], alreadyGone: true });
      removeRegistered();
      fs.rmSync(path.join(dir, OWNERSHIP_FILE), { force: true });
      try {
        fs.rmdirSync(dir); // only succeeds when empty: unregistered content blocks deletion instead of vanishing
      } catch { /* non-empty: something unregistered is present, which is not ours to delete */ }
      return Object.freeze({ released: true, removedPaths: current.ownedPaths, alreadyGone: false });
    }
  };
}

/**
 * Recover runs that were terminated without cleanup. Decisions come from ownership metadata and pid liveness
 * only. Idempotent; conservative: anything uncertain is preserved and reported, never removed.
 */
export function recoverStaleRuns({ rootDir } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    fail('ROOT_MISSING', String(rootDir));
  }
  const records = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(rootDir, entry.name);
    const ownership = readOwnership(dir);
    if (!ownership) {
      // Not a run directory (or an unreadable one): not ours. Preserve and report.
      if (fs.existsSync(path.join(dir, OWNERSHIP_FILE))) {
        records.push(Object.freeze({ runId: entry.name, action: 'preserved-unreadable-ownership', dir }));
      }
      continue;
    }
    if (ownership.pid === process.pid || pidAlive(ownership.pid)) {
      records.push(Object.freeze({ runId: ownership.runId, action: 'preserved-active', pid: ownership.pid }));
      continue;
    }
    const removed = [];
    const preserved = [];
    for (const relative of [...ownership.ownedPaths].reverse()) {
      const target = path.join(dir, relative);
      if (!inside(dir, target)) {
        preserved.push({ path: relative, reason: 'escapes-run-directory' });
        continue;
      }
      let stats;
      try {
        stats = fs.lstatSync(target);
      } catch {
        continue;
      }
      if (stats.isSymbolicLink()) {
        preserved.push({ path: relative, reason: 'symlink-not-owned' });
        continue;
      }
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(relative);
    }
    fs.rmSync(path.join(dir, OWNERSHIP_FILE), { force: true });
    let dirRemoved = false;
    try {
      fs.rmdirSync(dir);
      dirRemoved = true;
    } catch { /* unregistered content remains; the directory is preserved with it */ }
    records.push(Object.freeze({ runId: ownership.runId, action: 'recovered', pid: ownership.pid, removedPaths: removed, preserved, dirRemoved }));
  }
  return Object.freeze({ records });
}
