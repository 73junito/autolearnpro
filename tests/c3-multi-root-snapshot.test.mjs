// C3-R36A — multi-root snapshot contract tests.
//
// The positive cases run against the REAL repository, application and Worker. Negative cases copy those real
// inputs into a temporary tree and then change exactly one thing, so a failure is the failure named in the test
// rather than an artefact of an empty placeholder.
//
// Run with: node --test tests/c3-multi-root-snapshot.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createSourceSnapshot,
  verifySourceSnapshot,
  REVIEWED_EXCLUSIONS,
  SNAPSHOT_LIMITATIONS,
  SNAPSHOT_SCHEMA,
  SNAPSHOT_VERSION
} from '../infrastructure/c3/build/source-snapshot.mjs';
import {
  assertBuildInputMapping,
  assertWorkerBoundary,
  REVIEWED_MAPPING_SPEC,
  WORKER_BOUNDARY
} from '../infrastructure/c3/build/build-input-contract.mjs';
import { createTargetPolicy, TARGET_TIERS } from '../infrastructure/c3/library/target-policy.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const CATALOG = path.join(REPO, 'apps', 'catalog');
const WORKER = path.join(REPO, 'infrastructure', 'cloudflare');
const MODULE = path.join(REPO, 'infrastructure', 'c3', 'build', 'source-snapshot.mjs');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function tmpDir(t, prefix = 'c3-r36a-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function scratch(t) {
  const base = tmpDir(t);
  const output = path.join(base, 'out');
  fs.mkdirSync(output);
  const policy = createTargetPolicy({ tier: TARGET_TIERS.TEMPORARY, rootDir: base, targets: ['evidence/snapshot.json'] });
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

  const policy = createTargetPolicy({ tier: TARGET_TIERS.TEMPORARY, rootDir: policyRoot, targets: ['evidence/snapshot.json'] });
  return { base, policyRoot, repository, catalog, worker, output, outside, policy };
}

const argsFor = (fixture) => ({
  policy: fixture.policy,
  outputRoot: fixture.output,
  roots: { repository: fixture.repository, catalog: fixture.catalog, worker: fixture.worker }
});

function refuses(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(String(error?.message), pattern);
    return true;
  });
}

// A structurally valid snapshot with one field replaced, for tampering cases.
const withField = (snapshot, patch) => ({ ...snapshot, ...patch });

test('1. a correct multi-root mapping produces a canonical snapshot of the real repository', (t) => {
  const { output, policy } = scratch(t);
  const snapshot = createSourceSnapshot({
    policy,
    outputRoot: output,
    roots: { repository: REPO, catalog: CATALOG, worker: WORKER }
  });

  assert.equal(snapshot.schema, SNAPSHOT_SCHEMA);
  assert.equal(snapshot.version, SNAPSHOT_VERSION);
  assert.match(snapshot.combinedSha256, /^[a-f0-9]{64}$/);

  // Nine declared inputs, eight distinct files: R35 declares both `src` and `src/main.js`, which collapse.
  assert.equal(snapshot.declared.length, 9);
  assert.equal(snapshot.entries.length, 8);

  // Every role is represented, and every recorded path is repository-relative with forward slashes.
  assert.deepEqual([...new Set(snapshot.entries.map((row) => row.role))].sort(), ['catalog', 'repository', 'worker']);
  for (const row of snapshot.entries) {
    assert.equal(row.path.includes('\\'), false, `${row.path} must use forward slashes`);
    assert.ok(fs.existsSync(path.join(REPO, ...row.path.split('/'))), `${row.path} must resolve inside the repository`);
  }

  // The lockfile is attributed to the repository, not to the application.
  const lock = snapshot.entries.find((row) => row.path === 'package-lock.json');
  assert.equal(lock.role, 'repository');
  assert.equal(lock.size, fs.statSync(path.join(REPO, 'package-lock.json')).size);
  assert.equal(lock.sha256, sha256(fs.readFileSync(path.join(REPO, 'package-lock.json'))));

  // Exclusions are recorded, and the absence of lib/assets is never an empty verified directory.
  assert.ok(snapshot.exclusions.some((row) => row.r22Path === 'lib/assets' && row.disposition === 'ABSENT_BY_ARCHITECTURE'));
  assert.equal(snapshot.entries.some((row) => row.path.includes('lib/assets')), false);
  assert.equal(snapshot.declared.some((row) => row.path.includes('lib/assets')), false);

  // Compatibility is pinned: a new snapshot is not a historical R22 snapshot.
  assert.equal(snapshot.compatibility.historicalR22Equivalent, false);
  assert.equal(snapshot.compatibility.requiresVersionedDecision, true);
  assert.deepEqual({ ...snapshot.claims }, {
    sourceCommitVerified: false, ciAttested: false, publicationAuthorized: false, deployAllowed: false
  });
  assert.ok(snapshot.limitations.length >= 4);
});

