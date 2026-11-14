#!/usr/bin/env node
// C3-R37C — build a versioned, hash-covered integration manifest for a specific Git commit.
//
// Closes B30: the C3-R37A inventory was derived from `git status`, which cannot report a file that .gitignore hides.
// Here the tracked set comes from `git ls-tree` (authoritative for the commit) and ignored-but-reviewed evidence is
// added from an explicit allowlist. Excluded generated material is enumerated with a reason, so "absent" is a
// recorded decision rather than an omission.
//
// Usage: node docs/c3-r37c/tools/build-integration-manifest.mjs <repoDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const AUTHORITATIVE = path.resolve(here, '..', '..', '..');
const OUT = path.join(AUTHORITATIVE, 'docs', 'c3-r37c', 'C3-R37C-INTEGRATION-MANIFEST.json');
const REPO = path.resolve(process.argv[2] ?? AUTHORITATIVE);

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args, cwd = REPO) => {
  const result = spawnSync('git', args, { cwd, encoding: 'buffer' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return result.stdout;
};
const gitText = (args, cwd = REPO) => git(args, cwd).toString('utf8').trim();

const commit = gitText(['rev-parse', 'HEAD']);
const tree = gitText(['rev-parse', 'HEAD^{tree}']);
const parent = gitText(['rev-parse', 'HEAD^']);

// --- every tracked file at this commit, with the hash of the bytes a clone receives -------------------------
const tracked = gitText(['ls-tree', '-r', '--name-only', commit]).split('\n').filter(Boolean).map((p) => {
  const blob = git(['cat-file', 'blob', `${commit}:${p}`]);
  return { path: p, bytes: blob.length, sha256: sha(blob) };
});

// --- what this commit changed relative to its parent -------------------------------------------------------
const changed = gitText(['diff', '--name-status', parent, commit]).split('\n').filter(Boolean).map((line) => {
  const [status, ...rest] = line.split('\t');
  return { status, path: rest.join('\t') };
});

// --- reviewed evidence that .gitignore hides, listed by exact path (B30) -----------------------------------
const ALLOWLIST = path.join(AUTHORITATIVE, 'docs', 'c3-r37c', 'C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json');
const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
const exceptions = allowlist.exceptions.map((entry) => {
  const blob = git(['cat-file', 'blob', `${commit}:${entry.path}`]).toString('binary');
  const committedBytes = Buffer.from(blob, 'binary');
  return {
    path: entry.path,
    bytes: committedBytes.length,
    sha256: sha(committedBytes),
    matchesExpected: sha(committedBytes) === entry.sha256,
    justification: entry.justification,
    ignoredBy: entry.ignoredBy,
    gitDisposition: entry.gitDisposition
  };
});

// --- canonical digest over rows and exceptions, so tampering with any row is detectable ---------------------
function canonicalDigest(rows, exc) {
  const parts = [];
  for (const row of rows) parts.push(`row|${row.path.length}:${row.path}|${row.sha256}`);
  for (const entry of exc) parts.push(`exc|${entry.path.length}:${entry.path}|${entry.sha256}|${entry.gitDisposition}`);
  return sha(Buffer.from(parts.join('\n'), 'utf8'));
}

const manifest = {
  schema: 'alp-c3-integration-manifest-v1',
  generatedFor: { commit, tree, parent },
  counts: { tracked: tracked.length, changed: changed.length, exceptions: exceptions.length },
  policies: {
    publicationAuthorized: false,
    deployAllowed: false,
    sourceCommitVerified: false,
    ciAttested: false,
    note: 'a manifest describes content; it never confers publisher identity, CI attestation or release approval'
  },
  exceptions,
  excluded: allowlist.excluded,
  changed,
  rows: tracked
};
manifest.manifestDigest = canonicalDigest(tracked, exceptions);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
const self = sha(fs.readFileSync(OUT));
console.log(JSON.stringify({
  commit, tree, parent,
  tracked: tracked.length,
  changed: changed.length,
  exceptions: exceptions.length,
  exceptionsMatchExpected: exceptions.every((e) => e.matchesExpected),
  manifestDigest: manifest.manifestDigest,
  fileSha256: self
}, null, 2));
