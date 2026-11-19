// C3-R26 — recovery contract tests. Temporary directories only; no library, Cloudflare or production
// file is ever used as a fixture. Run with: node --test tests/c3-recovery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  STAGING_LIBRARY_TARGETS, sha, journalFile, lockFile,
  recoverLibraryPair, assertTargetsApproved, assertTestHookAllowed, syncFile, syncExisting,
} from '../infrastructure/c3/library/library-pair-recovery.mjs';

const APPROVED = ['specs/asset-library.json', 'specs/extra-target.json'];
const NONCE = 'a1b2c3d4e5f60718';

function makeRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-r26-'));
  fs.mkdirSync(path.join(root, 'specs'), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeJournal(root, entries, nonce = NONCE) {
  fs.writeFileSync(journalFile(root), JSON.stringify({ version: 1, nonce, entries }));
}

function seedTarget(root, relative, oldContent, newContent) {
  const destination = path.join(root, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, oldContent);
  fs.writeFileSync(destination + '.r16-backup-' + NONCE, oldContent);
  fs.writeFileSync(destination + '.r16-new-' + NONCE, newContent);
  return { destination, oldSha: sha(Buffer.from(oldContent)), newSha: sha(Buffer.from(newContent)) };
}

test('NODE_TEST_CONTEXT is present under the test runner (the hook gate depends on it)', () => {
  assert.equal(typeof process.env.NODE_TEST_CONTEXT, 'string');
  assert.ok(process.env.NODE_TEST_CONTEXT.length > 0);
});

test('valid journal restores the pair and clears journal, lock, backups and staged files', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  const b = seedTarget(root, APPROVED[1], 'old-b', 'new-b');
  writeJournal(root, [
    { relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha },
    { relative: APPROVED[1], existed: true, oldSha: b.oldSha, newSha: b.newSha },
  ]);
  fs.writeFileSync(lockFile(root), 'lock');

  const result = recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED, allowStaleLock: true });

  assert.equal(result.recovered, true);
  assert.deepEqual(result.restored.sort(), [...APPROVED].sort());
  assert.equal(fs.readFileSync(a.destination, 'utf8'), 'old-a');
  assert.equal(fs.readFileSync(b.destination, 'utf8'), 'old-b');
  assert.equal(fs.existsSync(journalFile(root)), false);
  assert.equal(fs.existsSync(lockFile(root)), false);
  for (const p of [a.destination, b.destination]) {
    assert.equal(fs.existsSync(p + '.r16-backup-' + NONCE), false);
    assert.equal(fs.existsSync(p + '.r16-new-' + NONCE), false);
  }
});

test('destination that did not previously exist is removed on recovery', (t) => {
  const root = makeRoot(t);
  const dest = path.join(root, APPROVED[0]);
  const newSha = sha(Buffer.from('created-by-interrupted-write'));
  fs.writeFileSync(dest, 'created-by-interrupted-write');
  writeJournal(root, [{ relative: APPROVED[0], existed: false, oldSha: null, newSha }]);

  const result = recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED });

  assert.equal(result.recovered, true);
  assert.equal(fs.existsSync(dest), false);
});

test('missing journal returns NO_JOURNAL and does not touch an existing lock', (t) => {
  const root = makeRoot(t);
  fs.writeFileSync(lockFile(root), 'orphan-lock');

  const result = recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED });

  assert.deepEqual(result, { recovered: false, reason: 'NO_JOURNAL' });
  assert.equal(fs.existsSync(lockFile(root)), true, 'orphan-lock recovery belongs to R20A, not this module');
});

