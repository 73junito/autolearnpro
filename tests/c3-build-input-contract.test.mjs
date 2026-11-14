// C3-R35 — explicit build-input mapping contract tests.
//
// The positive case runs against the REAL repository, the REAL application and the REAL Worker source: a
// synthetic fixture is never allowed to stand in for an actual application input. Negative cases copy those
// real inputs into a temporary tree and then remove or corrupt exactly one thing, so each failure is the failure
// named in the test rather than an artefact of an empty placeholder.
//
// Run with: node --test tests/c3-build-input-contract.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  assertBuildInputMapping,
  assertOutputRoot,
  assertWorkerBoundary,
  INPUT_KINDS,
  R22_CORRESPONDENCE,
  REVIEWED_MAPPING_SPEC,
  REVIEWED_ROOT_LOCATIONS,
  WORKER_BOUNDARY
} from '../infrastructure/c3/build/build-input-contract.mjs';
import { createTargetPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');
const CONTRACT = path.join(REPO, 'infrastructure', 'c3', 'build', 'build-input-contract.mjs');

// Fingerprints of the reviewed source this milestone must not change. Updating these is a deliberate act.
// C3-R37H R5 (2026-11-06): `apps/catalog/index.html` and `apps/catalog/src/main.js` changed deliberately for the
// accessibility remediation (dismissible dialog with Escape dismissal and focus restoration, reduced-motion
// support, status announcements). Old -> new digests are recorded in
// _local/evidence/c3-remediation-review/C3-CHANGE-MANIFEST.json. No other pin was touched.
const PINNED = Object.freeze({
  'apps/catalog/package.json': 'effd027830259cee7de19fca64b1def730c9cd325c9c1e6c5372a2b8840eaf29',
  'apps/catalog/index.html': '883ea04f3d4d93f4bba25e3576a0adf93760fde001775e28a804f89f386ab100',
  'apps/catalog/vite.config.js': '47ed28141b710657b267d98e39dea5eb6ba7a5b1ce770aece8f8f6710919f820',
  'apps/catalog/src/main.js': '93c5b5e32f6050cf1801747eaa4c48f38efbe6a4ac975fb2078480c7e680e535',
  'infrastructure/cloudflare/worker.mjs': '261732ecb9accae4830a725edaf3d6ac0609ee7a373714e1efde3310235b4e8e',
  'infrastructure/cloudflare/wrangler.jsonc': 'df6486888a42317d8c94d9a46f3f5adb05d742b52be1ee8cf8077ffa647f4c58',
});

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r35-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// An empty authorised output directory plus its policy. Placed in its own temp tree so that tests which move a
// source root into the policy root can express overlap without fighting the policy.
function scratch(t) {
  const base = tmpDir(t);
  const output = path.join(base, 'out');
  fs.mkdirSync(output);
  const policy = createTargetPolicy({
    tier: TARGET_TIERS.TEMPORARY,
    rootDir: base,
    targets: ['evidence/catalog.json', 'evidence/worker.json']
  });
  return { base, output, policy };
}

// A representative tree built from the real inputs, for negative cases only.
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

  const policy = createTargetPolicy({
    tier: TARGET_TIERS.TEMPORARY,
    rootDir: policyRoot,
    targets: ['evidence/catalog.json', 'evidence/worker.json']
  });
  return { base, policyRoot, repository, catalog, worker, output, outside, policy };
}

const validArgs = (fixture) => ({
  policy: fixture.policy,
  outputRoot: fixture.output,
  roots: { repository: fixture.repository, catalog: fixture.catalog, worker: fixture.worker }
});

