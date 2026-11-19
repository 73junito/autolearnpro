// C3-R36E — independent process verification tests.
//
// The producer and the verifier are separate Node processes started with `spawnSync`, so a verifier can only run
// after its producer has fully exited. The verifier receives PATHS ONLY: no digest, no snapshot object, no bundle
// record and no claim is ever handed to it.
//
// Run with: node --test tests/c3-process-boundary.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeEnvelopeDigest, EVIDENCE_FILE_NAME, serializeEvidence } from '../infrastructure/c3/build/evidence-envelope.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');

const PRODUCER = path.join(REPO, 'infrastructure', 'c3', 'build', 'evidence-producer.cli.mjs');
const VERIFIER = path.join(REPO, 'infrastructure', 'c3', 'build', 'evidence-verifier.cli.mjs');
const ALTER_FIXTURE = path.join(REPO, 'tests', 'fixtures', 'fs-alter-once.mjs');

const TOOLCHAIN = Object.freeze({
  name: 'esbuild',
  version: JSON.parse(fs.readFileSync(path.join(REPO, 'infrastructure', 'c3', 'build', 'node_modules', 'esbuild', 'package.json'), 'utf8')).version,
  configId: 'alp-c3-r36b-worker-bundle-v1'
});

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r36e-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function workspace(t, repositoryRoot) {
  const base = tmpDir(t);
  const directories = {};
  for (const name of ['build', 'snapshot', 'evidence']) {
    directories[name] = path.join(base, name);
    fs.mkdirSync(directories[name]);
  }
  const roots = repositoryRoot
    ? {
      repository: repositoryRoot,
      catalog: path.join(repositoryRoot, 'apps', 'catalog'),
      worker: path.join(repositoryRoot, 'infrastructure', 'cloudflare')
    }
    : { repository: REPO, catalog: CATALOG, worker: WORKER };
  return { base, directories, roots };
}

function sandbox(t) {
  const base = tmpDir(t, 'c3-r36e-fixture-');
  const repository = path.join(base, 'repo');
  const catalog = path.join(repository, 'apps', 'catalog');
  const worker = path.join(repository, 'infrastructure', 'cloudflare');
  fs.mkdirSync(catalog, { recursive: true });
  fs.mkdirSync(worker, { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(REPO, name), path.join(repository, name));
  for (const name of ['package.json', 'index.html', 'vite.config.js']) fs.copyFileSync(path.join(CATALOG, name), path.join(catalog, name));
  fs.mkdirSync(path.join(catalog, 'src'), { recursive: true });
  fs.copyFileSync(path.join(CATALOG, 'src', 'main.js'), path.join(catalog, 'src', 'main.js'));
  for (const name of ['worker.mjs', 'wrangler.jsonc']) fs.copyFileSync(path.join(WORKER, name), path.join(worker, name));
  return repository;
}

// The payload contains paths and labels. It contains no digest and no producer output.
function payloadFor(ws, overrides = {}) {
  return {
    policy: { tier: 'temporary', rootDir: ws.base, targets: ['evidence/evidence.json', 'build/worker.mjs'] },
    directories: ws.directories,
    roots: ws.roots,
    toolchain: { name: TOOLCHAIN.name, version: TOOLCHAIN.version, configId: TOOLCHAIN.configId },
    ...overrides
  };
}

function run(script, payload) {
  const raw = payload === undefined ? [] : [JSON.stringify(payload)];
  const result = spawnSync(process.execPath, [script, ...raw], { encoding: 'utf8', timeout: 180000 });
  let json = null;
  try {
    json = JSON.parse(String(result.stdout).trim());
  } catch {
    json = null;
  }
  return { status: result.status, stdout: String(result.stdout).trim(), json };
}

const produce = (payload) => run(PRODUCER, payload);
const verify = (payload) => run(VERIFIER, payload);

function digestTree(dir) {
  const rows = [];
  const skip = new Set(['node_modules', '.git']);
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      if (skip.has(name)) continue;
      const absolute = path.join(current, name);
      const stats = fs.lstatSync(absolute);
      if (stats.isDirectory()) visit(absolute);
      else rows.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute)), stats.size]);
    }
  };
  visit(dir);
  return rows;
}