test('2. ordering is canonical, not declaration order', (t) => {
  const { output, policy } = scratch(t);
  const roots = { repository: REPO, catalog: CATALOG, worker: WORKER };
  const forward = createSourceSnapshot({ policy, outputRoot: output, roots });

  const reversedSpec = {};
  for (const [role, rows] of Object.entries(REVIEWED_MAPPING_SPEC)) reversedSpec[role] = [...rows].reverse();
  const reversed = createSourceSnapshot({ policy, outputRoot: output, roots, inputs: reversedSpec });

  assert.equal(reversed.combinedSha256, forward.combinedSha256, 'declaration order must not affect the digest');
  assert.deepEqual(reversed.entries.map((row) => `${row.role}:${row.path}`), forward.entries.map((row) => `${row.role}:${row.path}`));

  // Within each role the recorded paths are sorted, and roles follow repository -> catalog -> worker.
  const rank = { repository: 0, catalog: 1, worker: 2 };
  for (let index = 1; index < forward.entries.length; index += 1) {
    const previous = forward.entries[index - 1];
    const current = forward.entries[index];
    const ordering = rank[previous.role] - rank[current.role] || (previous.path < current.path ? -1 : previous.path > current.path ? 1 : 0);
    assert.ok(ordering < 0, `entry order broke at ${current.role}:${current.path}`);
  }
});

test('3. the combined digest is deterministic across repeated creation', (t) => {
  const { output, policy } = scratch(t);
  const roots = { repository: REPO, catalog: CATALOG, worker: WORKER };
  const first = createSourceSnapshot({ policy, outputRoot: output, roots });
  const second = createSourceSnapshot({ policy, outputRoot: output, roots });

  assert.equal(second.combinedSha256, first.combinedSha256);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));

  // Reordered exclusions serialize identically too, because they are sorted before the digest.
  const shuffled = createSourceSnapshot({ policy, outputRoot: output, roots, exclusions: [...REVIEWED_EXCLUSIONS].reverse() });
  assert.equal(shuffled.combinedSha256, first.combinedSha256);
});

test('4. a single tampered byte is detected', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  assert.equal(verifySourceSnapshot({ ...argsFor(fixture), snapshot }).ok, true);

  const target = path.join(fixture.catalog, 'index.html');
  const bytes = fs.readFileSync(target);
  bytes[bytes.length - 1] = bytes[bytes.length - 1] === 0x20 ? 0x21 : 0x20;
  fs.writeFileSync(target, bytes);

  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot }), /^R36A_ENTRY_MISMATCH:catalog\/apps\/catalog\/index\.html/);
});

test('5. added and removed required files are detected', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  const extra = path.join(fixture.catalog, 'src', 'extra.js');
  fs.writeFileSync(extra, 'export const extra = 1;\n');
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot }), /^R36A_ENTRY_ADDED:catalog\/apps\/catalog\/src\/extra\.js/);
  fs.rmSync(extra);
  assert.equal(verifySourceSnapshot({ ...argsFor(fixture), snapshot }).ok, true);

  // Removing a declared file is refused by the mapping gate before the snapshot is even rebuilt.
  fs.rmSync(path.join(fixture.catalog, 'vite.config.js'));
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot }), /^R35_INPUT_MISSING:catalog\/vite\.config\.js/);
});