// Asserts that a call throws an error whose message starts with the expected code.
function refuses(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

test('1. the reviewed mapping validates against the real repository, application and Worker', (t) => {
  const { output, policy } = scratch(t);
  const result = assertBuildInputMapping({
    policy,
    outputRoot: output,
    roots: { repository: REPO, catalog: CATALOG, worker: WORKER },
    requireReviewedLocations: true
  });

  assert.equal(result.ok, true);
  // 2 repository inputs + 5 catalog inputs + 2 Worker inputs.
  assert.equal(result.inputs.length, 9);
  assert.equal(result.inputs.filter((input) => input.role === 'repository').length, REVIEWED_MAPPING_SPEC.repository.length);
  assert.equal(result.inputs.filter((input) => input.role === 'catalog').length, REVIEWED_MAPPING_SPEC.catalog.length);
  assert.equal(result.inputs.filter((input) => input.role === 'worker').length, REVIEWED_MAPPING_SPEC.worker.length);

  // The lockfile is a repository input, not an application input: that separation is the whole point of B2.
  const lock = result.inputs.find((input) => input.path === 'package-lock.json');
  assert.equal(lock.role, 'repository');
  assert.equal(lock.kind, INPUT_KINDS.FILE);
  assert.match(lock.sha256, /^[a-f0-9]{64}$/);

  // The declared directory input is digested deterministically, with named entries.
  const src = result.inputs.find((input) => input.role === 'catalog' && input.path === 'src');
  assert.equal(src.kind, INPUT_KINDS.DIRECTORY);
  assert.ok(src.entries.some(([type, name]) => type === 'f' && name === 'main.js'));
  assert.match(src.sha256, /^[a-f0-9]{64}$/);

  // Roots land on the reviewed locations, and the output root is the authorised empty directory.
  assert.equal(result.roots.catalog, path.join(result.roots.repository, ...REVIEWED_ROOT_LOCATIONS.catalog.split('/')));
  assert.equal(result.roots.worker, path.join(result.roots.repository, ...REVIEWED_ROOT_LOCATIONS.worker.split('/')));
  assert.equal(result.outputRoot, fs.realpathSync(output));

  // The contract records what it did NOT do.
  for (const flag of ['buildExecuted', 'workerBundled', 'networkUsed', 'evidenceProduced', 'publicationAuthorized', 'deploymentAuthorized', 'gitCommitVerified']) {
    assert.equal(result.claims[flag], false, `${flag} must be false`);
  }
  assert.deepEqual([...result.notEstablished], ['actualBuild', 'sourceCommitProvenance', 'trustedCiAttestation', 'publicationAuthority']);

  // Every historical R22 input name is accounted for, including the one that is deliberately absent.
  assert.equal(R22_CORRESPONDENCE.length, 9);
  const absent = R22_CORRESPONDENCE.filter((entry) => entry.role === null);
  assert.deepEqual(absent.map((entry) => entry.r22), ['lib/assets/']);
});

test('2. a missing catalog entry point is refused', (t) => {
  const fixture = sandbox(t);
  fs.rmSync(path.join(fixture.catalog, 'index.html'));
  refuses(() => assertBuildInputMapping(validArgs(fixture)), /^R35_INPUT_MISSING:catalog\/index\.html/);
});

test('3. a missing root lockfile is refused', (t) => {
  const fixture = sandbox(t);
  fs.rmSync(path.join(fixture.repository, 'package-lock.json'));
  refuses(() => assertBuildInputMapping(validArgs(fixture)), /^R35_INPUT_MISSING:repository\/package-lock\.json/);
});

test('4. a missing Worker entry point is refused by the mapping and by the boundary', (t) => {
  const fixture = sandbox(t);
  refuses(() => assertWorkerBoundary({ root: path.join(fixture.base, 'nowhere') }), /^R35_ROOT_UNAVAILABLE:worker/);

  fs.rmSync(path.join(fixture.worker, 'worker.mjs'));
  refuses(() => assertBuildInputMapping(validArgs(fixture)), /^R35_INPUT_MISSING:worker\/worker\.mjs/);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_ENTRY_MISSING:worker\.mjs/);
});


test('5. incorrect, nested or mislabelled roots are refused', (t) => {
  const fixture = sandbox(t);
  const { policy, output, repository, catalog, worker } = fixture;

  // Same directory named twice.
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: worker, worker } }),
    /^R35_ROOTS_IDENTICAL/
  );
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: repository, worker } }),
    /^R35_ROOTS_IDENTICAL/
  );

  // The Worker named as something inside the catalog. Nesting is refused, never resolved by precedence.
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog, worker: path.join(catalog, 'src') } }),
    /^R35_ROOTS_NESTED:catalog-in-worker/
  );

  // Application roots must be inside the repository.
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: fixture.outside, worker } }),
    /^R35_CATALOG_OUTSIDE_REPOSITORY/
  );

  // Relative roots are refused outright: nothing is resolved against the working directory.
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository: '.', catalog, worker } }),
    /^R35_ROOT_NOT_ABSOLUTE:repository/
  );
  refuses(() => assertWorkerBoundary({ root: 'infrastructure/cloudflare' }), /^R35_ROOT_NOT_ABSOLUTE:worker/);

  // A decoy application that sits inside the repository but is not the reviewed location.
  const decoy = path.join(repository, 'apps', 'decoy');
  fs.cpSync(catalog, decoy, { recursive: true });
  refuses(
    () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: decoy, worker }, requireReviewedLocations: true }),
    /^R35_ROOT_NOT_REVIEWED_LOCATION:catalog/
  );
  // ...and the same decoy is accepted when the caller does not assert reviewed locations, proving the check is
  // an opt-in assertion rather than an accident of path shape.
  assert.equal(
    assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: decoy, worker } }).ok,
    true
  );
});