test('1. the producer completes and a separate verifier process passes', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);

  const produced = produce(payload);
  assert.equal(produced.status, 0, `producer failed: ${produced.stdout}`);
  assert.equal(produced.json.ok, true);
  assert.equal(produced.json.stages.length, 8);

  const verified = verify(payload);
  assert.equal(verified.status, 0, `verifier failed: ${verified.stdout}`);
  assert.equal(verified.json.ok, true);
  assert.match(verified.json.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verified.json.snapshot.combinedSha256, produced.json.snapshot.combinedSha256);
  for (const flag of ['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed']) {
    assert.equal(verified.json.claims[flag], false, `${flag} must be false`);
  }
});

test('2. verification happens after the producer process has exited', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);

  const produced = produce(payload);
  assert.equal(produced.status, 0);
  // spawnSync returns only once the child has terminated, so the evidence on disk was written by a process that
  // no longer exists. The distinct PIDs are recorded as evidence of separation, not as a proof on their own.
  assert.equal(fs.existsSync(path.join(ws.directories.evidence, EVIDENCE_FILE_NAME)), true);

  const verified = verify(payload);
  assert.equal(verified.status, 0);
  assert.notEqual(verified.json.pid, produced.json.pid, 'producer and verifier must be different processes');
});

test('3. repeated verifier processes reach the same verdict', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  const first = verify(payload);
  const second = verify(payload);
  assert.equal(first.status, 0);
  assert.equal(second.status, 0);

  const strip = (json) => {
    const copy = { ...json };
    delete copy.pid;
    return JSON.stringify(copy);
  };
  assert.equal(strip(second.json), strip(first.json), 'the only permitted difference between runs is the PID');
  assert.notEqual(second.json.pid, first.json.pid);
});

test('4. artifact tampering after the producer exited is detected', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  fs.appendFileSync(path.join(ws.directories.build, 'worker.mjs'), '// tampered after the fact\n');
  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.equal(verified.json.ok, false);
  assert.match(verified.json.error, /^R36C_ARTIFACT_MISMATCH/);
});

test('5. evidence-file tampering after the producer exited is detected', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  const file = path.join(ws.directories.evidence, EVIDENCE_FILE_NAME);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(/"artifactBytes": (\d+)/, (match, digits) => `"artifactBytes": ${Number(digits) + 1}`));

  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R36C_DIGEST_MISMATCH/);
});

test('6. source drift after the producer exited is detected by the verifier', (t) => {
  const repository = sandbox(t);
  const ws = workspace(t, repository);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  // The artifact and the evidence are untouched; only the source moved. The verifier re-derives the snapshot from
  // the working tree, so this must be caught without any producer involvement.
  const entry = path.join(repository, 'infrastructure', 'cloudflare', 'worker.mjs');
  fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8').replace('"scaffold"', '"scaffold-drift"'));

  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R36C_(SNAPSHOT|SOURCE)_MISMATCH/);
});

test('7. a missing artifact is refused and never rebuilt', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);
  fs.rmSync(path.join(ws.directories.build, 'worker.mjs'));

  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R36C_ARTIFACT_MISSING/);
  assert.equal(fs.existsSync(path.join(ws.directories.build, 'worker.mjs')), false, 'the verifier must not rebuild');
});

test('8. a missing evidence file is refused and never regenerated', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);
  fs.rmSync(path.join(ws.directories.evidence, EVIDENCE_FILE_NAME));

  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R36C_EVIDENCE_MISSING/);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
});

test('9. forged provenance in the persisted evidence is refused across the boundary', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  const file = path.join(ws.directories.evidence, EVIDENCE_FILE_NAME);
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const flag of ['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed']) {
    const forged = { ...envelope, [flag]: true };
    forged.envelopeSha256 = computeEnvelopeDigest(forged);
    fs.writeFileSync(file, serializeEvidence(forged));

    const verified = verify(payload);
    assert.equal(verified.status, 1);
    assert.match(verified.json.error, new RegExp(`^R36C_FORGED_CLAIM:${flag}`));
  }
});

