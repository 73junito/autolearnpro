// C3-R37H remediation R3 (finding B26) — cleanup after terminated runs.
//
// Acceptance cases required by the remediation directive:
//   - normal completion
//   - application exception
//   - timeout
//   - child-process failure
//   - external termination
//   - recovery after interrupted execution
//   - repeated recovery attempts
//   - two concurrent executions
// Plus: no orphaned test-owned resources, no accidental removal of unrelated resources, consistent recovery
// records.
//
// Run with: node --test tests/c3-run-cleanup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRunSession, recoverStaleRuns, OWNERSHIP_FILE } from '../infrastructure/c3/build/run-ownership.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.join(here, '..', 'infrastructure', 'c3', 'build', 'run-ownership.mjs');
const freshRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'alp-run-ownership-'));

// Child helper: creates a session in ROOT/<runId>, registers two paths, then behaves as instructed:
//   hold       — never release and exit 0 (a run abandoned by a timeout whose handler never ran)
//   fail       — exit 1 without releasing (child-process failure)
//   sleep      — keep running until killed (external termination)
function childScript(mode) {
  return [
    "const { pathToFileURL } = await import('node:url');",
    "const fs = await import('node:fs');",
    "const path = await import('node:path');",
    `const mode = ${JSON.stringify(mode)};`,
    "const [, , , rootDir, runId] = process.argv;",
    "const { createRunSession } = await import(pathToFileURL(process.argv[2]).href);",
    "const session = createRunSession({ rootDir, runId });",
    "const fileA = path.join(session.dir, 'artifact.bin');",
    "fs.writeFileSync(fileA, 'data');",
    "const dirB = path.join(session.dir, 'work');",
    "fs.mkdirSync(dirB);",
    "fs.writeFileSync(path.join(dirB, 'partial.json'), '{');",
    "session.register(fileA);",
    "session.register(dirB);",
    "process.stdout.write(session.dir);",
    "if (mode === 'fail') process.exit(1);",
    "if (mode === 'sleep') setInterval(() => {}, 1000);",
    "else process.exit(0);"
  ].join('\n');
}

