#!/usr/bin/env node
// C3-R37C — build a second disposable candidate: the C3-R37B candidate plus the C3-R37C tooling and records.
//
// The portable verifier and its manifest must live in the commit they verify, otherwise "the repository can verify
// itself" is untested. This wraps the R37B candidate rather than modifying it, so the reviewed R37B tool
// (c315e6f0…) and its commit (7d51b67f…) stay intact and remain the documented parent of this one.
//
// Usage: node docs/c3-r37c/tools/build-candidate-2.mjs <baseDir> <r37bCandidateDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const BASE = process.argv[2];
const PARENT_REPO = process.argv[3];
if (!BASE || !PARENT_REPO) throw new Error('usage: build-candidate-2.mjs <baseDir> <r37bCandidateDir>');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const FIXED_DATE = { GIT_AUTHOR_DATE: '2026-11-04T00:00:00+0000', GIT_COMMITTER_DATE: '2026-11-04T00:00:00+0000' };
const git = (cwd, args, env) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${result.stderr}`);
  return String(result.stdout).trim();
};

// The R37C artifacts that this candidate adds. Exact paths, so the integration set stays enumerable.
const ADDITIONS = [
  'docs/c3-r37c/tools/build-integration-manifest.mjs',
  'docs/c3-r37c/tools/portable-verify.mjs',
  'docs/c3-r37c/tools/build-candidate-2.mjs',
  'docs/c3-r37c/tools/portable-verify-tests.mjs',
  'docs/c3-r37c/C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json'
];
// The manifest describes a commit and therefore cannot be part of it; when one exists it is carried by the follow-up
// commit, and the verifier targets the earlier commit explicitly.
const MANIFEST = 'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json';
if (fs.existsSync(path.join(REPO, MANIFEST))) ADDITIONS.push(MANIFEST);

fs.mkdirSync(BASE, { recursive: true });
const candidate = path.join(BASE, 'candidate');
git(BASE, ['clone', '--quiet', '--no-hardlinks', PARENT_REPO, candidate]);

const copied = [];
for (const rel of ADDITIONS) {
  const from = path.join(REPO, rel);
  const to = path.join(candidate, rel);
  if (!fs.existsSync(from)) throw new Error(`R37C_ADDITION_MISSING:${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied.push({ path: rel, bytes: fs.statSync(to).size, sha256: sha(fs.readFileSync(to)) });
}

git(candidate, ['add', '-A']);
const staged = git(candidate, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
const blobChecks = copied.map((c) => {
  const blob = spawnSync('git', ['cat-file', 'blob', `:${c.path}`], { cwd: candidate });
  if (blob.status !== 0) throw new Error(`R37C_NO_STAGED_BLOB:${c.path}`);
  return { path: c.path, verbatim: sha(blob.stdout) === c.sha256 };
});

git(candidate, ['-c', 'user.name=C3 candidate', '-c', 'user.email=candidate@local', 'commit', '-q', '-m',
  'C3-R37C portable verifier and complete evidence inventory (disposable; not authorised for publication)'], FIXED_DATE);

const head = git(candidate, ['rev-parse', 'HEAD']);
console.log(JSON.stringify({
  parent: git(candidate, ['rev-parse', 'HEAD^']),
  commit: head,
  tree: git(candidate, ['rev-parse', 'HEAD^{tree}']),
  staged: staged.length,
  additions: copied.length,
  blobsVerbatim: blobChecks.every((b) => b.verbatim),
  status: git(candidate, ['status', '--porcelain'])
}, null, 2));
