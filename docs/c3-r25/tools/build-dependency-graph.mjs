// C3-R25 — build the transitive local-import graph for the reviewed C3 modules.
//
// READ-ONLY over the staging workspace: computes SHA-256 of every reachable local module and
// records who imports it. It does NOT copy, port or modify anything.
//
// Usage: node docs/c3-r25/tools/build-dependency-graph.mjs [--out <file>]
// Exit:  0 graph written and complete | 1 unreachable import or missing staging source

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// tools -> c3-r25 -> docs -> repository root (three levels; two lands inside docs/)
const repoRoot = path.resolve(here, '..', '..', '..');
const manifestPath = path.join(repoRoot, 'docs/c3-r25/c3-integration-source-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const staging = manifest.sourceWorkspace;

const outArgIdx = process.argv.indexOf('--out');
const outPath = outArgIdx > -1
  ? path.resolve(process.argv[outArgIdx + 1])
  : path.join(repoRoot, 'docs/c3-r25/c3-dependency-graph.json');

if (!fs.existsSync(staging)) {
  console.error(`C3-R25 ERROR: staging workspace not available at ${staging}`);
  process.exit(1);
}

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  const staticImport = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const cjsRequire = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [staticImport, dynamicImport, cjsRequire]) {
    let m;
    while ((m = re.exec(src))) specs.add(m[1]);
  }
  return [...specs];
}

const roots = manifest.files.map((f) => f.path);
const reviewed = new Set(roots);
const nodes = new Map();
const external = new Set();
const missing = [];

function walk(relPath, importedBy) {
  if (nodes.has(relPath)) {
    const existing = nodes.get(relPath);
    if (!existing.importedBy.includes(importedBy)) existing.importedBy.push(importedBy);
    return;
  }
  const abs = path.join(staging, ...relPath.split('/'));
  if (!fs.existsSync(abs)) {
    missing.push({ path: relPath, importedBy });
    return;
  }
  const node = {
    path: relPath,
    sha256: sha256(abs),
    bytes: fs.statSync(abs).size,
    inReviewedManifest: reviewed.has(relPath),
    importedBy: [importedBy],
    localImports: [],
  };
  nodes.set(relPath, node);

  for (const spec of importsOf(abs)) {
    const isLocal = spec.startsWith('./') || spec.startsWith('../');
    if (!isLocal) {
      external.add(spec);
      continue;
    }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relPath), spec));
    node.localImports.push(resolved);
    walk(resolved, relPath);
  }
}

for (const root of roots) walk(root, '<manifest>');

const ordered = [...nodes.values()]
  .sort((a, b) => a.path.localeCompare(b.path))
  .map((n) => ({ ...n, importedBy: [...new Set(n.importedBy)].sort() }));

const unreviewed = ordered.filter((n) => !n.inReviewedManifest).map((n) => n.path);

const graph = {
  schema: 'alp-c3-r25-dependency-graph-v1',
  generatedFrom: manifest.sourceWorkspace,
  reviewedManifestEntries: roots.length,
  reachableLocalModules: ordered.length,
  unreviewedLocalModules: unreviewed,
  externalImports: [...external].sort(),
  completeGraph: missing.length === 0,
};

fs.writeFileSync(outPath, `${JSON.stringify({ ...graph, modules: ordered, missing }, null, 2)}\n`);

console.log(`C3-R25 dependency graph written: ${path.relative(repoRoot, outPath)}`);
console.log(JSON.stringify(graph, null, 2));

if (missing.length) {
  console.error('C3-R25 ERROR: imports could not be resolved:', missing);
  process.exit(1);
}

// Fail closed: an import that no reviewed fingerprint covers is an unreviewed module inside a
// reviewed boundary. Reporting it without failing would let it pass unnoticed.
if (unreviewed.length) {
  console.error('C3-R25 ERROR: unreviewed local modules reachable from the manifest:', unreviewed);
  process.exit(1);
}

process.exit(0);
