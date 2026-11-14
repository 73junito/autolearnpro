// C3-R35: explicit build-input mapping for the catalog application and the Cloudflare Worker.
//
// WHY THIS EXISTS (C3-R34 finding B2). C3-R22 took ONE root and hashed nine fixed inputs beneath it. The
// authoritative repository is not shaped that way: the lockfile is at the root, the application is at
// `apps/catalog`, and the Worker is at `infrastructure/cloudflare`. R34 measured that no single prefix can
// satisfy the contract, because the lockfile lives above the app while every other input lives inside it.
//
// So the mapping is DATA, supplied by the caller, and every root is named explicitly. Nothing here infers a
// path from `import.meta.url` depth (the defect C3-R30 removed in `build-root-guard.mjs`) or from a historical
// staging layout. Nothing reads a clock, writes a file, spawns a process or imports a build tool.
//
// READ-ONLY BY CONSTRUCTION. This module validates and describes. It hashes bytes it is given and returns a
// frozen description. It never creates, repairs, deletes or bundles anything, and it produces no evidence.
//
// Dependency-free of the toolchain on purpose: importing this file must never require vite or esbuild.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertPolicy } from '../library/target-policy.mjs';

export const INPUT_ROLES = Object.freeze({
  REPOSITORY: 'repository',
  CATALOG: 'catalog',
  WORKER: 'worker',
});

export const INPUT_KINDS = Object.freeze({
  FILE: 'file',
  DIRECTORY: 'directory',
});

const ROLE_ORDER = Object.freeze([INPUT_ROLES.REPOSITORY, INPUT_ROLES.CATALOG, INPUT_ROLES.WORKER]);

// Where each root sits *in this repository*. Descriptive only: it is never used to derive a path. A caller
// must supply absolute roots; with `requireReviewedLocations` the validator additionally checks that the roots
// it was handed are these reviewed locations, so a caller cannot label an arbitrary directory "the catalog".
export const REVIEWED_ROOT_LOCATIONS = Object.freeze({
  catalog: 'apps/catalog',
  worker: 'infrastructure/cloudflare',
});

// The reviewed input set. Every entry names its own root, so the lockfile can live at the repository root
// while the application inputs live inside the app. Adding an input is a reviewed change to this constant.
export const REVIEWED_MAPPING_SPEC = Object.freeze({
  repository: Object.freeze([
    Object.freeze({ path: 'package.json', kind: INPUT_KINDS.FILE }),
    Object.freeze({ path: 'package-lock.json', kind: INPUT_KINDS.FILE }),
  ]),
  catalog: Object.freeze([
    Object.freeze({ path: 'package.json', kind: INPUT_KINDS.FILE }),
    Object.freeze({ path: 'index.html', kind: INPUT_KINDS.FILE }),
    Object.freeze({ path: 'vite.config.js', kind: INPUT_KINDS.FILE }),
    Object.freeze({ path: 'src', kind: INPUT_KINDS.DIRECTORY }),
    Object.freeze({ path: 'src/main.js', kind: INPUT_KINDS.FILE }),
  ]),
  worker: Object.freeze([
    Object.freeze({ path: 'worker.mjs', kind: INPUT_KINDS.FILE }),
    Object.freeze({ path: 'wrangler.jsonc', kind: INPUT_KINDS.FILE }),
  ]),
});

// How the reviewed set maps onto the nine historical R22 names, so the correspondence is not buried in prose.
export const R22_CORRESPONDENCE = Object.freeze([
  Object.freeze({ r22: 'package.json', role: 'repository', path: 'package.json' }),
  Object.freeze({ r22: 'package-lock.json', role: 'repository', path: 'package-lock.json' }),
  Object.freeze({ r22: 'vite.config.js', role: 'catalog', path: 'vite.config.js' }),
  Object.freeze({ r22: 'catalog.html', role: 'catalog', path: 'index.html', note: 'the catalog entry point is apps/catalog/index.html; R22 expected a second HTML entry that this app does not have' }),
  Object.freeze({ r22: 'index.html', role: 'catalog', path: 'index.html', note: 'R22 had two entries; C3-R34 built one, deliberately' }),
  Object.freeze({ r22: 'cloudflare/api/wrangler.jsonc', role: 'worker', path: 'wrangler.jsonc' }),
  Object.freeze({ r22: 'src/', role: 'catalog', path: 'src' }),
  Object.freeze({ r22: 'cloudflare/api/src/', role: 'worker', path: 'worker.mjs', note: 'reduced to the single tracked entry point; that directory does not exist here' }),
  Object.freeze({ r22: 'lib/assets/', role: null, path: null, note: 'ABSENT. Generated library data does not exist and C3-R35 does not invent it' }),
]);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const equalPath = (a, b) => a.toLowerCase() === b.toLowerCase();
const inside = (parent, child) => child.toLowerCase().startsWith((parent + path.sep).toLowerCase());