test('6. an unexpected symlink or junction inside a declared directory is refused', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  try {
    fs.symlinkSync(fixture.outside, path.join(fixture.catalog, 'src', 'link'), 'junction');
  } catch {
    t.diagnostic('host refused to create a directory link; link case not exercised in this run');
    return;
  }

  // R35's directory walk refuses the link before any digest is trusted.
  refuses(() => createSourceSnapshot(argsFor(fixture)), /^R35_INPUT_SYMLINK:link/);
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot }), /^R35_INPUT_SYMLINK:link/);
});

test('7. root escape and traversal in a supplied record are refused', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  const traversing = withField(snapshot, {
    entries: [{ ...snapshot.entries[0], path: '../escaped.txt' }, ...snapshot.entries.slice(1)]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: traversing }), /^R36A_ENTRY_PATH_TRAVERSAL/);

  const absolute = withField(snapshot, {
    entries: [{ ...snapshot.entries[0], path: path.join(fixture.outside, 'x.txt') }, ...snapshot.entries.slice(1)]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: absolute }), /^R36A_ENTRY_PATH_ABSOLUTE/);

  // A declared input that climbs out of its root is refused. The record's own path validation catches it before
  // R35 is consulted at all (R35's separate traversal guard is proven in its own suite, test 6).
  const escaping = withField(snapshot, {
    declared: [{ ...snapshot.declared[0], rootPath: '../package.json' }, ...snapshot.declared.slice(1)]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: escaping }), /^R36A_ENTRY_PATH_TRAVERSAL/);
});

test('8. role substitution and reordering cannot pass, because the digest covers both', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  const index = snapshot.entries.findIndex((row) => row.role === 'catalog');
  const substituted = [...snapshot.entries];
  substituted[index] = { ...substituted[index], role: 'repository' };
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: withField(snapshot, { entries: substituted }) }), /^R36A_DIGEST_MISMATCH/);

  // A record whose declared order was rearranged no longer matches the canonical order.
  const reordered = withField(snapshot, { entries: [...snapshot.entries].reverse() });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: reordered }), /^R36A_(DIGEST_MISMATCH|DECLARED_MISMATCH)/);

  // An unrecognised role is refused by name.
  const unknownRole = withField(snapshot, {
    entries: [{ ...snapshot.entries[0], role: 'staging' }, ...snapshot.entries.slice(1)]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: unknownRole }), /^R36A_ROLE_UNKNOWN:staging/);
});

test('9. a path collision inside one role is refused', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));
  const duplicate = withField(snapshot, { entries: [snapshot.entries[0], { ...snapshot.entries[0] }, ...snapshot.entries.slice(1)] });

  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: duplicate }), /^R36A_PATH_COLLISION/);
});

test('10. a malformed schema is refused, including an R22-shaped record', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));
  const verify = (candidate) => verifySourceSnapshot({ ...argsFor(fixture), snapshot: candidate });

  refuses(() => verify(null), /^R36A_SNAPSHOT_REQUIRED/);
  refuses(() => verify('not-an-object'), /^R36A_SNAPSHOT_REQUIRED/);
  refuses(() => verify(withField(snapshot, { schema: 'something-else' })), /^R36A_SCHEMA_INVALID:something-else/);
  refuses(() => verify(withField(snapshot, { version: 2 })), /^R36A_SCHEMA_UNSUPPORTED:2/);
  refuses(() => verify(withField(snapshot, { generationId: 'g-1' })), /^R36A_FIELD_UNEXPECTED:generationId/);
  refuses(() => verify(withField(snapshot, { entries: 'none' })), /^R36A_SHAPE_INVALID:entries/);
  refuses(() => verify(withField(snapshot, { entries: [{ ...snapshot.entries[0], sha256: 'short' }] })), /^R36A_ENTRY_INVALID/);

  const missingKey = { ...snapshot };
  delete missingKey.limitations;
  refuses(() => verify(missingKey), /^R36A_FIELD_MISSING:limitations/);

  // A historical R22 record is refused for its own reason: it may not enter this verifier at all without a
  // versioned compatibility decision (C3-R36A Phase C).
  refuses(() => verify({ schema: 'alp-c3-r22-offline-evidence', generationId: 'g', pairId: 'p' }), /^R36A_HISTORICAL_R22_REQUIRES_DECISION/);
  refuses(() => verify({ ...snapshot, generationId: 'g-1', schema: 'alp-c3-r22-offline-evidence' }), /^R36A_HISTORICAL_R22_REQUIRES_DECISION/);
});

