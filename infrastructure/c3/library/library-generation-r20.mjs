// C3-R28 Phase B: isolated port of the C3-R20 content-addressed generation contract.
//
// SOURCE BASELINE (reviewed, unmodified): lib/assets/library-generation-r20.mjs
//   sha256 0bbca48e29988e4642f91dac6c9dd3d6026567d37983f69f3cfd1e3a702b03a0 (86 lines, staging workspace)
//
// Immutable, content-addressed generations in SCRATCH STORAGE ONLY. This module cannot publish: the record
// carries publicationAuthorized:false, the output root must resolve inside the OS temp directory, and it must
// sit inside an authorised temporary policy. Temporary generation succeeding is not publication authority.
//
// NODE-ONLY. Never import from the Cloudflare Worker, a request handler, or a route.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { inspectLibraryPair } from './library-pair-reader.mjs';
import { JOURNAL_NAME, LOCK_NAME, assertTargetsApproved } from './library-pair-recovery.mjs';
import { assertPolicy } from './target-policy.mjs';

const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());
const manifestName = 'generation.json';
const generationName = (id) => 'sha256-' + id;

// R28 ADAPTATION 1 - the target set is caller-supplied and re-validated here. The source closed over
// LIBRARY_TARGETS; this port has no default and no staging fallback.
function approvedTargets(allowedTargets) {
  try {
    return assertTargetsApproved(allowedTargets);
  } catch {
    throw Error('R20_TARGETS_NOT_APPROVED');
  }
}

// R28 ADAPTATION 2 - inspectLibraryPair now requires an approved target list and applies realpath
// containment, so every source read is authorized and escape-checked by the R27 contract.
function sourceBytes(sourceRoot, allowedTargets) {
  const targets = approvedTargets(allowedTargets);
  const root = fs.realpathSync(sourceRoot);
  const result = inspectLibraryPair({ rootDir: root, allowedTargets: targets });
  if (!result.ok) throw Error('R20_SOURCE_UNSAFE:' + result.reason);
  const buffers = targets.map((name) => fs.readFileSync(path.join(root, name)));
  if (!same(buffers.map(digest), result.hashes.map((x) => x.sha256))) throw Error('R20_SOURCE_CHANGED');
  const second = inspectLibraryPair({ rootDir: root, allowedTargets: targets });
  if (!second.ok || !same(second.hashes.map((x) => x.sha256), result.hashes.map((x) => x.sha256))) {
    throw Error('R20_SOURCE_CHANGED');
  }
  if (fs.existsSync(path.join(root, 'specs', JOURNAL_NAME)) || fs.existsSync(path.join(root, 'specs', LOCK_NAME))) {
    throw Error('R20_SOURCE_BUSY');
  }
  return { buffers, targets };
}

export function describeGeneration({ sourceRoot, allowedTargets } = {}) {
  const { buffers, targets } = sourceBytes(sourceRoot, allowedTargets);
  const content = Object.fromEntries(targets.map((name, i) => [name, digest(buffers[i])]));
  const id = digest(Buffer.from(JSON.stringify(content)));
  return { schema: 'alp-c3-r20-generation-v1', generationId: id, sourceHashes: content, publicationAuthorized: false };
}