// Rejects a root that is not an absolute, existing, real directory. A symlinked root is refused: a root is the
// anchor for every containment decision below, so it may not itself be a redirect.
function resolveRoot(role, value) {
  if (typeof value !== 'string' || value.length === 0) throw Error(`R35_ROOT_REQUIRED:${role}`);
  if (!path.isAbsolute(value)) throw Error(`R35_ROOT_NOT_ABSOLUTE:${role}`);
  let stats;
  try {
    stats = fs.lstatSync(value);
  } catch {
    throw Error(`R35_ROOT_UNAVAILABLE:${role}`);
  }
  if (stats.isSymbolicLink()) throw Error(`R35_ROOT_SYMLINK:${role}`);
  if (!stats.isDirectory()) throw Error(`R35_ROOT_NOT_DIRECTORY:${role}`);
  return fs.realpathSync(value);
}

// A declared input path must be relative and must have no empty, `.` or `..` segment. Checked as text before any
// filesystem access, so traversal cannot depend on how the string would be normalised on the way in.
function assertRelativeInputPath(role, value) {
  if (typeof value !== 'string' || value.length === 0) throw Error(`R35_INPUT_PATH_INVALID:${role}`);
  if (path.isAbsolute(value)) throw Error(`R35_INPUT_PATH_ABSOLUTE:${role}/${value}`);
  for (const segment of value.split(/[\\/]/)) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw Error(`R35_INPUT_PATH_TRAVERSAL:${role}/${value}`);
    }
  }
  return value.split(/[\\/]/).join(path.sep);
}

// Deterministic digest of a directory: sorted relative paths with their hashes, so the value cannot depend on
// enumeration order. A symlink anywhere inside an input directory is refused, for the same reason as an input.
function digestDirectory(root) {
  const entries = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stats = fs.lstatSync(absolute);
      if (stats.isSymbolicLink()) throw Error(`R35_INPUT_SYMLINK:${relative}`);
      if (stats.isDirectory()) {
        entries.push(['d', relative]);
        visit(absolute);
      } else if (stats.isFile()) {
        entries.push(['f', relative, sha256(fs.readFileSync(absolute))]);
      } else {
        throw Error(`R35_INPUT_UNSUPPORTED:${relative}`);
      }
    }
  };
  visit(root);
  return { kind: INPUT_KINDS.DIRECTORY, entries, sha256: sha256(Buffer.from(JSON.stringify(entries), 'utf8')) };
}

// Validates the output destination. The temporary-tier policy is the R28 contract, reused rather than
// reinvented: a staging or production destination cannot even be expressed, because the policy root must
// resolve inside the OS temporary directory.
export function assertOutputRoot(policy, outputRoot, sourceRoots = []) {
  const authorised = assertPolicy(policy);
  if (typeof outputRoot !== 'string' || outputRoot.length === 0) throw Error('R35_OUTPUT_REQUIRED');
  let out;
  try {
    out = fs.realpathSync(outputRoot);
  } catch {
    throw Error('R35_OUTPUT_UNAVAILABLE');
  }
  if (!inside(authorised.rootDir, out)) throw Error('R35_OUTPUT_OUTSIDE_POLICY');
  for (const root of sourceRoots) {
    if (equalPath(out, root) || inside(root, out)) throw Error('R35_OUTPUT_INSIDE_SOURCE_ROOT');
    if (inside(out, root)) throw Error('R35_OUTPUT_CONTAINS_SOURCE_ROOT');
  }
  if (fs.readdirSync(out).length) throw Error('R35_OUTPUT_NOT_EMPTY');
  return out;
}