test('11. missing inputs are refused by the mapping gate', (t) => {
  const fixture = sandbox(t);
  fs.rmSync(path.join(fixture.repository, 'package-lock.json'));
  refuses(() => createSourceSnapshot(argsFor(fixture)), /^R35_INPUT_MISSING:repository\/package-lock\.json/);

  const other = sandbox(t);
  fs.rmSync(path.join(other.worker, 'worker.mjs'));
  refuses(() => createSourceSnapshot(argsFor(other)), /^R35_INPUT_MISSING:worker\/worker\.mjs/);
});

test('12. a deliberately excluded input is never an empty verified directory', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));

  const exclusion = snapshot.exclusions.find((row) => row.r22Path === 'lib/assets');
  assert.ok(exclusion, 'lib/assets must be recorded as an exclusion');
  assert.equal(exclusion.disposition, 'ABSENT_BY_ARCHITECTURE');
  assert.match(exclusion.reason, /does not exist/i);
  // Absence has structure, and it is not a directory row with zero children.
  assert.equal(snapshot.entries.filter((row) => row.path.includes('lib/assets')).length, 0);

  // The absence cannot be created as a declared directory in the first place: R35 refuses the missing path, so
  // no snapshot can record it as verified-and-empty.
  const catalogueSpec = {
    ...REVIEWED_MAPPING_SPEC,
    catalog: [...REVIEWED_MAPPING_SPEC.catalog, { path: 'lib/assets', kind: 'directory' }]
  };
  refuses(() => createSourceSnapshot({ ...argsFor(fixture), inputs: catalogueSpec }), /^R35_INPUT_MISSING:catalog\/lib\/assets/);

  // And a record edited after the fact to declare it is refused by the digest gate, which covers `declared`.
  const forged = withField(snapshot, {
    declared: [...snapshot.declared, {
      role: 'catalog',
      rootPath: 'lib/assets',
      path: 'apps/catalog/lib/assets',
      kind: 'directory'
    }]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: forged }), /^R36A_DIGEST_MISMATCH/);

  // A disposition that claims verified emptiness is refused on its face.
  const verifiedEmpty = withField(snapshot, {
    exclusions: [{ r22Path: 'lib/assets', disposition: 'VERIFIED_EMPTY', reason: 'nothing there' }]
  });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: verifiedEmpty }), /^R36A_EXCLUSION_INVALID:lib\/assets/);

  // And the record cannot be presented as R22-equivalent.
  const equivalent = withField(snapshot, { compatibility: { historicalR22Equivalent: true, requiresVersionedDecision: true } });
  refuses(() => verifySourceSnapshot({ ...argsFor(fixture), snapshot: equivalent }), /^R36A_COMPATIBILITY_INVALID/);
});

test('13. forged provenance and publication flags are refused', (t) => {
  const fixture = sandbox(t);
  const snapshot = createSourceSnapshot(argsFor(fixture));
  const verify = (claims) => verifySourceSnapshot({ ...argsFor(fixture), snapshot: withField(snapshot, { claims }) });

  refuses(() => verify({ ...snapshot.claims, publicationAuthorized: true }), /^R36A_FORGED_CLAIM:publicationAuthorized/);
  refuses(() => verify({ ...snapshot.claims, sourceCommitVerified: true }), /^R36A_FORGED_CLAIM:sourceCommitVerified/);
  refuses(() => verify({ ...snapshot.claims, ciAttested: true }), /^R36A_FORGED_CLAIM:ciAttested/);
  refuses(() => verify({ ...snapshot.claims, deployAllowed: true }), /^R36A_FORGED_CLAIM:deployAllowed/);
  refuses(() => verify({ ...snapshot.claims, approvedBy: 'someone' }), /^R36A_FORGED_CLAIM:unexpected-claim/);
  refuses(() => verify(null), /^R36A_FORGED_CLAIM/);
});