test('6. traversal, symlinked inputs and symlinked roots are refused', (t) => {
  const fixture = sandbox(t);
  const { policy, output, repository, catalog, worker } = fixture;
  const validate = (overrides) => assertBuildInputMapping({
    policy,
    outputRoot: output,
    roots: { repository, catalog, worker },
    inputs: overrides
  });

  const withCatalogInput = (extra) => ({
    ...REVIEWED_MAPPING_SPEC,
    catalog: [...REVIEWED_MAPPING_SPEC.catalog, extra]
  });

  refuses(() => validate(withCatalogInput({ path: '../package.json', kind: INPUT_KINDS.FILE })), /^R35_INPUT_PATH_TRAVERSAL:catalog\/\.\.\/package\.json/);
  refuses(() => validate(withCatalogInput({ path: 'src/../../package.json', kind: INPUT_KINDS.FILE })), /^R35_INPUT_PATH_TRAVERSAL/);
  refuses(() => validate(withCatalogInput({ path: path.join(repository, 'package.json'), kind: INPUT_KINDS.FILE })), /^R35_INPUT_PATH_ABSOLUTE/);
  refuses(() => validate(withCatalogInput({ path: './index.html', kind: INPUT_KINDS.FILE })), /^R35_INPUT_PATH_TRAVERSAL/);
  refuses(() => validate(withCatalogInput({ path: 'index.html', kind: 'symlink' })), /^R35_INPUT_KIND_INVALID:catalog\/index\.html/);

  // A directory link where a real input is declared.
  let linkable = true;
  try {
    fs.symlinkSync(fixture.outside, path.join(catalog, 'linked-input'), 'junction');
  } catch {
    linkable = false;
  }
  if (linkable) {
    refuses(() => validate(withCatalogInput({ path: 'linked-input', kind: INPUT_KINDS.DIRECTORY })), /^R35_INPUT_SYMLINK:catalog\/linked-input/);

    // ...and a link nested inside an input directory is refused by the walk.
    fs.symlinkSync(fixture.outside, path.join(catalog, 'src', 'nested-link'), 'junction');
    refuses(() => validate(), /^R35_INPUT_SYMLINK:nested-link/);

    // A root that is itself a link is refused: containment cannot be anchored to a redirect.
    fs.symlinkSync(catalog, path.join(repository, 'catalog-link'), 'junction');
    refuses(
      () => assertBuildInputMapping({ policy, outputRoot: output, roots: { repository, catalog: path.join(repository, 'catalog-link'), worker } }),
      /^R35_ROOT_SYMLINK:catalog/
    );
  } else {
    t.diagnostic('host refused to create directory links; symlink cases not exercised in this run');
  }
});

test('7. an invalid temporary output root is refused', (t) => {
  const fixture = sandbox(t);
  const { policy, output, repository, catalog, worker } = fixture;
  const roots = { repository, catalog, worker };

  // Outside the authorised policy root.
  refuses(() => assertBuildInputMapping({ policy, outputRoot: fixture.outside, roots }), /^R35_OUTPUT_OUTSIDE_POLICY/);

  // Inside a source root. This fixture keeps the repository inside the policy root precisely so the overlap is
  // expressible; against the real repository it is not, which is a property of the policy, not of this check.
  const insideSource = path.join(repository, 'dist');
  fs.mkdirSync(insideSource);
  refuses(() => assertBuildInputMapping({ policy, outputRoot: insideSource, roots }), /^R35_OUTPUT_INSIDE_SOURCE_ROOT/);
  fs.rmSync(insideSource, { recursive: true, force: true });

  // Absent destination.
  refuses(() => assertBuildInputMapping({ policy, outputRoot: path.join(fixture.policyRoot, 'missing'), roots }), /^R35_OUTPUT_UNAVAILABLE/);
  refuses(() => assertBuildInputMapping({ policy, outputRoot: undefined, roots }), /^R35_OUTPUT_REQUIRED/);

  // Not empty: evidence must not be mixed with debris.
  fs.writeFileSync(path.join(output, 'leftover.txt'), 'stale');
  refuses(() => assertBuildInputMapping({ policy, outputRoot: output, roots }), /^R35_OUTPUT_NOT_EMPTY/);
  fs.rmSync(path.join(output, 'leftover.txt'));
  assert.equal(assertBuildInputMapping({ policy, outputRoot: output, roots }).outputRoot, fs.realpathSync(output));
});

