// C3-R36C — offline evidence persistence and tamper-detection tests.
//
// Every fixture lives in a disposable temporary directory under an R28 temporary policy. The real Worker, the real
// catalog and the real root lockfile are the subject; nothing is deployed, published or attested.
//
// Run with: node --test tests/c3-offline-evidence-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  canonicalEvidenceText,
  computeEnvelopeDigest,
  createEvidenceEnvelope,
  ENVELOPE_SCHEMA,
  ENVELOPE_VERSION,
  EVIDENCE_FILE_NAME,
  NOT_ESTABLISHED,
  removeEvidenceFile,
  serializeEvidence,
  VERIFIED_LOCALLY,
  verifyEvidenceFile,
  writeEvidenceEnvelope
} from '../infrastructure/c3/build/evidence-envelope.mjs';
import { createSourceSnapshot } from '../infrastructure/c3/build/source-snapshot.mjs';
import { bundleWorker } from '../infrastructure/c3/build/worker-bundle.mjs';
import { createTargetPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');
const MODULE = path.join(REPO, 'infrastructure', 'c3', 'build', 'evidence-envelope.mjs');

// The toolchain identity is supplied by the caller from the isolated install, never read from the module's own
// environment at digest time.
const TOOLCHAIN = Object.freeze({
  name: 'esbuild',
  version: JSON.parse(fs.readFileSync(path.join(REPO, 'infrastructure', 'c3', 'build', 'node_modules', 'esbuild', 'package.json'), 'utf8')).version,
  configId: 'alp-c3-r36b-worker-bundle-v1'
});

const ROOTS = Object.freeze({ repository: REPO, catalog: CATALOG, worker: WORKER });
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r36c-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Three directories under one policy root, because the R35/R36A mapping gate requires an empty output root: the
// bundle, the evidence file and the snapshot scratch are therefore kept apart.
function workspace(t) {
  const base = tmpDir(t);
  const build = path.join(base, 'build');
  const evidence = path.join(base, 'evidence');
  const verify = path.join(base, 'verify');
  for (const dir of [build, evidence, verify]) fs.mkdirSync(dir);
  const policy = createTargetPolicy({
    tier: TARGET_TIERS.TEMPORARY,
    rootDir: base,
    targets: ['evidence/evidence.json', 'build/worker.mjs']
  });
  return { base, build, evidence, verify, policy };
}

// Produces a real snapshot, a real bundle and a real envelope, writing both artifacts.
async function produce(t) {
  const ws = workspace(t);
  const snapshot = createSourceSnapshot({ policy: ws.policy, outputRoot: ws.verify, roots: ROOTS });
  const bundle = await bundleWorker({ policy: ws.policy, outputRoot: ws.build, roots: ROOTS, write: true });
  const envelope = createEvidenceEnvelope({ snapshot, bundle, toolchain: TOOLCHAIN });
  const written = writeEvidenceEnvelope({ policy: ws.policy, evidenceRoot: ws.evidence, envelope, roots: ROOTS });
  return { ws, snapshot, bundle, envelope, written };
}

const verifyWith = (ws, snapshot) => verifyEvidenceFile({
  policy: ws.policy,
  evidenceRoot: ws.evidence,
  artifactRoot: ws.build,
  snapshot,
  toolchain: TOOLCHAIN
});

function refuses(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

// Writes arbitrary bytes as the evidence file, for cases that need a hand-crafted document.
function plant(ws, text, name = EVIDENCE_FILE_NAME) {
  const target = path.join(ws.evidence, name);
  fs.writeFileSync(target, text);
  return target;
}

const reseal = (envelope) => ({ ...envelope, envelopeSha256: computeEnvelopeDigest(envelope) });

function digestTree(dir) {
  const rows = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const stats = fs.lstatSync(absolute);
      if (stats.isDirectory()) visit(absolute);
      else rows.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute)), stats.size]);
    }
  };
  visit(dir);
  return rows;
}