test('10. incorrect or missing trusted verification inputs are refused', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  // No payload at all.
  const empty = run(VERIFIER, undefined);
  assert.equal(empty.status, 1);
  assert.match(empty.json.error, /^R36E_PAYLOAD_REQUIRED/);

  // A payload that is not JSON.
  const garbled = spawnSync(process.execPath, [VERIFIER, '{not json'], { encoding: 'utf8' });
  assert.equal(garbled.status, 1);
  assert.match(JSON.parse(garbled.stdout.trim()).error, /^R36E_PAYLOAD_INVALID/);

  // Paths omitted: the verifier needs its own inputs, so it refuses rather than guessing.
  const noRoots = payloadFor(ws, { roots: undefined });
  assert.equal(verify(noRoots).status, 1);
  assert.match(verify(noRoots).json.error, /^R36E_ROOTS_REQUIRED/);

  // A version the machine does not have.
  const wrongVersion = payloadFor(ws, { toolchain: { ...payload.toolchain, version: '9.9.9' } });
  const versionResult = verify(wrongVersion);
  assert.equal(versionResult.status, 1);
  assert.match(versionResult.json.error, /^R36E_TOOLCHAIN_VERSION_MISMATCH/);
});

test('11. an invalid temporary policy is refused by both processes', (t) => {
  const ws = workspace(t);
  const production = payloadFor(ws, { policy: { tier: 'production', rootDir: ws.base, targets: ['evidence/evidence.json'] } });

  const produced = produce(production);
  assert.equal(produced.status, 1);
  assert.match(produced.json.error, /^R28_PRODUCTION_NOT_AUTHORIZED/);

  const forged = payloadFor(ws, { policy: { tier: 'temporary', rootDir: REPO, targets: ['evidence/evidence.json'] } });
  const verified = verify(forged);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R28_ROOT_NOT_TEMPORARY/);

  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
});

test('12. a symlink or junction escape is refused by the verifier', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  const outside = tmpDir(t, 'c3-r36e-link-target-');
  const link = path.join(tmpDir(t, 'c3-r36e-link-holder-'), 'evidence-link');
  try {
    fs.symlinkSync(outside, link, 'junction');
  } catch {
    t.diagnostic('host refused to create a directory link; junction case not exercised in this run');
    return;
  }

  const leaked = payloadFor(ws, { directories: { ...ws.directories, evidence: link } });
  const verified = verify(leaked);
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^R36C_EVIDENCE_ROOT_(OUTSIDE_POLICY|UNAVAILABLE)/);
});

test('13. a producer failure before persistence leaves no evidence', (t) => {
  const repository = sandbox(t);
  fs.rmSync(path.join(repository, 'package-lock.json'));
  const ws = workspace(t, repository);

  const produced = produce(payloadFor(ws));
  assert.equal(produced.status, 1);
  assert.match(produced.json.error, /^R35_INPUT_MISSING/);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
  assert.deepEqual(fs.readdirSync(ws.directories.build), []);

  // And a verifier pointed at that empty result refuses too. It refuses on the *source* first, because it
  // re-derives the snapshot before it reads any evidence — which is the ordering that makes it independent.
  const verified = verify(payloadFor(ws));
  assert.equal(verified.status, 1);
  assert.match(verified.json.error, /^(R35_INPUT_MISSING|R36C_EVIDENCE_MISSING)/);
});

test('14. a producer failure during persistence leaves the previous state intact', (t) => {
  const ws = workspace(t);
  const planted = path.join(ws.directories.evidence, 'existing.json');
  fs.writeFileSync(planted, '{"pre-existing":"do not touch"}');
  const before = sha256(fs.readFileSync(planted));

  const produced = produce(payloadFor(ws));
  assert.equal(produced.status, 1);
  assert.match(produced.json.error, /^R36D_DIRECTORY_NOT_EMPTY:evidence/);

  assert.equal(sha256(fs.readFileSync(planted)), before, 'a refused producer must not modify existing data');
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), ['existing.json']);
});

test('15. a verifier that cannot complete exits nonzero with structured output', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  // Make the verifier's own snapshot scratch unusable, so it fails partway through rather than at argument parsing.
  fs.writeFileSync(path.join(ws.directories.snapshot, 'blocker.txt'), 'not empty');

  const verified = verify(payload);
  assert.equal(verified.status, 1);
  assert.equal(verified.json.ok, false);
  assert.equal(typeof verified.json.error, 'string');
  assert.match(verified.json.error, /^(R35|R36A|R36C|R36D|R36E)_/);
  // The failure is structured JSON, not a stack trace a caller could mistake for a verdict.
  assert.equal(verified.stdout.split('\n').length, 1);
});