// The contract itself. Fail-closed and ordered: the policy is re-derived first, then every root, then the
// structural relationships, then the output destination, then each declared input. Nothing is normalised
// silently and nothing is inferred.
export function assertBuildInputMapping({
  policy,
  outputRoot,
  roots,
  inputs = REVIEWED_MAPPING_SPEC,
  requireReviewedLocations = false
} = {}) {
  const authorised = assertPolicy(policy);
  if (!roots || typeof roots !== 'object' || Array.isArray(roots)) throw Error('R35_ROOTS_REQUIRED');

  const resolved = {};
  for (const role of ROLE_ORDER) resolved[role] = resolveRoot(role, roots[role]);
  const { repository, catalog, worker } = resolved;

  // Distinct, non-overlapping, and both application roots inside the repository. A nested-application mistake
  // (catalog inside worker, or the reverse) is refused rather than resolved by precedence.
  if (equalPath(repository, catalog) || equalPath(repository, worker) || equalPath(catalog, worker)) {
    throw Error('R35_ROOTS_IDENTICAL');
  }
  if (inside(worker, catalog)) throw Error('R35_ROOTS_NESTED:worker-in-catalog');
  if (inside(catalog, worker)) throw Error('R35_ROOTS_NESTED:catalog-in-worker');
  if (!inside(repository, catalog)) throw Error('R35_CATALOG_OUTSIDE_REPOSITORY');
  if (!inside(repository, worker)) throw Error('R35_WORKER_OUTSIDE_REPOSITORY');

  if (requireReviewedLocations) {
    for (const [role, location] of Object.entries(REVIEWED_ROOT_LOCATIONS)) {
      const expected = path.join(repository, ...location.split('/'));
      if (!equalPath(path.resolve(expected), resolved[role])) {
        throw Error(`R35_ROOT_NOT_REVIEWED_LOCATION:${role}`);
      }
    }
  }

  const out = assertOutputRoot(policy, outputRoot, [repository, catalog, worker]);

  if (!inputs || typeof inputs !== 'object') throw Error('R35_INPUTS_REQUIRED');

  const described = [];
  for (const role of ROLE_ORDER) {
    const declared = inputs[role];
    if (!Array.isArray(declared) || declared.length === 0) throw Error(`R35_INPUTS_REQUIRED:${role}`);
    for (const input of declared) {
      if (!input || typeof input !== 'object') throw Error(`R35_INPUT_INVALID:${role}`);
      const relative = assertRelativeInputPath(role, input.path);
      const kind = input.kind;
      if (kind !== INPUT_KINDS.FILE && kind !== INPUT_KINDS.DIRECTORY) {
        throw Error(`R35_INPUT_KIND_INVALID:${role}/${input.path}`);
      }

      const root = resolved[role];
      const absolute = path.join(root, relative);
      let stats;
      try {
        stats = fs.lstatSync(absolute);
      } catch {
        throw Error(`R35_INPUT_MISSING:${role}/${input.path}`);
      }
      // lstat, not stat: an input that is itself a link is refused even when it points inside the root, because
      // the reviewed input is the file at that path, not whatever it currently redirects to.
      if (stats.isSymbolicLink()) throw Error(`R35_INPUT_SYMLINK:${role}/${input.path}`);

      const real = fs.realpathSync(absolute);
      if (!inside(root, real) && !equalPath(root, real)) {
        throw Error(`R35_INPUT_ESCAPES_ROOT:${role}/${input.path}`);
      }

      if (kind === INPUT_KINDS.FILE) {
        if (!stats.isFile()) throw Error(`R35_INPUT_KIND_MISMATCH:${role}/${input.path}`);
        const bytes = fs.readFileSync(real);
        described.push(Object.freeze({
          role, path: input.path, kind, absolute: real, size: bytes.length, sha256: sha256(bytes)
        }));
      } else {
        if (!stats.isDirectory()) throw Error(`R35_INPUT_KIND_MISMATCH:${role}/${input.path}`);
        const digest = digestDirectory(real);
        described.push(Object.freeze({
          role, path: input.path, kind, absolute: real,
          size: digest.entries.length, sha256: digest.sha256,
          entries: Object.freeze(digest.entries.map((entry) => Object.freeze(entry)))
        }));
      }
    }
  }

  return Object.freeze({
    ok: true,
    roots: Object.freeze(resolved),
    policyRoot: authorised.rootDir,
    outputRoot: out,
    inputs: Object.freeze(described),
    claims: Object.freeze({
      buildExecuted: false,
      workerBundled: false,
      networkUsed: false,
      evidenceProduced: false,
      publicationAuthorized: false,
      deploymentAuthorized: false,
      gitCommitVerified: false
    }),
    notEstablished: Object.freeze(['actualBuild', 'sourceCommitProvenance', 'trustedCiAttestation', 'publicationAuthority'])
  });
}

