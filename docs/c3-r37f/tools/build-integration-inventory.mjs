#!/usr/bin/env node
// C3-R37F — final proposed authoritative integration inventory.
//
// Supersedes the C3-R37A inventory for planning purposes only: that file stays untouched as reviewed history. This one
// adds the three corrections the work has produced since:
//   * reviewed evidence that `.gitignore` hides is listed explicitly (B30), never by pattern;
//   * the exclusions carry reasons, so "absent" is a decision;
//   * duplicate screenshots are deduplicated by content hash.
//
// Usage: node docs/c3-r37f/tools/build-integration-inventory.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r37f', 'C3-R37F-INTEGRATION-INVENTORY.json');
const ALLOWLIST = path.join(REPO, 'docs', 'c3-r37c', 'C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args) => {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return String(result.stdout);
};

const rows = [];
for (const line of git(['status', '--porcelain', '--untracked-files=all']).split('\n')) {
  if (!line.trim()) continue;
  rows.push({ path: line.slice(3).trim(), gitStatus: line.slice(0, 2).trim() || '??' });
}
for (const row of rows) {
  const buffer = fs.readFileSync(path.join(REPO, row.path));
  row.bytes = buffer.length;
  row.sha256 = sha(buffer);
}

// Screenshot deduplication by content: one canonical copy per distinct byte sequence.
const pngs = rows.filter((row) => row.path.toLowerCase().endsWith('.png'));
const canonical = new Map();
for (const row of pngs) {
  const group = pngs.filter((other) => other.sha256 === row.sha256).sort((a, b) => a.path.localeCompare(b.path));
  canonical.set(row.sha256, group[0].path);
}

function classify(row) {
  const p = row.path;
  const lower = p.toLowerCase();
  if (lower.endsWith('.png')) {
    return canonical.get(row.sha256) === p
      ? { action: 'add', kind: 'evidence', justification: 'canonical copy of this screenshot byte sequence' }
      : { action: 'exclude', kind: 'generated-evidence', justification: `byte-identical duplicate of ${canonical.get(row.sha256)}` };
  }
  if (lower.includes('/runs/') && lower.endsWith('gate-results.json')) {
    return { action: 'exclude', kind: 'generated-evidence', justification: 'per-run output embedding an ephemeral port and an absolute path (B21)' };
  }
  if (p === '.gitignore') return { action: 'modify', kind: 'configuration', justification: 'prerequisite: un-ignores infrastructure/c3/build/ and the four reviewed logs' };
  if (p === 'package-lock.json') return { action: 'modify', kind: 'configuration', justification: 'registers the apps/catalog workspace' };
  if (lower.endsWith('.md')) return { action: 'add', kind: 'documentation', justification: 'decision record or scaffold README' };
  if (lower.startsWith('tests/')) return { action: 'add', kind: 'test', justification: 'test suite or fixture' };
  if (lower.startsWith('infrastructure/c3/') || lower.startsWith('apps/catalog/')) return { action: 'add', kind: 'source', justification: 'C3 or catalog source' };
  if (lower.endsWith('.json')) return { action: 'add', kind: 'evidence', justification: 'machine-readable manifest or reviewed result' };
  if (lower.endsWith('.mjs')) return { action: 'add', kind: 'source', justification: 'tool or module source' };
  return { action: 'add', kind: 'tooling', justification: 'tooling asset referenced by a record' };
}
for (const row of rows) Object.assign(row, classify(row));

// Reviewed-but-ignored evidence, listed explicitly (B30). The git-derived set cannot see these at all.
const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
const exceptions = allowlist.exceptions.map((entry) => {
  const buffer = fs.readFileSync(path.join(REPO, entry.path));
  return {
    path: entry.path,
    bytes: buffer.length,
    sha256: sha(buffer),
    matchesRecordedDigest: sha(buffer) === entry.sha256,
    ignoredBy: entry.ignoredBy,
    justification: entry.justification
  };
});

const byAction = rows.reduce((acc, row) => { acc[row.action] = (acc[row.action] ?? 0) + 1; return acc; }, {});
const paths = rows.map((row) => row.path);
const manifest = {
  schema: 'alp-c3-r37f-integration-inventory-v1',
  generatedFor: { authoritativeHead: git(['rev-parse', 'HEAD']).trim(), candidateCommit: process.argv[2] ?? null },
  invariants: {
    rowCount: rows.length,
    duplicatePaths: paths.filter((p, i) => paths.indexOf(p) !== i),
    deferredCount: rows.filter((row) => row.action === 'defer').length
  },
  counts: {
    add: byAction.add,
    modify: byAction.modify,
    exclude: byAction.exclude,
    reviewedIgnoredExceptions: exceptions.length
  },
  exceptions,
  excluded: allowlist.excluded,
  rows
};
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  rows: rows.length,
  counts: manifest.counts,
  invariants: manifest.invariants,
  exceptionsMatchRecordedDigest: exceptions.every((e) => e.matchesRecordedDigest),
  out: 'docs/c3-r37f/C3-R37F-INTEGRATION-INVENTORY.json'
}, null, 2));
