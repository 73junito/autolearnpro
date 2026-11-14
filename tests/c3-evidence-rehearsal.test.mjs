// C3-R36D — integrated evidence rehearsal tests.
//
// Success paths run against the REAL repository, Worker and catalog. Failure paths use a temporary copy of those
// real inputs and change exactly one thing, so each refusal is caused by the change and not by an empty fixture.
// Every assertion goes through the composed contracts; none of them re-implements a rule in test-only code.
//
// Run with: node --test tests/c3-evidence-rehearsal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  cleanRehearsal,
  REHEARSAL_DIRECTORIES,
  REHEARSAL_DOES_NOT_ESTABLISH,
  REHEARSAL_ESTABLISHES,
  REHEARSAL_SCHEMA,
  REHEARSAL_STAGES,
  runEvidenceRehearsal
} from '../infrastructure/c3/build/evidence-rehearsal.mjs';
import {
  computeEnvelopeDigest,
  EVIDENCE_FILE_NAME,
  serializeEvidence,
  verifyEvidenceFile
} from '../infrastructure/c3/build/evidence-envelope.mjs';
import { createSourceSnapshot } from '../infrastructure/c3/build/source-snapshot.mjs';
import { createTargetPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');
const MODULE = path.join(REPO, 'infrastructure', 'c3', 'build', 'evidence-rehearsal.mjs');

const TOOLCHAIN = Object.freeze({
  name: 'esbuild',
  version: JSON.parse(fs.readFileSync(path.join(REPO, 'infrastructure', 'c3', 'build', 'node_modules', 'esbuild', 'package.json'), 'utf8')).version,
  configId: 'alp-c3-r36b-worker-bundle-v1'
});

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r36d-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Three owned directories plus their policy, with an optional repository root for the fixture cases.
function workspace(t, repositoryRoot) {
  const base = tmpDir(t);
  const roots = repositoryRoot ?? REPO;
  const directories = {};
  for (const name of REHEARSAL_DIRECTORIES) {
    directories[name] = path.join(base, name);
    fs.mkdirSync(directories[name]);
  }
  const policy = createTargetPolicy({
    tier: TARGET_TIERS.TEMPORARY,
    rootDir: base,
    targets: ['evidence/evidence.json', 'build/worker.mjs']
  });
  const rootSet = repositoryRoot
    ? { repository: repositoryRoot, catalog: path.join(repositoryRoot, 'apps', 'catalog'), worker: path.join(repositoryRoot, 'infrastructure', 'cloudflare') }
    : { repository: REPO, catalog: CATALOG, worker: WORKER };
  void roots;
  return { base, directories, policy, roots: rootSet };
}

// A copy of the real inputs, so a fixture failure is caused by one deliberate change.
function sandbox(t) {
  const base = tmpDir(t, 'c3-r36d-fixture-');
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

const rehearse = (ws) => runEvidenceRehearsal({
  policy: ws.policy,
  roots: ws.roots,
  directories: ws.directories,
  toolchain: TOOLCHAIN
});

function refuses(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

async function refusesAsync(fn, pattern) {
  await assert.rejects(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

// Generated build output is not source. the apps/catalog/dist directory is produced by the catalog-build suite (and by
// vite build at any time), it is git-ignored, and it is legitimately deleted and recreated by another test file
// that node:test runs in PARALLEL with this one. Including it made this assertion fail whenever that build landed
// inside the snapshot window (C3-R37E, B32). Every other path under apps/catalog is still compared byte for byte.
const GENERATED_OUTPUT = [path.join(CATALOG, 'dist')];
// Filtered from the top-level comparison for the same reason: the build test may create it mid-window.
const GENERATED_TOP_LEVEL = ['dist'];

function digestTree(dir, skip = []) {
  const rows = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      if (skip.includes(absolute)) continue;
      const stats = fs.lstatSync(absolute);
      if (stats.isDirectory()) visit(absolute);
      else rows.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute)), stats.size]);
    }
  };
  visit(dir);
  return rows;
}

