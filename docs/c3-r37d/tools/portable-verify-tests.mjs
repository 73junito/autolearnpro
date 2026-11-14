#!/usr/bin/env node
// C3-R37D — negative tests for the hardened portable verifier.
//
// Every case clones the reviewed carry commit, commits exactly one defect, and asserts the verifier refuses AND names a
// check that should have caught it. Asserting only "exit 1" would let any failure satisfy any test.
//
// Usage: node docs/c3-r37d/tools/portable-verify-tests.mjs <candidateDir> <reviewedCommit> <trustAnchor> <workBase>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER = path.join(here, 'portable-verify.mjs');
const CANDIDATE = path.resolve(process.argv[2] ?? '');
const REVIEWED = process.argv[3];
const ANCHOR = process.argv[4];
const WORK = path.resolve(process.argv[5] ?? '');
if (!CANDIDATE || !REVIEWED || !ANCHOR || !WORK) {
  throw new Error('usage: portable-verify-tests.mjs <candidateDir> <reviewedCommit> <trustAnchor> <workBase>');
}

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const FIXED_DATE = { GIT_AUTHOR_DATE: '2026-11-04T00:00:00+0000', GIT_COMMITTER_DATE: '2026-11-04T00:00:00+0000' };
const git = (cwd, args, env) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${result.stderr}`);
  return String(result.stdout).trim();
};

function cloneInto(name) {
  const dir = path.join(WORK, name);
  fs.rmSync(dir, { recursive: true, force: true });
  git(WORK, ['clone', '--quiet', '--no-hardlinks', CANDIDATE, dir]);
  return dir;
}
const commitAll = (dir, message) => {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=probe', '-c', 'user.email=probe@local', 'commit', '-q', '--allow-empty', '-m', message], FIXED_DATE);
  return git(dir, ['rev-parse', 'HEAD']);
};

function verify(dir, expectCommit, anchor) {
  const argv = [VERIFIER, '--repo', dir, '--expect-commit', expectCommit, '--json'];
  if (anchor !== null) argv.push('--trust-carry', anchor);
  const run = spawnSync(process.execPath, argv, { encoding: 'utf8', cwd: dir });
  const text = String(run.stdout);
  const start = text.indexOf('{"verdict"');
  let parsed = null;
  try {
    parsed = JSON.parse(text.slice(start >= 0 ? start : text.indexOf('{')));
  } catch {
    parsed = null;
  }
  return { status: run.status, stderr: String(run.stderr), failed: parsed?.verdict?.failed ?? null, total: parsed?.verdict?.total ?? null };
}

const cases = [];
const record = (name, ok, detail) => { cases.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`); };
const catches = (r, names) => r.status === 1 && Array.isArray(r.failed) && names.some((n) => r.failed.includes(n));
const CARRY_CHECKS = ['carry-set-matches-reviewed-policy', 'carry-digest-matches-trusted-anchor', 'verification-implementation-is-anchored'];

// 1 — the untouched reviewed checkout must pass.
{
  const dir = cloneInto('case-01-clean');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('clean reviewed checkout passes', r.status === 0 && r.failed?.length === 0 && r.total === 17,
    { exit: r.status, total: r.total, failed: r.failed });
}

// 2 — the verifier source changed (the reported B31 probe).
{
  const dir = cloneInto('case-02-verifier');
  fs.appendFileSync(path.join(dir, 'docs/c3-r37d/tools/portable-verify.mjs'), '// hostile\n');
  commitAll(dir, 'modify verifier');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('modified verifier is refused', catches(r, ['carry-set-matches-reviewed-policy']), { exit: r.status, failed: r.failed });
}