// C3-R35 Phase D: the Worker boundary. `infrastructure/cloudflare/worker.mjs` is the tracked source of truth.
// A future bundler may inline it, but it may not acquire a capability in the process.
export const WORKER_BOUNDARY = Object.freeze({
  entry: 'worker.mjs',
  config: 'wrangler.jsonc',
  expectedMain: './worker.mjs',
  // The only import form allowed today: a sibling module inside the Worker root. This is also the channel a
  // future generated-data module would travel through, so it never depends on privileged Node code.
  allowedImportPrefix: './',
  forbidden: Object.freeze([
    'node:',
    'require(',
    'process.env',
    'infrastructure/c3',
    'apps/web',
    'lib/assets',
    'wrangler deploy',
  ]),
});

function stripCodeComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n');
}

const IMPORT_SPECIFIER = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

// Validates the Worker's source of truth without running, bundling or deploying it.
export function assertWorkerBoundary({ root, entry = WORKER_BOUNDARY.entry, config = WORKER_BOUNDARY.config } = {}) {
  if (typeof root !== 'string' || root.length === 0) throw Error('R35_WORKER_ROOT_REQUIRED');
  const workerRoot = resolveRoot(INPUT_ROLES.WORKER, root);

  const entryPath = path.join(workerRoot, ...entry.split('/'));
  let entryStats;
  try {
    entryStats = fs.lstatSync(entryPath);
  } catch {
    throw Error(`R35_WORKER_ENTRY_MISSING:${entry}`);
  }
  if (entryStats.isSymbolicLink()) throw Error(`R35_WORKER_ENTRY_SYMLINK:${entry}`);
  if (!entryStats.isFile()) throw Error(`R35_WORKER_ENTRY_NOT_FILE:${entry}`);
  const entryReal = fs.realpathSync(entryPath);
  if (!inside(workerRoot, entryReal)) throw Error(`R35_WORKER_ENTRY_ESCAPES_ROOT:${entry}`);

  const configPath = path.join(workerRoot, ...config.split('/'));
  let configStats;
  try {
    configStats = fs.lstatSync(configPath);
  } catch {
    throw Error(`R35_WORKER_CONFIG_MISSING:${config}`);
  }
  if (configStats.isSymbolicLink()) throw Error(`R35_WORKER_CONFIG_SYMLINK:${config}`);
  let parsed;
  try {
    parsed = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
  } catch {
    throw Error(`R35_WORKER_CONFIG_UNREADABLE:${config}`);
  }
  // The configuration must point at the file this contract treats as the source of truth.
  if (parsed?.main !== WORKER_BOUNDARY.expectedMain) {
    throw Error(`R35_WORKER_CONFIG_MAIN_MISMATCH:${String(parsed?.main)}`);
  }

  const source = fs.readFileSync(entryReal, 'utf8');
  const code = stripCodeComments(source);
  for (const token of WORKER_BOUNDARY.forbidden) {
    if (code.includes(token)) throw Error(`R35_WORKER_FORBIDDEN:${token}`);
  }

  const imports = [];
  for (const match of code.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier.startsWith(WORKER_BOUNDARY.allowedImportPrefix)) {
      throw Error(`R35_WORKER_IMPORT_FORBIDDEN:${specifier}`);
    }
    const target = path.resolve(path.dirname(entryReal), specifier);
    if (!inside(workerRoot, target)) throw Error(`R35_WORKER_IMPORT_ESCAPES_ROOT:${specifier}`);
    imports.push(specifier);
  }

  return Object.freeze({
    ok: true,
    root: workerRoot,
    entry: Object.freeze({ path: entry, absolute: entryReal, sha256: sha256(source), bytes: Buffer.byteLength(source) }),
    config: Object.freeze({ path: config, absolute: configPath, main: parsed.main }),
    imports: Object.freeze(imports),
    filesystemFree: imports.length === 0,
    claims: Object.freeze({ bundled: false, deployed: false, routesAdded: false })
  });
}