test('1. serialization and hashing are deterministic and order-independent', async (t) => {
  const first = await produce(t);
  const second = await produce(t);

  assert.equal(second.envelope.envelopeSha256, first.envelope.envelopeSha256, 'same inputs must yield the same digest');
  assert.equal(canonicalEvidenceText(second.envelope), canonicalEvidenceText(first.envelope));

  // No timestamp, absolute path, hostname or random value may influence the digest.
  const text = canonicalEvidenceText(first.envelope);
  assert.equal(/[A-Za-z]:\\|\/tmp\/|20\d\d-\d\d-\d\dT/.test(text), false, 'the digest input must not contain machine-specific values');

  // The stored JSON may be reordered without affecting verification: the digest is over the canonical rows.
  const reordered = {
    envelopeSha256: first.envelope.envelopeSha256,
    deployAllowed: first.envelope.deployAllowed,
    envelopeSchema: first.envelope.envelopeSchema,
    ...Object.fromEntries(Object.entries(first.envelope).filter(([key]) => !['envelopeSha256', 'deployAllowed', 'envelopeSchema'].includes(key)))
  };
  const planted = plant(first.ws, `${JSON.stringify(reordered, null, 2)}\n`);
  assert.ok(planted);
  assert.equal(verifyWith(first.ws, first.snapshot).ok, true);
});

test('2. an envelope persists into an authorised temporary directory', async (t) => {
  const { ws, envelope, written } = await produce(t);

  assert.equal(written.ok, true);
  assert.ok(written.bytes > 0);
  assert.equal(written.envelopeSha256, envelope.envelopeSha256);
  assert.ok(written.path.startsWith(fs.realpathSync(ws.evidence)));
  assert.equal(fs.existsSync(written.path), true);
  assert.match(written.durable, /fsync/);
  assert.equal(sha256(fs.readFileSync(written.path)), written.sha256);
});

test('3. an independent reload verifies against the real artifact and source', async (t) => {
  const { ws, snapshot, bundle } = await produce(t);
  const result = verifyWith(ws, snapshot);

  assert.equal(result.ok, true);
  assert.equal(result.artifact.path, 'worker.mjs');
  assert.equal(result.artifact.sha256, bundle.output.sha256);
  assert.equal(result.artifact.bytes, bundle.output.bytes);
  assert.equal(result.source.sha256, snapshot.entries.find((entry) => entry.path.endsWith('/worker.mjs')).sha256);
  assert.equal(result.snapshot.combinedSha256, snapshot.combinedSha256);
  assert.deepEqual([...result.establishes], [...VERIFIED_LOCALLY]);
  assert.deepEqual([...result.doesNotEstablish], [...NOT_ESTABLISHED]);
  assert.deepEqual({ ...result.claims }, {
    sourceCommitVerified: false, ciAttested: false, publicationAuthorized: false, deployAllowed: false
  });
});