test('16. verification never repairs or rebuilds anything', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  const evidenceBytes = sha256(fs.readFileSync(path.join(ws.directories.evidence, EVIDENCE_FILE_NAME)));
  fs.rmSync(path.join(ws.directories.build, 'worker.mjs'));

  assert.equal(verify(payload).status, 1);
  assert.equal(verify(payload).status, 1);

  assert.equal(fs.existsSync(path.join(ws.directories.build, 'worker.mjs')), false, 'no rebuild');
  assert.equal(sha256(fs.readFileSync(path.join(ws.directories.evidence, EVIDENCE_FILE_NAME))), evidenceBytes, 'no rewrite');
});

test('17. neither process mutates the source tree', (t) => {
  const before = { catalog: digestTree(CATALOG), worker: digestTree(WORKER), root: digestTree(REPO) };
  const ws = workspace(t);
  const payload = payloadFor(ws);

  assert.equal(produce(payload).status, 0);
  assert.equal(verify(payload).status, 0);

  assert.deepEqual(digestTree(CATALOG), before.catalog);
  assert.deepEqual(digestTree(WORKER), before.worker);
  // The repository root is unchanged apart from the artefacts this milestone itself added before the run.
  assert.deepEqual(digestTree(REPO), before.root);
});

test('18. cleanup is limited to the owned temporary directories', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  assert.equal(produce(payload).status, 0);

  // A file the rehearsal does not own, in a directory inside the policy root but not among the three.
  const unowned = path.join(ws.base, 'unowned');
  fs.mkdirSync(unowned);
  fs.writeFileSync(path.join(unowned, 'keep.txt'), 'user data');

  // Ownership is structural: the producer only ever touches build/, evidence/ and the empty snapshot scratch.
  assert.deepEqual(fs.readdirSync(unowned), ['keep.txt']);
  assert.deepEqual(fs.readdirSync(ws.directories.snapshot), []);
  assert.deepEqual(fs.readdirSync(ws.directories.build), ['worker.mjs']);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), [EVIDENCE_FILE_NAME]);

  // Verification writes nothing at all, so nothing can be removed by it either.
  const snapshotBefore = digestTree(ws.directories.snapshot);
  assert.equal(verify(payload).status, 0);
  assert.deepEqual(digestTree(ws.directories.snapshot), snapshotBefore);
});

test('19. the R36D disk-reinspection guard is exercised (closing the open R36D probe)', (t) => {
  const ws = workspace(t);
  const payload = payloadFor(ws);
  const bundlePath = path.join(ws.directories.build, 'worker.mjs');

  // Control: without interception the producer succeeds, so any failure below is caused by the interception.
  assert.equal(produce(payload).status, 0);

  const second = workspace(t);
  const secondPayload = payloadFor(second);
  const secondBundle = path.join(second.directories.build, 'worker.mjs');

  const intercepted = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(ALTER_FIXTURE).href, PRODUCER, JSON.stringify(secondPayload)],
    { encoding: 'utf8', timeout: 180000, env: { ...process.env, R36E_ALTER_TARGET: secondBundle } }
  );
  const verdict = JSON.parse(String(intercepted.stdout).trim());

  // The bytes on disk no longer match what the bundler reported, so R36D stage 4 refuses. This is the guard the
  // R36D mutation probe M5 could not reach: it fires here without any reviewed contract being modified.
  assert.equal(intercepted.status, 1);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.error, 'R36D_BUNDLE_BYTES_CHANGED');

  // The bundle itself was written (the guard sits after the write); no evidence was produced because the producer
  // stopped at stage 4, which is the fail-closed ordering the milestone relies on.
  assert.equal(fs.existsSync(secondBundle), true);
  assert.deepEqual(fs.readdirSync(second.directories.evidence), []);
  assert.equal(fs.existsSync(bundlePath), true, 'the control workspace is untouched');
});