function spawnChild(mode, root, runId) {
  return new Promise((resolve) => {
    const script = path.join(root, `helper-${runId}.mjs`);
    fs.writeFileSync(script, childScript(mode));
    const child = spawn(process.execPath, [script, MODULE, root, runId], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    if (mode === 'sleep') {
      // External termination: the child is killed abruptly once it has registered its resources.
      child.stdout.once('data', () => { setTimeout(() => child.kill(), 200); });
    }
    child.on('close', (code) => resolve({ child, code, dir: out.trim() }));
  });
}

test('1. normal completion leaves no test-owned resources behind', () => {
  const root = freshRoot();
  const session = createRunSession({ rootDir: root, runId: 'normal-run' });
  const fileA = path.join(session.dir, 'artifact.bin');
  fs.writeFileSync(fileA, 'data');
  session.register(fileA);
  const dirB = path.join(session.dir, 'work');
  fs.mkdirSync(dirB);
  session.register(dirB);
  assert.ok(fs.existsSync(fileA));
  const record = session.release();
  assert.equal(record.released, true);
  assert.deepEqual([...record.removedPaths].sort(), ['artifact.bin', 'work']);
  assert.equal(fs.existsSync(session.dir), false, 'the session directory is gone');
  assert.deepEqual(fs.readdirSync(root), [], 'no orphaned test-owned resources remain');
  fs.rmSync(root, { recursive: true, force: true });
});

test('2. an application exception followed by finally-based release cleans up completely', () => {
  const root = freshRoot();
  const session = createRunSession({ rootDir: root, runId: 'exception-run' });
  let caught = null;
  try {
    const fileA = path.join(session.dir, 'state.json');
    fs.writeFileSync(fileA, '{}');
    session.register(fileA);
    throw Error('injected application failure');
  } catch (error) {
    caught = error;
  } finally {
    session.release();
  }
  assert.equal(String(caught), 'Error: injected application failure');
  assert.deepEqual(fs.readdirSync(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('3-6. timeout, child failure and external termination are recovered from ownership metadata', async () => {
  for (const [mode, label] of [['hold', 'timeout'], ['fail', 'child-process failure'], ['sleep', 'external termination']]) {
    const root = freshRoot();
    // Unrelated user data that recovery must never touch.
    const unrelated = path.join(root, 'user-notes.txt');
    fs.writeFileSync(unrelated, 'keep me');
    const foreign = path.join(root, 'not-a-run');
    fs.mkdirSync(foreign);
    fs.writeFileSync(path.join(foreign, 'data.txt'), 'keep me too');

    const runId = `${mode}-run`;
    const childResult = await spawnChild(mode, root, runId);
    const sessionDir = path.join(root, runId);
    assert.ok(fs.existsSync(sessionDir), `${label}: the run left a session directory`);
    assert.ok(fs.existsSync(path.join(sessionDir, OWNERSHIP_FILE)), `${label}: ownership metadata is present`);

    // 6. recovery after interrupted execution: the record is read, owned paths removed, the run dir closed.
    const recovery = recoverStaleRuns({ rootDir: root });
    const recovered = recovery.records.filter((record) => record.action === 'recovered');
    assert.equal(recovered.length, 1, `${label}: exactly one stale run is recovered`);
    assert.equal(recovered[0].runId, runId);
    assert.deepEqual([...recovered[0].removedPaths].sort(), ['artifact.bin', 'work']);
    assert.equal(fs.existsSync(sessionDir), false, `${label}: the stale session directory is gone`);
    assert.equal(fs.readFileSync(unrelated, 'utf8'), 'keep me');
    assert.equal(fs.readFileSync(path.join(foreign, 'data.txt'), 'utf8'), 'keep me too');

    // 7. repeated recovery attempts are idempotent: the second pass finds nothing to recover.
    const second = recoverStaleRuns({ rootDir: root });
    assert.equal(second.records.filter((record) => record.action === 'recovered').length, 0, `${label}: recovery is idempotent`);
    assert.equal(childResult.dir, sessionDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('8. two concurrent executions: only the abandoned run is recovered, the active run survives', async () => {
  const root = freshRoot();
  const active = createRunSession({ rootDir: root, runId: 'active-run' });
  const activeFile = path.join(active.dir, 'live.bin');
  fs.writeFileSync(activeFile, 'live');
  active.register(activeFile);

  await spawnChild('hold', root, 'abandoned-run');
  const recovery = recoverStaleRuns({ rootDir: root });
  const actions = Object.fromEntries(recovery.records.map((record) => [record.runId, record.action]));
  assert.equal(actions['abandoned-run'], 'recovered');
  assert.equal(actions['active-run'], 'preserved-active', 'a live run is never removed');
  assert.ok(fs.existsSync(activeFile), 'the active run keeps its resources');
  assert.equal(fs.existsSync(path.join(root, 'abandoned-run')), false);

  // And the active run still releases normally afterwards.
  const record = active.release();
  assert.equal(record.released, true);
  // Only the disposable child helper script remains; no session resources are orphaned.
  assert.deepEqual(fs.readdirSync(root).filter((name) => name !== 'helper-abandoned-run.mjs'), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('recovery refuses to treat unowned or unreadable directories as disposable', () => {
  const root = freshRoot();
  const impostor = path.join(root, 'impostor');
  fs.mkdirSync(impostor);
  fs.writeFileSync(path.join(impostor, OWNERSHIP_FILE), '{"schema":"someone-elses-format"}');
  fs.writeFileSync(path.join(impostor, 'keep.bin'), 'keep');
  const recovery = recoverStaleRuns({ rootDir: root });
  const preserved = recovery.records.filter((record) => record.action === 'preserved-unreadable-ownership');
  assert.equal(preserved.length, 1, 'a directory with foreign ownership metadata is preserved and reported');
  assert.equal(fs.readFileSync(path.join(impostor, 'keep.bin'), 'utf8'), 'keep');
  fs.rmSync(root, { recursive: true, force: true });
});