test('14. creating and verifying a snapshot mutates nothing', (t) => {
  const digestTree = (dir) => {
    const rows = [];
    const visit = (current) => {
      for (const name of fs.readdirSync(current).sort()) {
        const absolute = path.join(current, name);
        if (absolute === path.join(CATALOG, 'dist')) continue;
        const stats = fs.lstatSync(absolute);
        if (stats.isDirectory()) visit(absolute);
        else rows.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute)), stats.size]);
      }
    };
    visit(dir);
    return rows;
  };

  const before = { catalog: digestTree(CATALOG), worker: digestTree(WORKER) };
  const { output, policy } = scratch(t);
  const roots = { repository: REPO, catalog: CATALOG, worker: WORKER };

  const snapshot = createSourceSnapshot({ policy, outputRoot: output, roots });
  verifySourceSnapshot({ policy, outputRoot: output, roots, snapshot });

  const after = { catalog: digestTree(CATALOG), worker: digestTree(WORKER) };
  assert.deepEqual(after, before, 'snapshotting must not modify the source it reads');

  // And the authorised output directory stayed empty: no snapshot artifact was written anywhere.
  assert.deepEqual(fs.readdirSync(output), []);
});

test('15. no build, network or deployment surface, and the R35 Worker boundary is not weakened', (t) => {
  const code = fs.readFileSync(MODULE, 'utf8')
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
    assert.equal(code.includes(banned), false, `the snapshot module must not reference ${banned}`);
  }

  const imports = [...code.matchAll(/(?:^|\n)\s*import[^;\n]*?from\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
  assert.deepEqual(imports, ['./build-input-contract.mjs', 'node:crypto', 'node:fs', 'node:path']);

  // The Worker boundary is a frozen constant of the R35 module, and snapshotting cannot edit it.
  assert.equal(Object.isFrozen(WORKER_BOUNDARY), true);
  assert.equal(WORKER_BOUNDARY.expectedMain, './worker.mjs');
  assert.equal(WORKER_BOUNDARY.allowedImportPrefix, './');

  const fixture = sandbox(t);
  createSourceSnapshot(argsFor(fixture));
  const entryPath = path.join(fixture.worker, 'worker.mjs');
  fs.writeFileSync(entryPath, `import pg from 'pg';\n${fs.readFileSync(entryPath, 'utf8')}`);
  refuses(() => assertWorkerBoundary({ root: fixture.worker }), /^R35_WORKER_IMPORT_FORBIDDEN:pg/);

  // The verification result states what it did and did not establish.
  const { output, policy } = scratch(t);
  const result = verifySourceSnapshot({
    policy,
    outputRoot: output,
    roots: { repository: REPO, catalog: CATALOG, worker: WORKER },
    snapshot: createSourceSnapshot({ policy, outputRoot: output, roots: { repository: REPO, catalog: CATALOG, worker: WORKER } })
  });
  assert.deepEqual([...result.establishes], ['inputsConsistentWithSnapshot']);
  for (const claim of ['gitOrigin', 'authorship', 'review', 'ciExecution', 'approval', 'publicationAuthority', 'buildArtifact']) {
    assert.ok(result.doesNotEstablish.includes(claim), `${claim} must be listed as not established`);
  }
  assert.deepEqual({ ...result.claims }, {
    sourceCommitVerified: false, ciAttested: false, publicationAuthorized: false, deployAllowed: false
  });
  assert.deepEqual([...result.limitations], [...SNAPSHOT_LIMITATIONS]);
  assert.equal(assertBuildInputMapping({ policy, outputRoot: output, roots: { repository: REPO, catalog: CATALOG, worker: WORKER } }).ok, true);
});




