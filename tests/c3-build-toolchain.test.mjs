// C3-R30 — isolated build toolchain boundary tests. Disposable temporary fixtures only.
// Run with: node --test tests/c3-build-toolchain.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertBuildRoot, assertBuildOutput, inspectBuildInputs,
  REQUIRED_BUILD_INPUTS, REQUIRED_BUILD_INPUT_DIRS,
} from '../infrastructure/c3/build/build-root-guard.mjs';
import { createTargetPolicy, assertPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';

const BUILD_DIR = 'infrastructure/c3/build';
const TARGETS = ['specs/asset-library.json', 'specs/asset-library.generated.js'];
const readJson = (rel) => JSON.parse(fs.readFileSync(rel, 'utf8'));

function tmp(t, prefix = 'c3-r30-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A policy root containing a "repository" subdirectory and an empty output directory.
function sandbox(t) {
  const policyRoot = tmp(t);
  const sourceRoot = path.join(policyRoot, 'repo');
  const outputRoot = path.join(policyRoot, 'out');
  fs.mkdirSync(sourceRoot);
  fs.mkdirSync(outputRoot);
  const policy = createTargetPolicy({ tier: TARGET_TIERS.TEMPORARY, rootDir: policyRoot, targets: TARGETS });
  return { policyRoot, sourceRoot, outputRoot, policy };
}

function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { out.push(['d', path.relative(root, abs)]); walk(abs); }
      else { const s = fs.statSync(abs); out.push(['f', path.relative(root, abs), s.size, s.mtimeMs]); }
    }
  };
  walk(root);
  return out.sort((a, b) => String(a[1]).localeCompare(String(b[1])));
}

test('1. dependency boundary: exact pins, private package, no root dependencies', () => {
  const pkg = readJson(path.join(BUILD_DIR, 'package.json'));
  const rootPkg = readJson('package.json');

  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  // Exact versions only: a caret or range would defeat the reproducibility claim.
  for (const name of ['vite', 'esbuild']) {
    const spec = pkg.dependencies?.[name];
    assert.equal(typeof spec, 'string', `${name} must be a declared dependency`);
    assert.match(spec, /^\d+\.\d+\.\d+$/, `${name} must be pinned exactly, saw ${spec}`);
  }
  // The authoritative root stays dependency-free.
  assert.equal(rootPkg.dependencies ?? null, null);
  assert.equal(rootPkg.devDependencies ?? null, null);
  // And the build package is deliberately not a workspace of the root project.
  const workspaces = rootPkg.workspaces ?? [];
  assert.equal(workspaces.some((glob) => BUILD_DIR.startsWith(glob.replace('/*', '') + '/')), false);
});

test('2. lockfile exists, is v3, and resolves exactly the pinned versions', () => {
  const lock = readJson(path.join(BUILD_DIR, 'package-lock.json'));
  const pkg = readJson(path.join(BUILD_DIR, 'package.json'));
  assert.equal(lock.lockfileVersion, 3);
  for (const name of ['vite', 'esbuild']) {
    assert.equal(lock.packages[`node_modules/${name}`].version, pkg.dependencies[name]);
    assert.equal(lock.packages[''].dependencies[name], pkg.dependencies[name]);
  }
});

test('3. no lifecycle scripts and nothing deployment-capable in the build package', () => {
  const pkg = readJson(path.join(BUILD_DIR, 'package.json'));
  assert.equal(pkg.scripts, undefined, 'no scripts at all: nothing can run on install or by accident');
  const serialized = JSON.stringify(pkg);
  for (const banned of ['postinstall', 'preinstall', 'prepare', 'wrangler', 'publish', 'deploy']) {
    assert.equal(serialized.includes(banned), false, `package must not contain "${banned}"`);
  }
  assert.equal(Object.keys(pkg.dependencies).some((n) => /wrangler|cloudflare/i.test(n)), false);
});

test('4. the root guard loads with no build toolchain installed', () => {
  // Imported at module top: if it needed vite or esbuild this file could not even load.
  assert.equal(typeof assertBuildRoot, 'function');
  assert.equal(typeof assertBuildOutput, 'function');
  assert.equal(typeof inspectBuildInputs, 'function');
  assert.ok(Array.isArray(REQUIRED_BUILD_INPUTS) && REQUIRED_BUILD_INPUTS.length > 0);
  assert.ok(Array.isArray(REQUIRED_BUILD_INPUT_DIRS) && REQUIRED_BUILD_INPUT_DIRS.length > 0);
});