// 3 — the integration manifest changed.
{
  const dir = cloneInto('case-03-manifest');
  const p = path.join(dir, 'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('"manifestDigest"', '"manifestDigest" '));
  commitAll(dir, 'modify manifest');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('modified manifest is refused', catches(r, CARRY_CHECKS), { exit: r.status, failed: r.failed });
}

// 4 — the reviewed-evidence allowlist changed.
{
  const dir = cloneInto('case-04-allowlist');
  const p = path.join(dir, 'docs/c3-r37c/C3-R37C-REVIEWED-EVIDENCE-ALLOWLIST.json');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('"exceptions"', '"exceptions" '));
  commitAll(dir, 'modify allowlist');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('modified allowlist is refused', catches(r, CARRY_CHECKS), { exit: r.status, failed: r.failed });
}

// 5 — the manifest generator changed.
{
  const dir = cloneInto('case-05-generator');
  fs.appendFileSync(path.join(dir, 'docs/c3-r37d/tools/build-carry-policy.mjs'), '// altered generator\n');
  commitAll(dir, 'modify generator');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('modified policy generator is refused', catches(r, CARRY_CHECKS), { exit: r.status, failed: r.failed });
}

// 6 — the negative-test driver changed (not in the carry set at all).
{
  const dir = cloneInto('case-06-testdriver');
  fs.writeFileSync(path.join(dir, 'docs/c3-r37d/tools/portable-verify-tests.mjs'), '// rewritten tests\n');
  commitAll(dir, 'replace test driver');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('changed test driver is refused', catches(r, ['carry-set-matches-reviewed-policy']), { exit: r.status, failed: r.failed });
}

// 7 — an additional file anywhere under the review directory.
{
  const dir = cloneInto('case-07-extra-file');
  fs.writeFileSync(path.join(dir, 'docs/c3-r37d/EXTRA.md'), 'unreviewed addition\n');
  commitAll(dir, 'add extra file');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('extra file under the review directory is refused', catches(r, ['carry-set-matches-reviewed-policy']),
    { exit: r.status, failed: r.failed });
}

// 8 — a carry file deleted.
{
  const dir = cloneInto('case-08-deleted');
  fs.rmSync(path.join(dir, 'docs/c3-r37d/C3-R37D-CARRY-POLICY.json'));
  commitAll(dir, 'delete policy');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('deleted carry-policy file is refused', catches(r, ['carry-set-matches-reviewed-policy', 'carry-digest-matches-trusted-anchor']),
    { exit: r.status, failed: r.failed });
}

// 9 — a carry file renamed.
{
  const dir = cloneInto('case-09-renamed');
  git(dir, ['mv', 'docs/c3-r37d/tools/build-carry-policy.mjs', 'docs/c3-r37d/tools/renamed-generator.mjs']);
  commitAll(dir, 'rename generator');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('renamed carry file is refused', catches(r, ['carry-set-matches-reviewed-policy']), { exit: r.status, failed: r.failed });
}


// 10 — the Worker altered.
{
  const dir = cloneInto('case-10-worker');
  const p = path.join(dir, 'infrastructure/cloudflare/worker.mjs');
  fs.writeFileSync(p, `${fs.readFileSync(p, 'utf8')}// tampered\n`);
  commitAll(dir, 'tamper worker');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('altered Worker is refused', catches(r, CARRY_CHECKS), { exit: r.status, failed: r.failed });
}

// 11 — a reviewed log altered.
{
  const dir = cloneInto('case-11-log');
  fs.writeFileSync(path.join(dir, 'docs/c3-r36h3/logs/b23-trials-prefix.log'), 'replaced\n');
  commitAll(dir, 'replace log');
  const r = verify(dir, REVIEWED, ANCHOR);
  record('altered reviewed log is refused', catches(r, CARRY_CHECKS), { exit: r.status, failed: r.failed });
}

// 12 — an incorrect trust anchor supplied by the caller.
{
  const dir = cloneInto('case-12-bad-anchor');
  const r = verify(dir, REVIEWED, '0'.repeat(64));
  record('incorrect trust anchor is refused', catches(r, ['carry-digest-matches-trusted-anchor']), { exit: r.status, failed: r.failed });
}