for (const [label, contents] of [
  ['not JSON', 'this is not json'],
  ['wrong version', JSON.stringify({ version: 2, nonce: NONCE, entries: [] })],
  ['nonce not 16 hex', JSON.stringify({ version: 1, nonce: 'xyz', entries: [{ relative: APPROVED[0], existed: false, oldSha: null, newSha: sha(Buffer.from('x')) }] })],
  ['entries empty', JSON.stringify({ version: 1, nonce: NONCE, entries: [] })],
  ['entries more than two', JSON.stringify({ version: 1, nonce: NONCE, entries: [1, 2, 3].map(() => ({ relative: APPROVED[0], existed: false, oldSha: null, newSha: sha(Buffer.from('x')) })) })],
  ['newSha not a hash', JSON.stringify({ version: 1, nonce: NONCE, entries: [{ relative: APPROVED[0], existed: false, oldSha: null, newSha: 'nope' }] })],
  ['existed true without oldSha', JSON.stringify({ version: 1, nonce: NONCE, entries: [{ relative: APPROVED[0], existed: true, oldSha: null, newSha: sha(Buffer.from('x')) }] })],
  ['existed false with oldSha', JSON.stringify({ version: 1, nonce: NONCE, entries: [{ relative: APPROVED[0], existed: false, oldSha: sha(Buffer.from('x')), newSha: sha(Buffer.from('x')) }] })],
  ['existed is not boolean', JSON.stringify({ version: 1, nonce: NONCE, entries: [{ relative: APPROVED[0], existed: 'yes', oldSha: null, newSha: sha(Buffer.from('x')) }] })],
]) {
  test(`malformed journal rejected: ${label}`, (t) => {
    const root = makeRoot(t);
    fs.writeFileSync(journalFile(root), contents);
    assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_JOURNAL_INVALID/);
  });
}

test('duplicate entry for the same target is rejected', (t) => {
  const root = makeRoot(t);
  const entry = { relative: APPROVED[0], existed: false, oldSha: null, newSha: sha(Buffer.from('x')) };
  writeJournal(root, [entry, { ...entry }]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_JOURNAL_INVALID/);
});

test('realpath escape through a linked parent directory is refused', (t) => {
  const root = makeRoot(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'c3-r26-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'asset-library.json'), 'outside-content');
  try {
    // A junction needs no administrator rights on Windows; symlink is used on POSIX.
    fs.symlinkSync(outside, path.join(root, 'inner'), 'junction');
  } catch {
    t.skip('platform cannot create a directory link for this test');
    return;
  }
  const rel = 'inner/asset-library.json';
  writeJournal(root, [{ relative: rel, existed: false, oldSha: null, newSha: sha(Buffer.from('x')) }]);
  assert.throws(
    () => recoverLibraryPair({ rootDir: root, allowedTargets: [rel] }),
    /R17_PATH_ESCAPE/,
    'a target whose parent resolves outside the root must not be restorable',
  );
});

test('symlink destination is refused', (t) => {
  const root = makeRoot(t);
  const realFile = path.join(root, 'specs', 'real.json');
  fs.writeFileSync(realFile, 'old');
  try {
    fs.symlinkSync(realFile, path.join(root, APPROVED[0]), 'file');
  } catch {
    t.skip('platform requires elevated rights to create file symlinks');
    return;
  }
  writeJournal(root, [{ relative: APPROVED[0], existed: false, oldSha: null, newSha: sha(Buffer.from('x')) }]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_TARGET_SYMLINK/);
});

test('destination drift (content matching neither hash) is refused', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  fs.writeFileSync(a.destination, 'someone-else-edited-this');
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_DESTINATION_DRIFT/);
});

test('backup that does not match oldSha is refused', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  fs.writeFileSync(a.destination + '.r16-backup-' + NONCE, 'tampered-backup');
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_BACKUP_INVALID/);
});

test('stale lock is refused without explicit authorization and allowed with it', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);
  fs.writeFileSync(lockFile(root), 'stale');

  assert.throws(
    () => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }),
    /R17_EXPLICIT_STALE_LOCK_OVERRIDE_REQUIRED/,
  );
  assert.equal(fs.existsSync(journalFile(root)), true, 'refusal must not consume the journal');

  const result = recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED, allowStaleLock: true });
  assert.equal(result.recovered, true);
  assert.equal(fs.readFileSync(a.destination, 'utf8'), 'old-a');
});

for (const [label, targets] of [
  ['absent', undefined],
  ['null', null],
  ['empty array', []],
  ['not an array', 'specs/asset-library.json'],
  ['absolute POSIX path', ['/etc/passwd']],
  ['absolute Windows path', ['C:\\Windows\\system32\\config']],
  ['parent traversal', ['specs/../../escape.json']],
  ['duplicate entries', ['specs/asset-library.json', 'specs/asset-library.json']],
  ['empty string entry', ['']],
]) {
  test(`target allow-list refused: ${label}`, () => {
    assert.throws(() => assertTargetsApproved(targets), /R17_TARGETS_NOT_APPROVED/);
  });
}