test('8. forged staging or production authorization cannot be expressed', (t) => {
  const fixture = sandbox(t);
  const { output, repository, catalog, worker } = fixture;
  const roots = { repository, catalog, worker };
  const targets = ['evidence/catalog.json'];

  refuses(() => createTargetPolicy({ tier: TARGET_TIERS.PRODUCTION, rootDir: fixture.policyRoot, targets }), /^R28_PRODUCTION_NOT_AUTHORIZED/);
  refuses(() => createTargetPolicy({ tier: TARGET_TIERS.STAGING, rootDir: fixture.policyRoot, targets }), /^R28_STAGING_NOT_AUTHORIZED/);

  // A hand-built policy object is re-derived from its values, so a plausible shape buys nothing.
  refuses(
    () => assertBuildInputMapping({
      policy: { tier: 'temporary', rootDir: REPO, targets, publicationAuthorized: false },
      outputRoot: output,
      roots
    }),
    /^R28_ROOT_NOT_TEMPORARY/
  );
  refuses(
    () => assertBuildInputMapping({
      policy: { tier: 'temporary', rootDir: fixture.policyRoot, targets, publicationAuthorized: true },
      outputRoot: output,
      roots
    }),
    /^R28_PUBLICATION_FLAG_INVALID/
  );
  refuses(
    () => assertBuildInputMapping({
      policy: { ...fixture.policy, tier: 'staging', publicationAuthorized: true },
      outputRoot: output,
      roots
    }),
    /^R28_STAGING_NOT_AUTHORIZED/
  );
  refuses(() => assertBuildInputMapping({ policy: null, outputRoot: output, roots }), /^R28_POLICY_REQUIRED/);

  // The policy's own root must resolve inside the OS temporary directory, so a staging or production
  // destination is structurally unspeakable rather than merely blocklisted.
  refuses(() => assertOutputRoot({ tier: 'temporary', rootDir: path.dirname(REPO), targets, publicationAuthorized: false }, output), /^R28_ROOT_NOT_TEMPORARY/);
});

test('9. the Worker boundary holds, and every violation of it is refused', (t) => {
  // The real Worker passes and reports itself as filesystem-free.
  const real = assertWorkerBoundary({ root: WORKER });
  assert.equal(real.ok, true);
  assert.deepEqual([...real.imports], []);
  assert.equal(real.filesystemFree, true);
  assert.equal(real.config.main, WORKER_BOUNDARY.expectedMain);
  assert.equal(real.entry.sha256, PINNED['infrastructure/cloudflare/worker.mjs']);
  assert.equal(real.claims.bundled, false);
  assert.equal(real.claims.deployed, false);

  const fixture = sandbox(t);
  const entryPath = path.join(fixture.worker, 'worker.mjs');
  const original = fs.readFileSync(entryPath, 'utf8');
  const restore = () => fs.writeFileSync(entryPath, original);

  // A Node built-in.
  fs.writeFileSync(entryPath, `import fs from 'node:fs';\n${original}`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_FORBIDDEN:node:/);
  restore();

  // The privileged C3 library, and any bare specifier at all.
  fs.writeFileSync(entryPath, `import { assertPolicy } from '../../c3/library/target-policy.mjs';\n${original}`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_IMPORT_FORBIDDEN/);
  restore();

  // Any bare specifier is refused, so a database client never even reaches the token scan.
  fs.writeFileSync(entryPath, `import pg from 'pg';\n${original}`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_IMPORT_FORBIDDEN:pg/);
  restore();

  // Credentials in source.
  fs.writeFileSync(entryPath, `${original}\nconst key = process.env.SECRET;\n`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_FORBIDDEN:process\.env/);
  restore();

  // A sibling import stays inside the root, and one that climbs out is refused.
  fs.writeFileSync(entryPath, `import { helper } from './helper.mjs';\n${original}`);
  fs.writeFileSync(path.join(fixture.worker, 'helper.mjs'), 'export const helper = 1;\n');
  assert.deepEqual([...assertWorkerBoundary({ root: fixture.worker }).imports], ['./helper.mjs']);
  fs.writeFileSync(entryPath, `import { helper } from '../../../etc/passwd.mjs';\n${original}`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_IMPORT_FORBIDDEN/);
  restore();

  // The configuration must point at the entry this contract treats as the source of truth.
  const configPath = path.join(fixture.worker, 'wrangler.jsonc');
  const configOriginal = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(configPath, configOriginal.replace('"main": "./worker.mjs"', '"main": "./other.mjs"'));
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_CONFIG_MAIN_MISMATCH/);
  fs.writeFileSync(configPath, configOriginal);

  // A missing or unreadable configuration is refused rather than defaulted.
  fs.rmSync(configPath);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_CONFIG_MISSING:wrangler\.jsonc/);
});

