// C3-R36B — isolated Worker bundle feasibility tests.
//
// The positive case bundles the REAL Worker with the isolated esbuild pin. Negative cases use a temporary copy of
// the real inputs and change exactly one thing. Nothing here executes the bundle, deploys it, or attests to it.
//
// Run with: node --test tests/c3-worker-bundle-feasibility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertFeasibilityRecord,
  BUNDLE_CONFIG,
  BUNDLE_CONFIG_ID,
  BUNDLE_FILE_NAME,
  bundleWorker,
  inspectBundle,
  removeBundleOutput
} from '../infrastructure/c3/build/worker-bundle.mjs';
import { createTargetPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';
import { createSourceSnapshot } from '../infrastructure/c3/build/source-snapshot.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');
const MODULE = path.join(REPO, 'infrastructure', 'c3', 'build', 'worker-bundle.mjs');
const ISOLATED_ESBUILD = path.join(REPO, 'infrastructure', 'c3', 'build', 'node_modules', 'esbuild', 'package.json');

const PINNED = Object.freeze({
  'infrastructure/cloudflare/worker.mjs': '261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e',
  'infrastructure/cloudflare/wrangler.jsonc': 'df6486888a42317d8c94d9a46f3f5adb05d742b52be1ee8cf8077ffa647f4c58'
});

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r36b-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function scratch(t) {
  const base = tmpDir(t);
  const output = path.join(base, 'out');
  fs.mkdirSync(output);
  const policy = createTargetPolicy({ tier: TARGET_TIERS.TEMPORARY, rootDir: base, targets: ['evidence/worker.json'] });
  return { base, output, policy };
}

function sandbox(t) {
  const base = tmpDir(t);
  const policyRoot = path.join(base, 'scratch');
  const repository = path.join(policyRoot, 'repo');
  const catalog = path.join(repository, 'apps', 'catalog');
  const worker = path.join(repository, 'infrastructure', 'cloudflare');
  const output = path.join(policyRoot, 'out');
  const outside = path.join(base, 'outside');

  fs.mkdirSync(catalog, { recursive: true });
  fs.mkdirSync(worker, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(REPO, name), path.join(repository, name));
  for (const name of ['package.json', 'index.html', 'vite.config.js']) fs.copyFileSync(path.join(CATALOG, name), path.join(catalog, name));
  fs.mkdirSync(path.join(catalog, 'src'), { recursive: true });
  fs.copyFileSync(path.join(CATALOG, 'src', 'main.js'), path.join(catalog, 'src', 'main.js'));
  for (const name of ['worker.mjs', 'wrangler.jsonc']) fs.copyFileSync(path.join(WORKER, name), path.join(worker, name));

  const policy = createTargetPolicy({ tier: TARGET_TIERS.TEMPORARY, rootDir: policyRoot, targets: ['evidence/worker.json'] });
  return { base, policyRoot, repository, catalog, worker, output, outside, policy };
}

const rootsFor = (fixture) => ({ repository: fixture.repository, catalog: fixture.catalog, worker: fixture.worker });
const argsFor = (fixture) => ({ policy: fixture.policy, outputRoot: fixture.output, roots: rootsFor(fixture) });
const realArgs = (t) => {
  const { output, policy } = scratch(t);
  return { policy, outputRoot: output, roots: { repository: REPO, catalog: CATALOG, worker: WORKER } };
};