test('1. the four contracts compose end to end against the real repository', async (t) => {
  const ws = workspace(t);
  const verdict = await rehearse(ws);

  assert.equal(verdict.schema, REHEARSAL_SCHEMA);
  assert.equal(verdict.ok, true);
  assert.deepEqual([...verdict.stages], [...REHEARSAL_STAGES]);

  assert.equal(verdict.mapping.inputs, 9);
  assert.deepEqual([...verdict.mapping.roles], ['catalog', 'repository', 'worker']);

  assert.equal(verdict.snapshot.entries, 8);
  assert.equal(verdict.snapshot.declared, 9);
  assert.equal(verdict.snapshot.exclusions, 3);
  assert.match(verdict.snapshot.combinedSha256, /^[a-f0-9]{64}$/);

  assert.equal(verdict.bundle.file, 'worker.mjs');
  assert.equal(verdict.bundle.findings, 0);
  assert.ok(verdict.bundle.bytes > 0);

  assert.equal(verdict.envelope.schema, 'alp-c3-offline-evidence-envelope');
  assert.match(verdict.envelope.sha256, /^[a-f0-9]{64}$/);
  assert.ok(verdict.envelope.fileBytes > 0);

  assert.equal(verdict.verification.ok, true);
  assert.deepEqual([...verdict.establishes], [...REHEARSAL_ESTABLISHES]);
  assert.deepEqual([...verdict.doesNotEstablish], [...REHEARSAL_DOES_NOT_ESTABLISH]);
  for (const flag of ['sourceCommitVerified', 'ciAttested', 'publicationAuthorized', 'deployAllowed']) {
    assert.equal(verdict.claims[flag], false, `${flag} must be false`);
  }

  // Both artifacts are where the rehearsal said, and nowhere else; the snapshot scratch stays empty.
  assert.deepEqual(fs.readdirSync(ws.directories.build), ['worker.mjs']);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), [EVIDENCE_FILE_NAME]);
  assert.deepEqual(fs.readdirSync(ws.directories.snapshot), []);
});

test('2. two independent environments produce an identical verdict', async (t) => {
  const first = await rehearse(workspace(t));
  const second = await rehearse(workspace(t));

  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  assert.equal(second.envelope.sha256, first.envelope.sha256);
  assert.equal(second.envelope.fileSha256, first.envelope.fileSha256);
  assert.equal(second.bundle.sha256, first.bundle.sha256);
});

test('3. a modified Worker source is detected, and a boundary violation is refused outright', async (t) => {
  const repository = sandbox(t);
  const entry = path.join(repository, 'infrastructure', 'cloudflare', 'worker.mjs');
  const original = fs.readFileSync(entry, 'utf8');

  const baseline = await rehearse(workspace(t, repository));

  // A benign edit changes the source, the bundle and the envelope: nothing is silently accepted as "the same".
  fs.writeFileSync(entry, original.replace('"scaffold"', '"scaffold-r36d"'));
  const changed = await rehearse(workspace(t, repository));
  assert.notEqual(changed.bundle.sha256, baseline.bundle.sha256);
  assert.notEqual(changed.envelope.sha256, baseline.envelope.sha256);

  // A capability violation never reaches the bundler.
  fs.writeFileSync(entry, `import pg from 'pg';\n${original}`);
  await refusesAsync(() => rehearse(workspace(t, repository)), /^R35_WORKER_IMPORT_FORBIDDEN:pg/);
});

test('4. a modified repository input is detected or refused', async (t) => {
  const repository = sandbox(t);
  const baseline = await rehearse(workspace(t, repository));

  const manifest = path.join(repository, 'package.json');
  const original = fs.readFileSync(manifest);
  fs.writeFileSync(manifest, Buffer.concat([original, Buffer.from('\n')]));
  const changed = await rehearse(workspace(t, repository));
  assert.notEqual(changed.snapshot.combinedSha256, baseline.snapshot.combinedSha256);

  // A required input that disappears is refused by the mapping gate.
  fs.rmSync(path.join(repository, 'package-lock.json'));
  await refusesAsync(() => rehearse(workspace(t, repository)), /^R35_INPUT_MISSING:repository\/package-lock\.json/);
});

