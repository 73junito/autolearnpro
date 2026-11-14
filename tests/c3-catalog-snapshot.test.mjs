// C3-R37H remediation R5 (findings B14, B19, B20) — snapshot versioning and reviewable-diff tests.
//
// Acceptance cases: stable fixtures/controlled state, explicit snapshot versioning, no uncontrolled
// timestamp or environment-dependent content in results, no automatic approval of changed visual baselines,
// and snapshot changes produce reviewable diffs.
//
// Run with: node --test tests/c3-catalog-snapshot.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareSnapshotRuns } from '../docs/c3-r37h/tools/snapshot-compare.mjs';

const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-snapshot-'));
  const baselineDir = path.join(dir, 'baseline');
  const candidateDir = path.join(dir, 'candidate');
  fs.mkdirSync(baselineDir);
  fs.mkdirSync(candidateDir);
  const bytesA = Buffer.from('PNG-PLACEHOLDER-gate-1280-content-v1');
  const bytesB = Buffer.from('PNG-PLACEHOLDER-gate-360-content-v1');
  for (const [name, bytes] of [['gate-1280.png', bytesA], ['gate-360.png', bytesB]]) {
    fs.writeFileSync(path.join(baselineDir, name), bytes);
    fs.writeFileSync(path.join(candidateDir, name), bytes);
  }
  const manifest = {
    snapshotVersion: 'v1',
    controlledState: 'chromium headless 1280x900; catalog prototype default state; build mode production',
    entries: [
      { file: 'gate-1280.png', sha256: sha256Hex(bytesA), bytes: bytesA.length },
      { file: 'gate-360.png', sha256: sha256Hex(bytesB), bytes: bytesB.length }
    ]
  };
  return { dir, baselineDir, candidateDir, manifest };
}

test('1. explicit snapshot versioning and controlled state are mandatory', () => {
  const { dir, candidateDir, manifest } = fixture();
  const unversioned = { ...manifest };
  delete unversioned.snapshotVersion;
  assert.throws(() => compareSnapshotRuns({ baselineManifest: unversioned, candidateDir }), /MANIFEST_VERSION_MISSING/);
  const noState = { ...manifest };
  delete noState.controlledState;
  assert.throws(() => compareSnapshotRuns({ baselineManifest: noState, candidateDir }), /MANIFEST_CONTROLLED_STATE_MISSING/);
  const badEntry = { ...manifest, entries: [{ file: '../escape.png', sha256: 'a'.repeat(64), bytes: 1 }] };
  assert.throws(() => compareSnapshotRuns({ baselineManifest: badEntry, candidateDir }), /MANIFEST_ENTRY_INVALID/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('2. identical capture produces a clean, versioned comparison', () => {
  const { dir, candidateDir, manifest } = fixture();
  const report = compareSnapshotRuns({ baselineManifest: manifest, candidateDir });
  assert.equal(report.snapshotVersion, 'v1');
  assert.equal(report.changedCount, 0);
  assert.ok(report.entries.every((entry) => entry.changed === false));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('3. a changed snapshot produces a reviewable diff and is NEVER auto-approved', () => {
  const { dir, candidateDir, manifest } = fixture();
  const changed = Buffer.from('PNG-PLACEHOLDER-gate-1280-content-v2-DIFFERENT');
  fs.writeFileSync(path.join(candidateDir, 'gate-1280.png'), changed);
  const report = compareSnapshotRuns({ baselineManifest: manifest, candidateDir });
  assert.equal(report.changedCount, 1);
  const entry = report.entries.find((item) => item.file === 'gate-1280.png');
  assert.equal(entry.changed, true);
  assert.equal(entry.baselineSha256, manifest.entries[0].sha256);
  assert.equal(entry.candidateSha256, sha256Hex(changed));
  assert.notEqual(entry.baselineSha256, entry.candidateSha256, 'the diff is reviewable: both digests are reported');
  assert.equal(entry.candidateBytes, changed.length);
  // No automatic approval of changed visual baselines.
  assert.equal(report.approved, false);
  assert.equal(report.reviewStatus, 'pending-review');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('4. the comparison is read-only and contains no uncontrolled metadata', () => {
  const { dir, candidateDir, manifest } = fixture();
  const before = fs.readFileSync(path.join(candidateDir, 'gate-1280.png'));
  const report = compareSnapshotRuns({ baselineManifest: manifest, candidateDir });
  assert.deepEqual(fs.readFileSync(path.join(candidateDir, 'gate-1280.png')), before, 'the candidate is not modified');
  // The report depends only on content hashes: repeated runs are identical (no timestamps, no hostnames).
  const again = compareSnapshotRuns({ baselineManifest: manifest, candidateDir });
  assert.deepEqual(JSON.parse(JSON.stringify(report)), JSON.parse(JSON.stringify(again)), 'comparison results are deterministic');
  assert.equal(JSON.stringify(report).includes(new Date().getFullYear().toString()), false, 'no timestamp leaks into the report');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('5. a missing candidate file is an explicit failure, not a silent pass', () => {
  const { dir, candidateDir, manifest } = fixture();
  fs.rmSync(path.join(candidateDir, 'gate-360.png'));
  assert.throws(() => compareSnapshotRuns({ baselineManifest: manifest, candidateDir }), /CANDIDATE_FILE_MISSING/);
  fs.rmSync(dir, { recursive: true, force: true });
});