// R28 ADAPTATION 3 - verifyGeneration gains the expected target set, because the manifest's
// R20_INVALID_TARGET_SET check is meaningless without knowing which set is expected.
export function verifyGeneration({ generationDir, allowedTargets } = {}) {
  try {
    const targets = approvedTargets(allowedTargets);
    const dir = fs.realpathSync(generationDir);
    const manifestPath = path.join(dir, manifestName);
    if (fs.lstatSync(manifestPath).isSymbolicLink()) throw Error('R20_SYMLINK');
    const record = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (record.schema !== 'alp-c3-r20-generation-v1' || record.publicationAuthorized !== false
      || typeof record.generationId !== 'string' || !/^[a-f0-9]{64}$/.test(record.generationId)
      || path.basename(dir) !== generationName(record.generationId)) throw Error('R20_INVALID_MANIFEST');
    if (Object.keys(record.sourceHashes).sort().join('|') !== [...targets].sort().join('|')) throw Error('R20_INVALID_TARGET_SET');
    const hashes = [];
    for (const name of targets) {
      const target = path.join(dir, name);
      if (fs.lstatSync(target).isSymbolicLink()) throw Error('R20_SYMLINK');
      const hash = digest(fs.readFileSync(target));
      if (hash !== record.sourceHashes[name]) throw Error('R20_TAMPERED');
      hashes.push(hash);
    }
    const id = digest(Buffer.from(JSON.stringify(Object.fromEntries(targets.map((name, i) => [name, hashes[i]])))));
    if (id !== record.generationId) throw Error('R20_ID_MISMATCH');
    return { ok: true, generationId: id, hashes: record.sourceHashes };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export function materializeGeneration({ policy, sourceRoot, outputRoot, enabled = false } = {}) {
  if (enabled !== true) throw Error('R20_DISABLED');
  // R28 ADAPTATION 4 - an authorised temporary policy is required, and the output must sit inside it.
  // assertPolicy re-derives every invariant, so a forged policy object cannot widen the boundary.
  const authorised = assertPolicy(policy);
  const targets = authorised.targets;
  // Strict scratch-only write policy: no changes to source workspace or production.
  const parent = fs.realpathSync(outputRoot), temp = fs.realpathSync(os.tmpdir());
  if (!inside(temp, parent)) throw Error('R20_OUTPUT_NOT_SCRATCH');
  const inPolicy = parent.toLowerCase() === authorised.rootDir.toLowerCase() || inside(authorised.rootDir, parent);
  if (!inPolicy) throw Error('R20_OUTPUT_OUTSIDE_POLICY');
  const { buffers } = sourceBytes(sourceRoot, targets);
  const content = Object.fromEntries(targets.map((name, i) => [name, digest(buffers[i])]));
  const record = { schema: 'alp-c3-r20-generation-v1', generationId: digest(Buffer.from(JSON.stringify(content))), sourceHashes: content, publicationAuthorized: false };
  const destination = path.join(parent, generationName(record.generationId));
  // Immutability: an identical existing generation is reused; anything else is a collision, never overwritten.
  if (fs.existsSync(destination)) {
    const check = verifyGeneration({ generationDir: destination, allowedTargets: targets });
    if (!check.ok) throw Error('R20_IMMUTABLE_COLLISION:' + check.reason);
    return { generationId: record.generationId, created: false, output: destination };
  }
  const staging = path.join(parent, '.r20-staging-' + crypto.randomBytes(12).toString('hex'));
  fs.mkdirSync(staging, { recursive: false });
  try {
    for (let i = 0; i < targets.length; i++) {
      const file = path.join(staging, targets[i]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buffers[i], { flag: 'wx' });
    }
    fs.writeFileSync(path.join(staging, manifestName), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    fs.renameSync(staging, destination);
    const check = verifyGeneration({ generationDir: destination, allowedTargets: targets });
    if (!check.ok) throw Error('R20_POSTWRITE_INVALID:' + check.reason);
    return { generationId: record.generationId, created: true, output: destination };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}

export function assertMatchingGeneration({ catalogDir, workerDir, allowedTargets } = {}) {
  const a = verifyGeneration({ generationDir: catalogDir, allowedTargets });
  const b = verifyGeneration({ generationDir: workerDir, allowedTargets });
  if (!a.ok || !b.ok) return { ok: false, reason: 'R20_UNVERIFIED_GENERATION' };
  return a.generationId === b.generationId
    ? { ok: true, generationId: a.generationId }
    : { ok: false, reason: 'R20_GENERATION_MISMATCH' };
}