test('approved list is frozen so a caller cannot widen it after approval', () => {
  assert.equal(Object.isFrozen(assertTargetsApproved(APPROVED)), true);
});

test('recovery without an explicit allow-list fails closed even for a staging target', (t) => {
  const root = makeRoot(t);
  writeJournal(root, [
    { relative: STAGING_LIBRARY_TARGETS[1], existed: false, oldSha: null, newSha: sha(Buffer.from('x')) },
  ]);
  assert.throws(
    () => recoverLibraryPair({ rootDir: root }),
    /R17_TARGETS_NOT_APPROVED/,
    'the staging list must never act as an implicit default',
  );
});

test('unapproved target in the journal is refused even when a list is supplied', (t) => {
  const root = makeRoot(t);
  writeJournal(root, [
    { relative: 'specs/not-approved.json', existed: false, oldSha: null, newSha: sha(Buffer.from('x')) },
  ]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_JOURNAL_INVALID/);
});

test('partially completed recovery: backup already removed and destination at oldSha still recovers', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  fs.rmSync(a.destination + '.r16-backup-' + NONCE);
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);

  const result = recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED });

  assert.equal(result.recovered, true);
  assert.equal(fs.readFileSync(a.destination, 'utf8'), 'old-a');
});

test('partially completed recovery: backup gone and destination already at newSha is refused', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  fs.writeFileSync(a.destination, 'new-a');
  fs.rmSync(a.destination + '.r16-backup-' + NONCE);
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);
  assert.throws(() => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }), /R17_BACKUP_INVALID/);
});

test('recovery is idempotent: a second run reports NO_JOURNAL and changes nothing', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);

  assert.equal(recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }).recovered, true);
  const afterFirst = fs.readFileSync(a.destination, 'utf8');
  assert.deepEqual(
    recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED }),
    { recovered: false, reason: 'NO_JOURNAL' },
  );
  assert.equal(fs.readFileSync(a.destination, 'utf8'), afterFirst);
});

test('test hook requires explicit opt-in at the call site', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  writeJournal(root, [{ relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha }]);
  assert.throws(
    () => recoverLibraryPair({ rootDir: root, allowedTargets: APPROVED, onRestored: () => {} }),
    /R17_TEST_HOOK_FORBIDDEN/,
  );
});

test('test hook is refused when the test-runner context is absent, even with opt-in', () => {
  const saved = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.throws(
      () => assertTestHookAllowed({ onRestored: () => {}, allowTestHooks: true }),
      /R17_TEST_HOOK_FORBIDDEN/,
    );
  } finally {
    process.env.NODE_TEST_CONTEXT = saved;
  }
});

test('test hook rejects a non-function value', () => {
  assert.throws(
    () => assertTestHookAllowed({ onRestored: 'not-a-function', allowTestHooks: true }),
    /R17_TEST_HOOK_INVALID/,
  );
});

test('authorized hook fires once per restored entry', (t) => {
  const root = makeRoot(t);
  const a = seedTarget(root, APPROVED[0], 'old-a', 'new-a');
  const b = seedTarget(root, APPROVED[1], 'old-b', 'new-b');
  writeJournal(root, [
    { relative: APPROVED[0], existed: true, oldSha: a.oldSha, newSha: a.newSha },
    { relative: APPROVED[1], existed: true, oldSha: b.oldSha, newSha: b.newSha },
  ]);
  const seen = [];
  const result = recoverLibraryPair({
    rootDir: root,
    allowedTargets: APPROVED,
    allowTestHooks: true,
    onRestored: (rel) => seen.push(rel),
  });
  assert.equal(result.recovered, true);
  assert.deepEqual(seen.sort(), [...APPROVED].sort());
});

test('durability helper creates exclusively and rejects an existing file', (t) => {
  const root = makeRoot(t);
  const file = path.join(root, 'specs', 'created.json');
  syncFile(file, 'written');
  assert.equal(fs.readFileSync(file, 'utf8'), 'written');
  assert.throws(() => syncFile(file, 'again'), /EEXIST/);
  syncExisting(file);
});
