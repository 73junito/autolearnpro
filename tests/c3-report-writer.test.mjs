// C3-R37H remediation R4 (finding B27) — report overwrite protection tests.
//
// Acceptance cases required by the remediation directive:
//   - fresh report creation
//   - existing report collision
//   - concurrent writers
//   - interrupted write
//   - partial output
//   - report name collision
//   - evidence integrity after failed write
//   - authorized update of a mutable summary pointer
//
// Run with: node --test tests/c3-report-writer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  writeImmutableReport,
  publishMutableSummary,
  cleanupReportTemps,
  ReportCollisionError
} from '../infrastructure/c3/build/report-writer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.join(here, '..', 'infrastructure', 'c3', 'build', 'report-writer.mjs');
const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const freshDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alp-report-test-'));

test('1. fresh report creation writes complete, hashed bytes', () => {
  const dir = freshDir();
  const result = writeImmutableReport({ directory: dir, name: 'run-001.json', payload: { status: 'pass', findings: [] } });
  const bytes = fs.readFileSync(result.path);
  assert.equal(sha256Hex(bytes), result.sha256);
  assert.equal(result.bytes, bytes.length);
  assert.deepEqual(JSON.parse(bytes.toString('utf8')), { findings: [], status: 'pass' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('2. an existing report is never overwritten — machine-readable collision error', () => {
  const dir = freshDir();
  const first = writeImmutableReport({ directory: dir, name: 'evidence.json', payload: { v: 1 } });
  const before = fs.readFileSync(first.path);
  let caught = null;
  try {
    writeImmutableReport({ directory: dir, name: 'evidence.json', payload: { v: 2 } });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ReportCollisionError);
  assert.equal(caught.code, 'R37H_REPORT_EXISTS');
  const machine = caught.toJSON();
  assert.equal(machine.error, 'R37H_REPORT_EXISTS');
  assert.equal(machine.overwritten, false);
  assert.equal(machine.existingSha256, sha256Hex(before));
  // Evidence integrity after failed write: the preserved bytes are untouched and no temp file remains.
  assert.deepEqual(fs.readFileSync(first.path), before);
  assert.deepEqual(fs.readdirSync(dir), ['evidence.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('3. concurrent writers: exactly one wins, the evidence is complete and intact', async () => {
  const dir = freshDir();
  const helper = path.join(dir, 'writer-child.mjs');
  fs.writeFileSync(helper, [
    "const { pathToFileURL } = await import('node:url');",
    "const { writeImmutableReport } = await import(pathToFileURL(process.argv[2]).href);",
    "const [, , , directory, name, marker] = process.argv;",
    "try {",
    "  writeImmutableReport({ directory, name, payload: { writer: marker } });",
    "  process.exit(0);",
    "} catch (error) {",
    "  process.stderr.write(String(error?.code ?? error));",
    "  process.exit(error?.code === 'R37H_REPORT_EXISTS' ? 3 : 4);",
    "}"
  ].join('\n'));
  const run = (marker) => new Promise((resolve) => {
    const child = spawn(process.execPath, [helper, MODULE, dir, 'race.json', marker], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ marker, code, stderr }));
  });
  const results = await Promise.all([run('alpha'), run('beta')]);
  const winners = results.filter((result) => result.code === 0);
  const losers = results.filter((result) => result.code === 3);
  assert.equal(winners.length, 1, `exactly one writer must win, saw ${JSON.stringify(results)}`);
  assert.equal(losers.length, 1, 'the other writer must observe the collision');
  const bytes = fs.readFileSync(path.join(dir, 'race.json'));
  const payload = JSON.parse(bytes.toString('utf8'));
  assert.equal(payload.writer, winners[0].marker, 'the surviving bytes belong to the winner');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['race.json', 'writer-child.mjs'], 'no partial or temp output remains');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('4-5. interrupted write leaves no partial report; only owned temps are recovered', () => {
  const dir = freshDir();
  // Simulate a writer that died after staging its temp file: an orphan temp exists, no final report.
  const orphan = path.join(dir, '.alp-report-' + 'a'.repeat(24) + '.tmp');
  fs.writeFileSync(orphan, '{"partial":');
  // Unrelated user data in the same directory must survive.
  const unrelated = path.join(dir, 'notes.md');
  fs.writeFileSync(unrelated, 'reviewer notes');
  assert.equal(fs.existsSync(path.join(dir, 'run.json')), false);
  const recovery = cleanupReportTemps(dir);
  assert.deepEqual([...recovery.removed], [path.basename(orphan)]);
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(fs.existsSync(unrelated), true, 'recovery must never remove unrelated data');
  // Partial output: nothing is published at the final name until the bytes are complete.
  assert.deepEqual(fs.readdirSync(dir).sort(), ['notes.md']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('6. report name collisions and unsafe names are refused before any write', () => {
  const dir = freshDir();
  for (const name of ['../escape.json', 'sub/dir.json', '.hidden.json', 'a b.json', 'report.exe', 'latest-status.json']) {
    assert.throws(
      () => writeImmutableReport({ directory: dir, name, payload: {} }),
      (error) => {
        assert.match(String(error.message), /R37H_REPORT_WRITE:NAME_/);
        return true;
      },
      `${name} must be refused`
    );
  }
  assert.deepEqual(fs.readdirSync(dir), [], 'a refused name must not create anything');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('8. authorized update of a mutable summary pointer replaces atomically, records and preserves the prior artifact', () => {
  const dir = freshDir();
  const first = publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'first' } });
  assert.equal(first.replaced, false);
  assert.equal(first.previousSha256, null);
  // Authorized replacement must state the expected current digest (B27 preservation-first).
  const second = publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'second' }, expectedPreviousSha256: first.sha256 });
  assert.equal(second.replaced, true);
  assert.equal(second.previousSha256, first.sha256, 'the superseded digest is reported for audit');
  assert.deepEqual(JSON.parse(fs.readFileSync(second.path, 'utf8')), { state: 'second' });
  // The superseded artifact is preserved as a verified recovery copy before replacement.
  assert.ok(second.recoveryPath, 'an authorized replacement preserves the previous artifact');
  assert.equal(sha256Hex(fs.readFileSync(second.recoveryPath)), first.sha256, 'the recovery copy matches the superseded digest');
  // An immutable-style name may never be replaced through the mutable class, and vice versa.
  assert.throws(() => publishMutableSummary({ directory: dir, name: 'evidence.json', payload: {} }), /NAME_NOT_MUTABLE_POINTER/);
  writeImmutableReport({ directory: dir, name: 'evidence.json', payload: { v: 1 } });
  assert.throws(() => writeImmutableReport({ directory: dir, name: 'evidence.json', payload: { v: 2 } }), /R37H_REPORT_EXISTS/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('9. unauthorized replacement of a mutable pointer is refused without a stated previous digest', () => {
  const dir = freshDir();
  const first = publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'first' } });
  const before = fs.readFileSync(first.path);
  // No expectedPreviousSha256: the caller has not authorized replacing the existing artifact.
  assert.throws(
    () => publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'second' } }),
    /R37H_REPORT_WRITE:REPLACEMENT_AUTHORIZATION_REQUIRED/
  );
  // The existing pointer is untouched and no recovery copy or temp remains.
  assert.deepEqual(fs.readFileSync(first.path), before);
  assert.deepEqual(fs.readdirSync(dir), ['latest-status.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('10. replacement with a mismatched expected previous digest fails closed and preserves the artifact', () => {
  const dir = freshDir();
  const first = publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'first' } });
  const before = fs.readFileSync(first.path);
  const wrongDigest = 'f'.repeat(64);
  assert.throws(
    () => publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'second' }, expectedPreviousSha256: wrongDigest }),
    /R37H_REPORT_WRITE:PREVIOUS_DIGEST_MISMATCH/
  );
  // Fail-closed: nothing replaced, nothing preserved, no temp left behind.
  assert.deepEqual(fs.readFileSync(first.path), before);
  assert.deepEqual(fs.readdirSync(dir), ['latest-status.json']);
  // An invalid (non 64-hex) expectation is also refused as unauthorized.
  assert.throws(
    () => publishMutableSummary({ directory: dir, name: 'latest-status.json', payload: { state: 'third' }, expectedPreviousSha256: 'not-a-digest' }),
    /R37H_REPORT_WRITE:REPLACEMENT_AUTHORIZATION_REQUIRED/
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