// Verification with an independent (stub) expectation, for the cases that must fail before the source comparison.
const verifyStub = (ws, overrides = {}) => verifyEvidenceFile({
  policy: ws.policy,
  evidenceRoot: ws.directories.evidence,
  artifactRoot: ws.directories.build,
  snapshot: { schema: 'alp-c3-r36a-multi-root-snapshot', combinedSha256: 'f'.repeat(64), entries: [] },
  toolchain: TOOLCHAIN,
  ...overrides
});

test('5. an incorrect source snapshot fails verification', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);

  // The artifact is genuine here; only the expected source is wrong. Verification must refuse on that basis alone.
  refuses(() => verifyStub(ws), /^R36C_SNAPSHOT_MISMATCH/);

  // The true snapshot — independently re-derived — still verifies, which proves the refusal was the mismatch and
  // not damage to the artifact or the evidence file.
  const snapshot = createSourceSnapshot({ policy: ws.policy, outputRoot: ws.directories.snapshot, roots: ws.roots });
  const good = verifyEvidenceFile({
    policy: ws.policy,
    evidenceRoot: ws.directories.evidence,
    artifactRoot: ws.directories.build,
    snapshot,
    toolchain: TOOLCHAIN
  });
  assert.equal(good.ok, true);
});

test('6. modified bundle bytes fail verification', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  fs.appendFileSync(path.join(ws.directories.build, 'worker.mjs'), '// tampered\n');

  refuses(() => verifyStub(ws), /^R36C_ARTIFACT_MISMATCH/);
});

test('7. corrupted persisted evidence fails verification', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  const file = path.join(ws.directories.evidence, EVIDENCE_FILE_NAME);
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace(/"artifactBytes": (\d+)/, (match, digits) => `"artifactBytes": ${Number(digits) + 2}`));

  refuses(() => verifyStub(ws), /^R36C_DIGEST_MISMATCH/);
});

test('8. a missing evidence file is refused, never regenerated', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  fs.rmSync(path.join(ws.directories.evidence, EVIDENCE_FILE_NAME));

  refuses(() => verifyStub(ws), /^R36C_EVIDENCE_MISSING/);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
});

test('9. forged authority in the persisted evidence is refused', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  const file = path.join(ws.directories.evidence, EVIDENCE_FILE_NAME);
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const flag of ['publicationAuthorized', 'deployAllowed', 'sourceCommitVerified', 'ciAttested']) {
    const forged = { ...envelope, [flag]: true };
    forged.envelopeSha256 = computeEnvelopeDigest(forged);
    fs.writeFileSync(file, serializeEvidence(forged));
    refuses(() => verifyStub(ws), new RegExp(`^R36C_FORGED_CLAIM:${flag}`));
  }
});

test('10. a nonempty rehearsal directory is refused', async (t) => {
  const ws = workspace(t);
  fs.writeFileSync(path.join(ws.directories.build, 'leftover.txt'), 'stale');
  await refusesAsync(() => rehearse(ws), /^R36D_DIRECTORY_NOT_EMPTY:build/);
  assert.deepEqual(fs.readdirSync(ws.directories.build), ['leftover.txt'], 'the refusal must not clear the directory');

  const evidenceFull = workspace(t);
  fs.writeFileSync(path.join(evidenceFull.directories.evidence, EVIDENCE_FILE_NAME), '{}');
  await refusesAsync(() => rehearse(evidenceFull), /^R36D_DIRECTORY_NOT_EMPTY:evidence/);
});