// 13 — a commit that exists in the repository but is not in this checkout's own history.
{
  const dir = cloneInto('case-13-unrelated');
  const branchPoint = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '--orphan', 'orphan-probe']);
  git(dir, ['-c', 'user.name=probe', '-c', 'user.email=probe@local', 'commit', '-q', '--allow-empty', '-m', 'orphan'], FIXED_DATE);
  const orphan = git(dir, ['rev-parse', 'HEAD']);
  // Return to the reviewed line, so the orphan exists but is not an ancestor of HEAD.
  git(dir, ['checkout', '-q', '--detach', branchPoint]);
  const r = verify(dir, orphan, ANCHOR);
  record('unrelated history is refused', catches(r, ['expected-commit-matches-HEAD']),
    { exit: r.status, failed: r.failed, orphan: orphan.slice(0, 8), head: branchPoint.slice(0, 8) });
}

// 14 — a dirty working tree.
{
  const dir = cloneInto('case-14-dirty');
  fs.writeFileSync(path.join(dir, 'README.md'), `${fs.readFileSync(path.join(dir, 'README.md'), 'utf8')}dirty\n`);
  const r = verify(dir, REVIEWED, ANCHOR);
  record('dirty worktree is refused', catches(r, ['worktree-clean-except-ignored']), { exit: r.status, failed: r.failed });
}

// 15 — the trust input omitted: a usage refusal, not a silent pass.
{
  const dir = cloneInto('case-15-no-anchor');
  const r = verify(dir, REVIEWED, null);
  record('omitted trust anchor is a refusal', r.status !== 0 && /R37D_TRUST_CARRY_REQUIRED/.test(r.stderr),
    { exit: r.status, stderr: r.stderr.split('\n')[0] });
}

// 16 — a locally edited (uncommitted) verifier must be refused by the self-anchor check.
{
  const dir = cloneInto('case-16-local-verifier');
  const localVerifier = path.join(dir, 'docs/c3-r37d/tools/portable-verify.mjs');
  fs.appendFileSync(localVerifier, '// local edit, not committed\n');
  const run = spawnSync(process.execPath, [localVerifier, '--repo', dir, '--expect-commit', REVIEWED, '--trust-carry', ANCHOR, '--json'],
    { encoding: 'utf8', cwd: dir });
  const text = String(run.stdout);
  const start = text.indexOf('{"verdict"');
  let failed = null;
  try {
    failed = JSON.parse(text.slice(start >= 0 ? start : text.indexOf('{'))).verdict.failed;
  } catch {
    failed = null;
  }
  record('locally edited verifier is refused by its own anchor',
    run.status === 1 && Array.isArray(failed) && failed.includes('verification-implementation-is-anchored'),
    { exit: run.status, failed });
}

// 17 — the denominator is identical in passing and failing runs.
{
  const dir = cloneInto('case-17-count');
  const clean = verify(dir, REVIEWED, ANCHOR);
  fs.writeFileSync(path.join(dir, 'docs/c3-r37d/EXTRA2.md'), 'x\n');
  commitAll(dir, 'drift');
  const dirty = verify(dir, REVIEWED, ANCHOR);
  record('check count is fixed across pass and fail runs', clean.total === 17 && dirty.total === 17,
    { cleanTotal: clean.total, dirtyTotal: dirty.total });
}

const allOk = cases.every((c) => c.ok);
const out = path.join(WORK, 'portable-verify-tests.json');
fs.writeFileSync(out, `${JSON.stringify({
  schema: 'alp-c3-r37d-negative-tests-v1', reviewedCommit: REVIEWED, trustAnchor: ANCHOR, cases, allExpectationsMet: allOk
}, null, 2)}\n`);
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  cases=${cases.length}  sha256=${sha(fs.readFileSync(out))}`);
process.exitCode = allOk ? 0 : 1;