test('5. root-path validation refuses everything outside an authorised temporary root', (t) => {
  const { policy, sourceRoot } = sandbox(t);
  assert.equal(assertBuildRoot(policy, sourceRoot), fs.realpathSync(sourceRoot));

  assert.throws(() => assertBuildRoot(policy, undefined), /R30_ROOT_REQUIRED/);
  assert.throws(() => assertBuildRoot(policy, path.join(sourceRoot, 'nope')), /R30_ROOT_UNAVAILABLE/);
  assert.throws(() => assertBuildRoot(policy, process.cwd()), /R30_ROOT_OUTSIDE_POLICY/);
});

test('6. staging and production authorisation cannot be expressed', (t) => {
  const { policyRoot } = sandbox(t);
  assert.throws(() => createTargetPolicy({ tier: 'staging', rootDir: policyRoot, targets: TARGETS }), /R28_STAGING_NOT_AUTHORIZED/);
  assert.throws(() => createTargetPolicy({ tier: 'production', rootDir: policyRoot, targets: TARGETS }), /R28_PRODUCTION_NOT_AUTHORIZED/);
  // A forged policy is re-derived, so the tier string alone buys nothing.
  const forged = { tier: 'temporary', rootDir: process.cwd(), targets: TARGETS, publicationAuthorized: false };
  assert.throws(() => assertBuildRoot(forged, process.cwd()), /R28_ROOT_NOT_TEMPORARY/);
});

test('7. output containment: inside the policy, not the source root, and empty', (t) => {
  const { policy, sourceRoot, outputRoot } = sandbox(t);
  assert.equal(assertBuildOutput(policy, sourceRoot, outputRoot), fs.realpathSync(outputRoot));

  const outside = tmp(t, 'c3-r30-outside-');
  assert.throws(() => assertBuildOutput(policy, sourceRoot, outside), /R30_OUTPUT_OUTSIDE_POLICY/);
  assert.throws(() => assertBuildOutput(policy, sourceRoot, sourceRoot), /R30_OUTPUT_IS_SOURCE_ROOT/);

  const nested = path.join(sourceRoot, 'dist');
  fs.mkdirSync(nested);
  assert.throws(() => assertBuildOutput(policy, sourceRoot, nested), /R30_OUTPUT_INSIDE_SOURCE_ROOT/);

  fs.writeFileSync(path.join(outputRoot, 'debris.txt'), 'x');
  assert.throws(() => assertBuildOutput(policy, sourceRoot, outputRoot), /R30_OUTPUT_NOT_EMPTY/);
  assert.throws(
    () => assertBuildOutput(policy, sourceRoot, path.join(fs.realpathSync(outputRoot), 'missing')),
    /R30_OUTPUT_UNAVAILABLE/,
  );
});

test('8. input inspection is read-only and reports what a root actually lacks', (t) => {
  const { sourceRoot } = sandbox(t);
  const before = snapshot(sourceRoot);
  const result = inspectBuildInputs(sourceRoot);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'R30_BUILD_INPUTS_MISSING');
  assert.deepEqual(result.missing.length, REQUIRED_BUILD_INPUTS.length + REQUIRED_BUILD_INPUT_DIRS.length);
  assert.deepEqual(snapshot(sourceRoot), before, 'inspection must not create anything');

  for (const name of REQUIRED_BUILD_INPUTS) {
    const abs = path.join(sourceRoot, name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '{}');
  }
  for (const dir of REQUIRED_BUILD_INPUT_DIRS) fs.mkdirSync(path.join(sourceRoot, dir), { recursive: true });
  assert.deepEqual(inspectBuildInputs(sourceRoot), { ok: true, reason: null, missing: [] });

  assert.deepEqual(inspectBuildInputs(path.join(sourceRoot, 'absent')), { ok: false, reason: 'R30_ROOT_UNAVAILABLE', missing: [] });
});

test('9. guard calls mutate nothing on any path', (t) => {
  const { policyRoot, policy, sourceRoot, outputRoot } = sandbox(t);
  const before = snapshot(policyRoot);
  assertBuildRoot(policy, sourceRoot);
  assertBuildOutput(policy, sourceRoot, outputRoot);
  inspectBuildInputs(sourceRoot);
  assert.deepEqual(snapshot(policyRoot), before);
});

test('10. compatibility with the R28 policy contract used by R29', (t) => {
  const { policy, sourceRoot } = sandbox(t);
  assert.deepEqual([...assertPolicy(policy).targets], TARGETS);
  assert.equal(assertPolicy(policy).publicationAuthorized, false);
  assert.equal(assertBuildRoot(policy, sourceRoot).toLowerCase(), fs.realpathSync(sourceRoot).toLowerCase());
});