test('11. an unauthorised temporary root is refused', async (t) => {
  const ws = workspace(t);
  const outside = tmpDir(t, 'c3-r36d-outside-');

  await refusesAsync(() => runEvidenceRehearsal({
    policy: ws.policy,
    roots: ws.roots,
    directories: { ...ws.directories, build: outside },
    toolchain: TOOLCHAIN
  }), /^R36D_DIRECTORY_OUTSIDE_POLICY:build/);

  // Directory reuse and nesting are refused too: a "clean" root may not double as a snapshot scratch.
  await refusesAsync(() => runEvidenceRehearsal({
    policy: ws.policy,
    roots: ws.roots,
    directories: { ...ws.directories, snapshot: ws.directories.build },
    toolchain: TOOLCHAIN
  }), /^R36D_DIRECTORY_REUSED/);

  // A nested directory is refused by the emptiness rule first — an outer directory that contains the inner one is
  // not empty — which is why the nested case reports NOT_EMPTY:build rather than NESTED. Both are refusals, and the
  // code that fires first is named rather than assumed.
  const nested = path.join(ws.directories.build, 'inner');
  fs.mkdirSync(nested);
  await refusesAsync(() => runEvidenceRehearsal({
    policy: ws.policy,
    roots: ws.roots,
    directories: { ...ws.directories, evidence: nested },
    toolchain: TOOLCHAIN
  }), /^R36D_DIRECTORY_NOT_EMPTY:build/);
});

test('12. a symlink or junction directory is refused', async (t) => {
  const ws = workspace(t);
  const outside = tmpDir(t, 'c3-r36d-link-target-');
  const link = path.join(tmpDir(t, 'c3-r36d-link-holder-'), 'build-link');

  try {
    fs.symlinkSync(outside, link, 'junction');
  } catch {
    // A host that cannot create links is a capability limit, and the diagnostic says so rather than passing.
    t.diagnostic('host refused to create a directory link; junction case not exercised in this run');
    return;
  }

  await refusesAsync(() => runEvidenceRehearsal({
    policy: ws.policy,
    roots: ws.roots,
    directories: { ...ws.directories, build: link },
    toolchain: TOOLCHAIN
  }), /^R36D_DIRECTORY_(SYMLINK|OUTSIDE_POLICY):build/);
});

test('13. a bundling failure stops the rehearsal with no partial publication', async (t) => {
  const repository = sandbox(t);
  const entry = path.join(repository, 'infrastructure', 'cloudflare', 'worker.mjs');
  fs.writeFileSync(entry, `import { helper } from './absent-module.mjs';\n${fs.readFileSync(entry, 'utf8')}`);

  const ws = workspace(t, repository);
  await refusesAsync(() => rehearse(ws), /^R36B_BUNDLE_FAILED/);

  // Nothing was published: no bundle, no evidence, and the source left exactly as the fixture wrote it.
  assert.deepEqual(fs.readdirSync(ws.directories.build), []);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
  assert.match(fs.readFileSync(entry, 'utf8'), /absent-module\.mjs/);
});

test('14. an interrupted evidence write is refused and never repaired', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  const file = path.join(ws.directories.evidence, EVIDENCE_FILE_NAME);
  const full = fs.readFileSync(file, 'utf8');

  // Simulate a crash mid-write, then confirm both halves of the composition refuse it.
  fs.writeFileSync(file, full.slice(0, Math.floor(full.length * 0.5)));
  refuses(() => verifyStub(ws), /^R36C_EVIDENCE_UNREADABLE/);

  // A second rehearsal will not overwrite the damaged file, so nothing is silently "fixed".
  const build2 = path.join(ws.base, 'build2');
  const snapshot2 = path.join(ws.base, 'snapshot2');
  fs.mkdirSync(build2);
  fs.mkdirSync(snapshot2);
  await refusesAsync(() => runEvidenceRehearsal({
    policy: ws.policy,
    roots: ws.roots,
    directories: { build: build2, snapshot: snapshot2, evidence: ws.directories.evidence },
    toolchain: TOOLCHAIN
  }), /^R36D_DIRECTORY_NOT_EMPTY:evidence/);

  assert.equal(fs.readFileSync(file, 'utf8').length, Math.floor(full.length * 0.5), 'the partial file is left as it was');
});