async function refusesAsync(fn, pattern) {
  await assert.rejects(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

test('1. the real Worker bundles with the isolated esbuild pin under a valid mapping', async (t) => {
  // The toolchain is the isolated one, not the root install that carries Vite's transitive esbuild.
  const isolated = JSON.parse(fs.readFileSync(ISOLATED_ESBUILD, 'utf8'));
  assert.equal(isolated.version, '0.28.2');

  const record = await bundleWorker({ ...realArgs(t), write: false });

  assert.equal(record.ok, true);
  assert.equal(record.configId, BUNDLE_CONFIG_ID);
  assert.equal(record.entry.path, 'worker.mjs');
  assert.equal(record.entry.sha256, PINNED['infrastructure/cloudflare/worker.mjs']);
  assert.equal(record.output.file, BUNDLE_FILE_NAME);
  assert.ok(record.output.bytes > 0);
  assert.equal(record.inspection.ok, true);
  assert.equal(record.inspection.esm, true);
  assert.deepEqual([...record.inspection.findings], []);
  assert.equal(record.written, undefined, 'write:false must not touch the filesystem');

  // The configuration is the reviewed one.
  assert.equal(record.config.bundle, true);
  assert.equal(record.config.format, 'esm');
  assert.equal(record.config.platform, 'browser');
  assert.equal(record.config.target, 'es2022');
  assert.equal(record.config.write, false);
  assert.deepEqual([...record.config.external], []);

  // A build ran; nothing about authority was gained.
  assert.equal(record.claims.buildExecuted, true);
  for (const flag of ['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed', 'artifactPublished', 'deployed', 'releaseEvidenceProduced']) {
    assert.equal(record.claims[flag], false, `${flag} must be false`);
  }
});

test('2. two clean builds are byte-identical, and the digest is recomputed independently', async (t) => {
  const first = await bundleWorker({ ...realArgs(t), write: true });
  const second = await bundleWorker({ ...realArgs(t), write: true });

  assert.equal(first.output.sha256, second.output.sha256, 'identical source and toolchain must produce identical bytes');
  assert.equal(first.output.bytes, second.output.bytes);

  // Independent recomputation from the bytes on disk, not from the record.
  for (const record of [first, second]) {
    const onDisk = fs.readFileSync(record.written.path);
    assert.equal(sha256(onDisk), record.output.sha256);
    assert.equal(onDisk.length, record.output.bytes);
    assert.deepEqual(fs.readdirSync(path.dirname(record.written.path)), [BUNDLE_FILE_NAME]);
  }

  // The emitted module parses as ESM, without being executed.
  execFileSync(process.execPath, ['--check', first.written.path], { stdio: 'ignore' });
});

test('3. a missing Worker input is refused before any bundling', async (t) => {
  const fixture = sandbox(t);
  fs.rmSync(path.join(fixture.worker, 'worker.mjs'));
  await refusesAsync(() => bundleWorker(argsFor(fixture)), /^R35_INPUT_MISSING:worker\/worker\.mjs/);
  assert.deepEqual(fs.readdirSync(fixture.output), [], 'a refused build must leave no artifact');
});

test('4. a changed Worker input changes the bundle, and a forbidden import is refused outright', async (t) => {
  const fixture = sandbox(t);
  const baseline = await bundleWorker({ ...argsFor(fixture), write: false });

  // A one-token change in the Worker source must move the artifact digest.
  const entry = path.join(fixture.worker, 'worker.mjs');
  const source = fs.readFileSync(entry, 'utf8');
  fs.writeFileSync(entry, source.replace('"scaffold"', '"scaffold-r36b"'));
  const changed = await bundleWorker({ ...argsFor(fixture), write: false });
  assert.notEqual(changed.output.sha256, baseline.output.sha256);
  assert.equal(changed.entry.sha256, sha256(fs.readFileSync(entry)));

  // A Worker that acquires a bare import never reaches esbuild.
  fs.writeFileSync(entry, `import pg from 'pg';\n${source}`);
  await refusesAsync(() => bundleWorker({ ...argsFor(fixture), write: false }), /^R35_WORKER_IMPORT_FORBIDDEN:pg/);

  // A node builtin is refused by the boundary's token scan.
  fs.writeFileSync(entry, `import fs from 'node:fs';\n${source}`);
  await refusesAsync(() => bundleWorker({ ...argsFor(fixture), write: false }), /^R35_WORKER_FORBIDDEN:node:/);
});

test('5. an invalid temporary policy is refused', async (t) => {
  const fixture = sandbox(t);
  const roots = rootsFor(fixture);
  const targets = ['evidence/worker.json'];

  await refusesAsync(() => bundleWorker({ policy: null, outputRoot: fixture.output, roots }), /^R28_POLICY_REQUIRED/);
  await refusesAsync(() => bundleWorker({
    policy: { tier: 'production', rootDir: fixture.policyRoot, targets, publicationAuthorized: false },
    outputRoot: fixture.output,
    roots
  }), /^R28_PRODUCTION_NOT_AUTHORIZED/);
  await refusesAsync(() => bundleWorker({
    policy: { tier: 'staging', rootDir: fixture.policyRoot, targets, publicationAuthorized: false },
    outputRoot: fixture.output,
    roots
  }), /^R28_STAGING_NOT_AUTHORIZED/);
  await refusesAsync(() => bundleWorker({
    policy: { ...fixture.policy, publicationAuthorized: true },
    outputRoot: fixture.output,
    roots
  }), /^R28_PUBLICATION_FLAG_INVALID/);
  assert.deepEqual(fs.readdirSync(fixture.output), []);
});

test('6. a nonempty output directory is refused', async (t) => {
  const fixture = sandbox(t);
  fs.writeFileSync(path.join(fixture.output, 'leftover.txt'), 'stale');
  await refusesAsync(() => bundleWorker(argsFor(fixture)), /^R35_OUTPUT_NOT_EMPTY/);
  assert.deepEqual(fs.readdirSync(fixture.output), ['leftover.txt'], 'the refusal must not delete or overwrite');
});

test('7. traversal, link escape and output escape are refused', async (t) => {
  const fixture = sandbox(t);
  const roots = rootsFor(fixture);

  // Output outside the authorised policy root.
  await refusesAsync(() => bundleWorker({ policy: fixture.policy, outputRoot: fixture.outside, roots }), /^R35_OUTPUT_OUTSIDE_POLICY/);

  // A link inside the Worker root: refused by the input walk before any bundling.
  let linkable = true;
  try {
    fs.symlinkSync(fixture.outside, path.join(fixture.worker, 'link'), 'junction');
  } catch {
    linkable = false;
    t.diagnostic('host refused to create a directory link; link case not exercised in this run');
  }
  if (linkable) {
    await refusesAsync(() => bundleWorker({
      ...argsFor(fixture),
      inputs: {
        repository: [{ path: 'package.json', kind: 'file' }, { path: 'package-lock.json', kind: 'file' }],
        catalog: [{ path: 'package.json', kind: 'file' }, { path: 'index.html', kind: 'file' }, { path: 'vite.config.js', kind: 'file' }, { path: 'src', kind: 'directory' }],
        worker: [{ path: 'worker.mjs', kind: 'file' }, { path: 'wrangler.jsonc', kind: 'file' }, { path: 'link', kind: 'directory' }]
      }
    }), /^R35_INPUT_SYMLINK:worker\/link/);
  }

  // Cleanup may not reach outside the policy root either. (assert.throws matches String(err), hence no anchor.)
  assert.throws(() => removeBundleOutput({ policy: fixture.policy, outputRoot: fixture.outside }), /R36B_OUTPUT_OUTSIDE_POLICY/);
});

test('8. the emitted bundle is inspected, not merely assumed clean', async (t) => {
  // Inspection detects each class of contamination on synthetic text...
  const cases = [
    ['const x = require("fs");\nexport default {};', /CommonJS require/],
    ['import fs from "node:fs";\nexport default {};', /Node builtin import/],
    ['import x from "pg";\nexport default {};', /external specifier pg/],
    ['const k = process.env.SECRET;\nexport default {};', /process\.env/],
    ['const p = __dirname;\nexport default {};', /__dirname/],
    ['const y = 1;', /no top-level ESM export/]
  ];
  for (const [text, pattern] of cases) {
    const result = inspectBundle(Buffer.from(text, 'utf8'));
    assert.equal(result.ok, false, `inspection should have failed for: ${text}`);
    assert.ok(result.findings.some((finding) => pattern.test(finding)), `findings lacked ${pattern}: ${JSON.stringify(result.findings)}`);
  }

  // ...and the real emitted bundle passes every one of them.
  const record = await bundleWorker({ ...realArgs(t), write: true });
  const emitted = fs.readFileSync(record.written.path, 'utf8');
  const inspected = inspectBundle(Buffer.from(emitted, 'utf8'));

  assert.equal(inspected.ok, true, `the real bundle reported findings: ${JSON.stringify(inspected.findings)}`);
  assert.equal(inspected.esm, true);
  assert.equal(inspected.sha256, record.output.sha256);
  for (const token of ['require(', 'node:fs', 'process.env', 'apps/web', 'infrastructure/c3']) {
    assert.equal(emitted.includes(token), false, `the bundle must not contain ${token}`);
  }
  // The bundle is smaller than the source because comments are dropped and quoting normalised: it is not a
  // byte-for-byte copy, and the record carries both digests so the difference is visible rather than surprising.
  assert.notEqual(inspected.sha256, record.entry.sha256);
});

test('9. a build failure leaves no partial artifact', async (t) => {
  const fixture = sandbox(t);
  // A relative import the boundary permits but the resolver cannot satisfy: esbuild must fail, and the failure is
  // reported rather than repaired by editing the Worker.
  const entry = path.join(fixture.worker, 'worker.mjs');
  fs.writeFileSync(entry, `import { helper } from './missing-module.mjs';\n${fs.readFileSync(entry, 'utf8')}`);

  await refusesAsync(() => bundleWorker({ ...argsFor(fixture), write: true }), /^R36B_BUNDLE_FAILED/);
  assert.deepEqual(fs.readdirSync(fixture.output), [], 'a failed build must publish nothing');
  assert.match(fs.readFileSync(entry, 'utf8'), /missing-module\.mjs/);
});

test('10. the Worker and Wrangler sources are unchanged by the experiment', async (t) => {
  for (const [relative, expected] of Object.entries(PINNED)) {
    assert.equal(sha256(fs.readFileSync(path.join(REPO, relative))), expected, `${relative} changed before the build`);
  }
  await bundleWorker({ ...realArgs(t), write: true });
  for (const [relative, expected] of Object.entries(PINNED)) {
    assert.equal(sha256(fs.readFileSync(path.join(REPO, relative))), expected, `${relative} changed during the build`);
  }
});

test('11. the harness has no network or deployment surface, and cannot be read as an attestation', async (t) => {
  const code = fs.readFileSync(MODULE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  for (const banned of ['fetch(', 'node:http', 'node:https', 'node:net', 'node:child_process', 'child_process',
    'spawn', 'execSync', 'execFileSync', 'cloudflared', 'api.cloudflare', 'publish', 'deploy(']) {
    assert.equal(code.includes(banned), false, `the harness must not reference ${banned}`);
  }

  const record = await bundleWorker({ ...realArgs(t), write: false });
  assert.equal(record.claims.artifactPublished, false);
  assert.equal(record.claims.deployed, false);
  assert.equal(record.claims.releaseEvidenceProduced, false);
  assert.equal(assertFeasibilityRecord(record).establishes[0], 'bundleProducibleFromPinnedToolchain');

  // A record cannot be edited into an attestation. (assert.throws matches String(err), so these are unanchored.)
  for (const flag of ['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed']) {
    assert.throws(() => assertFeasibilityRecord({ ...record, claims: { ...record.claims, [flag]: true } }), /R36B_FORGED_CLAIM/);
  }
  assert.throws(() => assertFeasibilityRecord({ ...record, configId: 'something-else' }), /R36B_RECORD_CONFIG_UNKNOWN/);
  assert.throws(() => assertFeasibilityRecord(null), /R36B_RECORD_REQUIRED/);
});

test('12. cleanup stays inside the owned disposable directory', async (t) => {
  const fixture = sandbox(t);
  const record = await bundleWorker(argsFor(fixture));
  assert.deepEqual(fs.readdirSync(fixture.output), [BUNDLE_FILE_NAME]);

  // An unexpected occupant is never deleted: the harness removes only what it wrote.
  fs.writeFileSync(path.join(fixture.output, 'planted.txt'), 'not mine');
  assert.throws(() => removeBundleOutput({ policy: fixture.policy, outputRoot: fixture.output }), /R36B_CLEANUP_UNEXPECTED:planted\.txt/);
  assert.deepEqual(fs.readdirSync(fixture.output).sort(), ['planted.txt', BUNDLE_FILE_NAME]);

  fs.rmSync(path.join(fixture.output, 'planted.txt'));
  const removed = removeBundleOutput({ policy: fixture.policy, outputRoot: fixture.output });
  assert.equal(removed.removed, 1);
  assert.deepEqual(fs.readdirSync(fixture.output), []);

  // The source it read is untouched.
  assert.equal(sha256(fs.readFileSync(path.join(fixture.worker, 'worker.mjs'))), PINNED['infrastructure/cloudflare/worker.mjs']);
  assert.equal(record.output.sha256, record.written.sha256);
});

test('13. a bundle can be associated with an R36A snapshot without changing that record', async (t) => {
  const { output, policy } = scratch(t);
  const roots = { repository: REPO, catalog: CATALOG, worker: WORKER };

  const snapshot = createSourceSnapshot({ policy, outputRoot: output, roots });
  const snapshotAgain = createSourceSnapshot({ policy, outputRoot: output, roots });
  assert.equal(snapshotAgain.combinedSha256, snapshot.combinedSha256);
  assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(snapshotAgain).sort());

  const record = await bundleWorker({ policy, outputRoot: output, roots, snapshot, write: false });
  assert.equal(record.snapshot.combinedSha256, snapshot.combinedSha256);
  assert.equal(record.snapshot.schema, snapshot.schema);
  // The association lives on the bundle record; the snapshot gained no field.
  assert.equal('bundle' in snapshot, false);
  assert.equal(JSON.stringify(snapshot), JSON.stringify(snapshotAgain));
});