test('4. a single corrupted byte is detected', async (t) => {
  const { ws, snapshot, written } = await produce(t);
  const bytes = fs.readFileSync(written.path);
  // Flip the last character of the recorded artifact count: still valid JSON, wrong content.
  const text = bytes.toString('utf8');
  fs.writeFileSync(written.path, text.replace(/"artifactBytes": (\d+)/, (match, digits) => `"artifactBytes": ${Number(digits) + 1}`));
  refuses(() => verifyWith(ws, snapshot), /^R36C_/);

  // A byte flipped inside a hash value changes the digest.
  const corrupted = text.replace(/"artifactSha256": "([a-f0-9])/, (match, character) => `"artifactSha256": "${character === 'a' ? 'b' : 'a'}`);
  fs.writeFileSync(written.path, corrupted);
  refuses(() => verifyWith(ws, snapshot), /^R36C_(DIGEST_MISMATCH|HASH_INVALID)/);
});

test('5. a forged snapshot digest fails even when the envelope is re-sealed', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  const forged = reseal({ ...envelope, snapshotCombinedSha256: 'a'.repeat(64) });
  plant(ws, serializeEvidence(forged));
  refuses(() => verifyWith(ws, snapshot), /^R36C_SNAPSHOT_MISMATCH/);
});

test('6. a forged bundle digest fails even when the envelope is re-sealed', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);

  plant(ws, serializeEvidence(reseal({ ...envelope, artifactSha256: 'b'.repeat(64) })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_ARTIFACT_MISMATCH:sha256/);

  plant(ws, serializeEvidence(reseal({ ...envelope, artifactBytes: envelope.artifactBytes + 1 })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_ARTIFACT_MISMATCH:size/);

  // Re-sealing a forged *source* digest is refused too, because the source is re-derived, not read from the file.
  plant(ws, serializeEvidence(reseal({ ...envelope, workerSourceSha256: 'c'.repeat(64) })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_SOURCE_MISMATCH:sha256/);
});

test('7. a missing bundle is refused, never rebuilt', async (t) => {
  const { ws, snapshot } = await produce(t);
  fs.rmSync(path.join(ws.build, 'worker.mjs'));

  refuses(() => verifyWith(ws, snapshot), /^R36C_ARTIFACT_MISSING/);
  // Verification does not resurrect the artifact.
  assert.equal(fs.existsSync(path.join(ws.build, 'worker.mjs')), false);
});

test('8. a duplicated field in the stored bytes is refused', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  // JSON.parse keeps the last duplicate, so this must be caught in the raw text before parsing.
  const text = serializeEvidence(envelope).replace('{\n', `{\n  "artifactSha256": "${envelope.artifactSha256}",\n`);
  plant(ws, text);
  refuses(() => verifyWith(ws, snapshot), /^R36C_DUPLICATE_FIELD:artifactSha256/);
});

test('9. an unknown schema version is refused', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  assert.equal(envelope.envelopeVersion, ENVELOPE_VERSION);
  assert.equal(envelope.envelopeSchema, ENVELOPE_SCHEMA);

  plant(ws, serializeEvidence(reseal({ ...envelope, envelopeVersion: 2 })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_SCHEMA_UNSUPPORTED:2/);

  plant(ws, serializeEvidence(reseal({ ...envelope, envelopeSchema: 'alp-c3-r22-offline-evidence' })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_HISTORICAL_R22_REQUIRES_DECISION/);
});

test('10. an additional unexpected field is refused', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  plant(ws, serializeEvidence(reseal({ ...envelope, approvedBy: 'someone' })));
  refuses(() => verifyWith(ws, snapshot), /^R36C_FIELD_UNEXPECTED:approvedBy/);

  const missing = { ...envelope };
  delete missing.artifactBytes;
  plant(ws, serializeEvidence(missing));
  refuses(() => verifyWith(ws, snapshot), /^R36C_FIELD_MISSING:artifactBytes/);
});

test('11. forged Git and CI provenance is refused', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  for (const flag of ['sourceCommitVerified', 'ciAttested']) {
    plant(ws, serializeEvidence(reseal({ ...envelope, [flag]: true })));
    refuses(() => verifyWith(ws, snapshot), new RegExp(`^R36C_FORGED_CLAIM:${flag}`));
  }
  // The writer refuses to create such a record in the first place.
  const bundle = {
    entry: { sha256: envelope.workerSourceSha256 },
    output: { file: 'worker.mjs', sha256: envelope.artifactSha256, bytes: envelope.artifactBytes },
    configId: envelope.buildConfigId
  };
  const snapshotStub = { schema: envelope.snapshotSchema, combinedSha256: envelope.snapshotCombinedSha256, entries: snapshot.entries };
  const created = createEvidenceEnvelope({ snapshot: snapshotStub, bundle, toolchain: TOOLCHAIN });
  assert.equal(created.sourceCommitVerified, false);
  assert.equal(created.ciAttested, false);
});

test('12. forged publication and deployment authority is refused', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  for (const flag of ['publicationAuthorized', 'deployAllowed']) {
    plant(ws, serializeEvidence(reseal({ ...envelope, [flag]: true })));
    refuses(() => verifyWith(ws, snapshot), new RegExp(`^R36C_FORGED_CLAIM:${flag}`));
  }
});

test('13. an existing destination is refused rather than overwritten', async (t) => {
  const { ws, envelope, written } = await produce(t);
  const before = sha256(fs.readFileSync(written.path));

  refuses(() => writeEvidenceEnvelope({ policy: ws.policy, evidenceRoot: ws.evidence, envelope, roots: ROOTS }), /^R36C_DESTINATION_EXISTS/);
  assert.equal(sha256(fs.readFileSync(written.path)), before, 'the existing evidence must be untouched');

  plant(ws, 'not evidence', 'other.json');
  refuses(() => writeEvidenceEnvelope({ policy: ws.policy, evidenceRoot: ws.evidence, envelope, roots: ROOTS, fileName: 'other.json' }), /^R36C_DESTINATION_EXISTS/);
});

test('14. policy containment, link escape and source-directory placement are refused', async (t) => {
  const { ws, envelope } = await produce(t);
  const outside = tmpDir(t, 'c3-r36c-outside-');

  refuses(() => writeEvidenceEnvelope({ policy: ws.policy, evidenceRoot: outside, envelope, roots: ROOTS }), /^R36C_EVIDENCE_ROOT_OUTSIDE_POLICY/);
  refuses(() => verifyEvidenceFile({
    policy: ws.policy,
    evidenceRoot: outside,
    artifactRoot: ws.build,
    snapshot: { combinedSha256: 'a'.repeat(64) },
    toolchain: TOOLCHAIN
  }), /^R36C_EVIDENCE_ROOT_OUTSIDE_POLICY/);

  // A junction pointing out of the policy is refused, because containment is re-derived from the real path.
  let linkable = true;
  const link = path.join(tmpDir(t, 'c3-r36c-link-'), 'evidence-link');
  try {
    fs.symlinkSync(outside, link, 'junction');
  } catch {
    linkable = false;
    t.diagnostic('host refused to create a directory link; junction case not exercised in this run');
  }
  if (linkable) {
    refuses(() => writeEvidenceEnvelope({ policy: ws.policy, evidenceRoot: link, envelope, roots: ROOTS }), /^R36C_EVIDENCE_ROOT_OUTSIDE_POLICY/);
  }

  // Placing evidence inside a source directory is refused even when the policy would allow the path.
  const insideSource = workspace(t);
  refuses(
    () => writeEvidenceEnvelope({
      policy: insideSource.policy,
      evidenceRoot: insideSource.evidence,
      envelope,
      roots: { repository: insideSource.base, catalog: CATALOG, worker: WORKER }
    }),
    /^R36C_EVIDENCE_ROOT_INSIDE_SOURCE/
  );
});

test('15. an interrupted write is detected and never repaired', async (t) => {
  const { ws, snapshot, envelope } = await produce(t);
  const full = serializeEvidence(envelope);
  plant(ws, full.slice(0, Math.floor(full.length * 0.6)));

  refuses(() => verifyWith(ws, snapshot), /^R36C_EVIDENCE_UNREADABLE/);
  const truncated = fs.readFileSync(path.join(ws.evidence, EVIDENCE_FILE_NAME), 'utf8');
  assert.equal(truncated.length, Math.floor(full.length * 0.6), 'verification must not rewrite the partial file');
});

test('16. repeated verification is deterministic and mutates nothing', async (t) => {
  const { ws, snapshot } = await produce(t);
  const before = { evidence: digestTree(ws.evidence), build: digestTree(ws.build), verify: digestTree(ws.verify) };

  const first = JSON.stringify(verifyWith(ws, snapshot));
  const second = JSON.stringify(verifyWith(ws, snapshot));
  assert.equal(second, first);

  const after = { evidence: digestTree(ws.evidence), build: digestTree(ws.build), verify: digestTree(ws.verify) };
  assert.deepEqual(after, before, 'verification must not touch any byte');
});

test('17. cleanup removes only the evidence file this module owns', async (t) => {
  const { ws, written } = await produce(t);
  plant(ws, 'unrelated', 'keep-me.txt');

  const removed = removeEvidenceFile({ policy: ws.policy, evidenceRoot: ws.evidence });
  assert.equal(removed.removed, 1);
  assert.equal(fs.existsSync(written.path), false);
  assert.deepEqual(fs.readdirSync(ws.evidence), ['keep-me.txt']);

  // A second removal finds nothing and says so, rather than succeeding quietly.
  refuses(() => removeEvidenceFile({ policy: ws.policy, evidenceRoot: ws.evidence }), /^R36C_EVIDENCE_MISSING/);
});

test('18. the module has no network, cloud or deployment surface', () => {
  const code = fs.readFileSync(MODULE, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  for (const banned of ['fetch(', 'node:http', 'node:https', 'node:net', 'node:child_process', 'child_process',
    'spawn', 'execSync', 'execFileSync', 'api.github', 'github.com', 'cloudflare', 'wrangler', 'deploy(', 'r2.']) {
    assert.equal(code.includes(banned), false, `the evidence module must not reference ${banned}`);
  }

  const imports = [...code.matchAll(/(?:^|\n)\s*import[^;\n]*?from\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, [
    '../library/target-policy.mjs',
    './source-snapshot.mjs',
    './worker-bundle.mjs',
    'node:crypto',
    'node:fs',
    'node:path'
  ]);
});