test('15. a failed rehearsal publishes nothing', async (t) => {
  const repository = sandbox(t);
  fs.rmSync(path.join(repository, 'package-lock.json'));
  const ws = workspace(t, repository);

  await refusesAsync(() => rehearse(ws), /^R35_INPUT_MISSING/);
  assert.deepEqual(fs.readdirSync(ws.directories.build), []);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), []);
  assert.deepEqual(fs.readdirSync(ws.directories.snapshot), []);
});

test('16. the rehearsal never mutates the source tree', async (t) => {
  // dist is excluded because it is generated output owned by the catalog-build test, which runs concurrently.
  // The top-level layout is compared as well, so creating a new directory or file beside the sources still fails.
  const before = {
    catalog: digestTree(CATALOG, GENERATED_OUTPUT),
    catalogTopLevel: fs.readdirSync(CATALOG).filter((name) => !GENERATED_TOP_LEVEL.includes(name)).sort(),
    worker: digestTree(WORKER)
  };
  const manifestBefore = sha256(fs.readFileSync(path.join(REPO, 'package.json')));
  const lockBefore = sha256(fs.readFileSync(path.join(REPO, 'package-lock.json')));

  await rehearse(workspace(t));

  assert.deepEqual({
    catalog: digestTree(CATALOG, GENERATED_OUTPUT),
    catalogTopLevel: fs.readdirSync(CATALOG).filter((name) => !GENERATED_TOP_LEVEL.includes(name)).sort(),
    worker: digestTree(WORKER)
  }, before);
  assert.equal(sha256(fs.readFileSync(path.join(REPO, 'package.json'))), manifestBefore);
  assert.equal(sha256(fs.readFileSync(path.join(REPO, 'package-lock.json'))), lockBefore);
});

test('17. cleanup affects only the directories the rehearsal owns', async (t) => {
  const ws = workspace(t);
  await rehearse(ws);
  fs.writeFileSync(path.join(ws.directories.evidence, 'keep-me.txt'), 'unrelated');

  const cleaned = cleanRehearsal({ policy: ws.policy, directories: ws.directories });
  assert.equal(cleaned.removed.length, 2);
  assert.deepEqual(fs.readdirSync(ws.directories.evidence), ['keep-me.txt'], 'an unrelated file survives cleanup');
  assert.deepEqual(fs.readdirSync(ws.directories.build), []);
  assert.deepEqual(fs.readdirSync(ws.directories.snapshot), [], 'the snapshot scratch is never cleaned by this call');

  // A second cleanup finds nothing to remove and fails loudly rather than pretending success.
  assert.throws(() => cleanRehearsal({ policy: ws.policy, directories: ws.directories }), /R36C_EVIDENCE_MISSING/);
});

test('18. the rehearsal has no network, cloud or deployment surface', async (t) => {
  const code = fs.readFileSync(MODULE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  for (const banned of ['fetch(', 'node:http', 'node:https', 'node:net', 'node:child_process', 'child_process',
    'spawn', 'execSync', 'execFileSync', 'api.github', 'github.com', 'cloudflare', 'wrangler', 'deploy(', 'r2.']) {
    assert.equal(code.includes(banned), false, `the rehearsal must not reference ${banned}`);
  }

  // Multi-line import blocks are matched too: `[^'"]*?` crosses newlines but stops at the first quote, so
  // `import {\n a,\n b\n} from './x.mjs'` yields './x.mjs' rather than being skipped.
  const imports = [...code.matchAll(/(?:^|\n)\s*import\b[^'"]*?['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, [
    '../library/target-policy.mjs',
    './build-input-contract.mjs',
    './evidence-envelope.mjs',
    './source-snapshot.mjs',
    './worker-bundle.mjs',
    'node:crypto',
    'node:fs',
    'node:path'
  ]);

  // The verdict says the same thing at runtime.
  const verdict = await rehearse(workspace(t));
  assert.deepEqual([...verdict.doesNotEstablish], [...REHEARSAL_DOES_NOT_ESTABLISH]);
  assert.deepEqual({ ...verdict.claims }, {
    sourceCommitVerified: false, ciAttested: false, publicationAuthorized: false, deployAllowed: false
  });
});




