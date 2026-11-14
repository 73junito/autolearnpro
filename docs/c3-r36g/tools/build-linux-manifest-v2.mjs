#!/usr/bin/env node
// C3-R36G — build the v2 Linux transfer manifest from the real dependency closure.
//
// WHY THIS EXISTS: the C3-R36E v1 manifest (28 records) was assembled by hand and omitted both the R35 test file
// and every application input, so the R35-R36E suites could not run from it. This tool derives the file list
// mechanically instead of by hand:
//
//   1. start from the test entry points that must execute on Linux;
//   2. follow every RELATIVE import, transitively, to build the module closure;
//   3. union that with the files the C3-R35 mapping contract requires and with the isolated toolchain manifests
//      the lockfile install needs;
//   4. refuse anything outside the repository, anything under node_modules, and anything that looks like a secret.
//
// It writes a versioned manifest only. It does not transfer, execute, or claim a Linux run.
//
// Usage: node docs/c3-r36g/tools/build-linux-manifest-v2.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r36g', 'C3-R36G-LINUX-MANIFEST-V2.json');

const SCHEMA = 'alp-c3-r36g-linux-manifest-v2';

// The suites that must be executable on Linux: R26-R31 (already proven) plus R35-R36E (the gap this version fixes).
const TEST_ENTRIES = [
  'tests/c3-recovery.test.mjs',
  'tests/c3-library-reader.test.mjs',
  'tests/c3-library-generation.test.mjs',
  'tests/c3-build-provenance.test.mjs',
  'tests/c3-offline-evidence.test.mjs',
  'tests/c3-build-input-contract.test.mjs',
  'tests/c3-multi-root-snapshot.test.mjs',
  'tests/c3-worker-bundle-feasibility.test.mjs',
  'tests/c3-offline-evidence-persistence.test.mjs',
  'tests/c3-evidence-rehearsal.test.mjs',
  'tests/c3-process-boundary.test.mjs'
];

// Files the C3-R35 reviewed mapping spec requires, repository-relative. No module imports them — they are inputs
// the contract demands — so a closure over imports alone would miss them. That omission is what broke v1.
const CONTRACT_REQUIRED = [
  'package.json',
  'package-lock.json',
  'apps/catalog/package.json',
  'apps/catalog/index.html',
  'apps/catalog/vite.config.js',
  'apps/catalog/src/main.js',
  'infrastructure/cloudflare/worker.mjs',
  'infrastructure/cloudflare/wrangler.jsonc'
];

// The isolated toolchain install needs these two; they are not imported either.
const TOOLCHAIN_MANIFESTS = [
  'infrastructure/c3/build/package.json',
  'infrastructure/c3/build/package-lock.json'
];

// A fixture the process-boundary suite loads by name rather than imports.
const NAMED_FIXTURES = ['tests/fixtures/fs-alter-once.mjs'];

const FORBIDDEN = [/node_modules\//, /^\.env/, /\.pem$/, /\.key$/, /\.pfx$/, /credentials/i, /secret/i, /\.dump$/];
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function assertTransferable(relative) {
  const posix = path.relative(REPO, path.resolve(REPO, relative)).split(path.sep).join('/');
  if (path.isAbsolute(relative) || posix.startsWith('..')) throw Error(`R36G_PATH_OUTSIDE_REPOSITORY:${relative}`);
  for (const pattern of FORBIDDEN) {
    if (pattern.test(posix)) throw Error(`R36G_FORBIDDEN_FILE:${posix}`);
  }
  if (!fs.existsSync(path.join(REPO, posix))) throw Error(`R36G_MISSING_FILE:${posix}`);
  return posix;
}

// Follows relative imports transitively. Bare specifiers (node:, esbuild) are not files in this repository, so they
// are recorded as external and left to the lockfile install.
function closure(entry) {
  const seen = new Set();
  const external = new Set();
  const queue = [entry];
  while (queue.length) {
    const relative = queue.pop();
    const posix = assertTransferable(relative);
    if (seen.has(posix)) continue;
    seen.add(posix);
    const source = fs.readFileSync(path.join(REPO, posix), 'utf8');
    for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        external.add(specifier);
        continue;
      }
      const target = path.resolve(path.dirname(path.join(REPO, posix)), specifier);
      queue.push(path.relative(REPO, target));
    }
  }
  return { files: [...seen].sort(), external: [...external].sort() };
}