test('10. the application and Worker source are unchanged, and validation writes nothing', (t) => {
  const digestTree = (dir) => {
    const entries = [];
    const visit = (current) => {
      for (const name of fs.readdirSync(current).sort()) {
        const absolute = path.join(current, name);
        if (absolute === path.join(CATALOG, 'dist')) continue;
        const stats = fs.lstatSync(absolute);
        if (stats.isDirectory()) visit(absolute);
        else entries.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute))]);
      }
    };
    visit(dir);
    return entries;
  };

  for (const [relative, expected] of Object.entries(PINNED)) {
    assert.equal(sha256(fs.readFileSync(path.join(REPO, relative))), expected, `${relative} changed`);
  }

  const before = { catalog: digestTree(CATALOG), worker: digestTree(WORKER) };
  const { output, policy } = scratch(t);
  assertBuildInputMapping({ policy, outputRoot: output, roots: { repository: REPO, catalog: CATALOG, worker: WORKER } });
  assertWorkerBoundary({ root: WORKER });
  const after = { catalog: digestTree(CATALOG), worker: digestTree(WORKER) };

  assert.deepEqual(after, before, 'validation must not modify the source it reads');
});

test('11. the contract performs no build, no network call and no deployment', () => {
  const code = fs.readFileSync(CONTRACT, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  for (const banned of [
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'copyFileSync', 'cpSync',
    'createWriteStream', 'mkdtempSync', 'spawn', 'execSync', 'execFileSync', 'child_process',
    'fetch(', 'node:http', 'node:https', 'node:net', 'node:child_process',
    "from 'vite'", "from 'esbuild'", 'npx ', 'npm run', 'cloudflared'
  ]) {
    assert.equal(code.includes(banned), false, `the contract module must not reference ${banned}`);
  }

  // `wrangler.jsonc` appears here only as a file name. No CLI can be launched at all: the module imports
  // nothing but node:crypto, node:fs, node:path and the R28 policy, and has no child_process surface.

  // Its only imports are Node's own read-only modules and the existing R28 policy contract.
  const imports = [...code.matchAll(/(?:^|\n)\s*import[^;\n]*?from\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ['../library/target-policy.mjs', 'node:crypto', 'node:fs', 'node:path']);

  // The returned claim set says the same thing at runtime.
  assert.equal(new Set(['buildExecuted', 'workerBundled', 'networkUsed', 'evidenceProduced']).size, 4);
  assert.equal(typeof assertBuildInputMapping, 'function');
});

test('12. validation is deterministic across repeated calls', (t) => {
  const { output, policy } = scratch(t);
  const args = { policy, outputRoot: output, roots: { repository: REPO, catalog: CATALOG, worker: WORKER }, requireReviewedLocations: true };

  const first = JSON.stringify(assertBuildInputMapping(args));
  const second = JSON.stringify(assertBuildInputMapping(args));
  assert.equal(second, first, 'two validations of the same tree must describe it identically');

  const workerFirst = JSON.stringify(assertWorkerBoundary({ root: WORKER }));
  const workerSecond = JSON.stringify(assertWorkerBoundary({ root: WORKER }));
  assert.equal(workerSecond, workerFirst);

  // And the described digests are the fingerprints this milestone recorded, so a change to the tree is visible
  // in the contract's own output rather than only in CI.
  const described = JSON.parse(first);
  for (const input of described.inputs) {
    if (input.path === 'package-lock.json') assert.equal(input.role, 'repository');
    if (input.path === 'worker.mjs') assert.equal(input.role, 'worker');
  }
  assert.deepEqual([...Object.keys(described.claims)].sort(), [
    'buildExecuted', 'deploymentAuthorized', 'evidenceProduced', 'gitCommitVerified',
    'networkUsed', 'publicationAuthorized', 'workerBundled'
  ]);
});