// Everything under the repository, excluding node_modules and .git, for the basename lookup below.
function repositoryFiles(dir = REPO, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const absolute = path.join(dir, name);
    const stats = fs.lstatSync(absolute);
    if (stats.isDirectory()) repositoryFiles(absolute, out);
    else out.push(path.relative(REPO, absolute).split(path.sep).join('/'));
  }
  return out;
}

/**
 * Files that are EXECUTED but never imported.
 *
 * The C3-R36E suite spawns `evidence-producer.cli.mjs` and `evidence-verifier.cli.mjs` as child processes by path,
 * so an import-only closure cannot see them — which is exactly how revision 1 of this manifest shipped without
 * them and failed on Linux with MODULE_NOT_FOUND. A file referenced by a bare filename literal in any collected
 * source is therefore added when that basename is unique in the repository.
 */
function executedEntryPoints(collected, allFiles) {
  const referenced = new Set();
  const byBasename = new Map();
  for (const file of allFiles) {
    const base = file.split('/').pop();
    byBasename.set(base, [...(byBasename.get(base) ?? []), file]);
  }
  for (const relative of collected) {
    const source = fs.readFileSync(path.join(REPO, relative), 'utf8');
    for (const match of source.matchAll(/['"]([A-Za-z0-9._-]+\.(?:mjs|js))['"]/g)) {
      const candidates = byBasename.get(match[1]) ?? [];
      if (candidates.length === 1) referenced.add(candidates[0]);
    }
  }
  return [...referenced].sort();
}


const collected = new Set();
const externalSpecifiers = new Set();
const perEntry = [];

for (const entry of TEST_ENTRIES) {
  const result = closure(entry);
  for (const file of result.files) collected.add(file);
  for (const specifier of result.external) externalSpecifiers.add(specifier);
  perEntry.push({ entry, modules: result.files.length });
}

const contractFiles = CONTRACT_REQUIRED.map(assertTransferable).sort();
const toolchainFiles = TOOLCHAIN_MANIFESTS.map(assertTransferable).sort();
const fixtureFiles = NAMED_FIXTURES.map(assertTransferable).sort();
for (const file of [...contractFiles, ...toolchainFiles, ...fixtureFiles]) collected.add(file);

// Executed-but-not-imported entry points are added last, because they can only be discovered from the sources the
// closure already found.
const allFiles = repositoryFiles();
const entryPoints = executedEntryPoints(collected, allFiles);
for (const file of entryPoints) collected.add(assertTransferable(file));

const records = [...collected].sort().map((relative) => {
  const bytes = fs.readFileSync(path.join(REPO, relative));
  return { path: relative, sha256: sha256(bytes), bytes: bytes.length };
});

const v1Path = path.join(REPO, 'docs', 'c3-r36e', 'C3-R36E-LINUX-MANIFEST.json');
const manifest = {
  schema: SCHEMA,
  purpose: 'Self-contained Linux transfer package for C3-R35 through C3-R36E, plus the R26-R31 suites already proven on Linux.',
  supersedes: {
    path: 'docs/c3-r36e/C3-R36E-LINUX-MANIFEST.json',
    schema: 'alp-c3-r36e-linux-manifest-v1',
    sha256: sha256(fs.readFileSync(v1Path)),
    records: 28,
    defect: 'Omitted tests/c3-build-input-contract.test.mjs and every application input, so R35-R36E could not execute.'
  },
  generatedOn: 'windows-development-worktree',
  workspace: 'F:/autolearnpro-c3-r25-integration',
  executed: false,
  notClaimed: 'This manifest describes a transfer package. It does not record, imply or predict a Linux test result.',
  derivation: {
    revision: 2,
    revisionNote: 'Revision 1 shipped without the two process entry points because nothing imports them; the R36E suite spawns them by path. Revision 2 adds the executed-entry-point rule.',
    entryPoints: TEST_ENTRIES,
    perEntry,
    contractRequired: contractFiles,
    toolchainManifests: toolchainFiles,
    namedFixtures: fixtureFiles,
    executedEntryPoints: entryPoints,
    externalSpecifiers: [...externalSpecifiers].sort(),
    rule: 'transitive relative-import closure, unioned with the C3-R35 contract inputs, the isolated toolchain manifests, named fixtures and executed-but-not-imported entry points'
  },
  linuxRequirement: {
    node: '/home/rod/.local/bin/node22 (v22.23.4)',
    install: 'cd infrastructure/c3/build && npm ci --ignore-scripts',
    note: 'Do not reuse Windows node_modules.'
  },
  files: records
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ records: records.length, external: manifest.derivation.externalSpecifiers }, null, 1));

