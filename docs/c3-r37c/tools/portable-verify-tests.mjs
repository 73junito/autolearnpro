#!/usr/bin/env node
// C3-R37C — negative tests for the portable verifier.
//
// Each case clones the candidate, commits exactly one defect, and asserts the verifier refuses AND names a check that
// should have caught it. Asserting only "exit 1" would let any failure satisfy any test.
//
// The verified commit is passed in, not read from HEAD: the reviewed manifest lives in a later commit, so HEAD is
// allowed to differ from the target by review documentation only. A defect committed on top is therefore caught by
// 'nothing-outside-review-docs-differs', and that is recorded as the expected catcher where it applies.
//
// Usage: node docs/c3-r37c/tools/portable-verify-tests.mjs <candidateDir> <reviewedCommit> <workBase>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERIFIER = path.join(here, 'portable-verify.mjs');
const CANDIDATE = path.resolve(process.argv[2] ?? '');
const REVIEWED = process.argv[3];
const WORK = path.resolve(process.argv[4] ?? '');
if (!CANDIDATE || !REVIEWED || !WORK) throw new Error('usage: portable-verify-tests.mjs <candidateDir> <reviewedCommit> <workBase>');

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

function verify(dir, expectCommit) {
  const run = spawnSync(process.execPath, [VERIFIER, '--repo', dir, '--expect-commit', expectCommit, '--json'],
    { encoding: 'utf8', cwd: dir });
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

// 1 — the untouched candidate must pass, or every other case means nothing.
{
  const dir = cloneInto('case-01-clean');
  const r = verify(dir, REVIEWED);
  record('clean candidate passes', r.status === 0 && r.failed?.length === 0 && r.total === 15,
    { exit: r.status, total: r.total, failed: r.failed });
}

// 2 — a forged expected commit that does not exist in the repository.
{
  const dir = cloneInto('case-02-wrong-commit');
  const r = verify(dir, '0'.repeat(40));
  record('nonexistent expected commit is refused', catches(r, ['expected-commit-matches-HEAD', 'manifest-schema-supported']),
    { exit: r.status, failed: r.failed });
}

// 3 — a real commit that is not an ancestor of HEAD (unrelated history).
{
  const dir = cloneInto('case-03-unrelated-commit');
  git(dir, ['checkout', '-q', '--orphan', 'orphan-probe']);
  git(dir, ['-c', 'user.name=probe', '-c', 'user.email=probe@local', 'commit', '-q', '--allow-empty', '-m', 'orphan'], FIXED_DATE);
  const orphan = git(dir, ['rev-parse', 'HEAD']);
  git(dir, ['checkout', '-q', '--detach', REVIEWED]);
  const r = verify(dir, orphan);
  record('commit outside the history is refused', catches(r, ['expected-commit-matches-HEAD']), { exit: r.status, failed: r.failed });
}

// 4 — Worker bytes changed on top of the verified commit.
{
  const dir = cloneInto('case-04-worker-changed');
  const p = path.join(dir, 'infrastructure/cloudflare/worker.mjs');
  fs.writeFileSync(p, `${fs.readFileSync(p, 'utf8')}// tampered\n`);
  commitAll(dir, 'tamper worker');
  const r = verify(dir, REVIEWED);
  record('changed Worker bytes are refused', catches(r, ['nothing-outside-review-docs-differs', 'manifest-rows-match-committed-blobs']),
    { exit: r.status, failed: r.failed });
}

// 5 — a C3 module deleted.
{
  const dir = cloneInto('case-05-module-missing');
  fs.rmSync(path.join(dir, 'infrastructure/c3/build/evidence-envelope.mjs'));
  commitAll(dir, 'drop module');
  const r = verify(dir, REVIEWED);
  record('missing C3 module is refused', catches(r, ['nothing-outside-review-docs-differs', 'manifest-rows-match-committed-blobs']),
    { exit: r.status, failed: r.failed });
}

// 6 — a reviewed log deleted (the B30 evidence).
{
  const dir = cloneInto('case-06-log-missing');
  fs.rmSync(path.join(dir, 'docs/c3-r36h3/logs/b23-trials-prefix.log'));
  commitAll(dir, 'drop log');
  const r = verify(dir, REVIEWED);
  record('missing reviewed log is refused', catches(r, ['nothing-outside-review-docs-differs', 'reviewed-evidence-exceptions-present']),
    { exit: r.status, failed: r.failed });
}

// 7 — a reviewed log replaced with different content.
{
  const dir = cloneInto('case-07-log-replaced');
  fs.writeFileSync(path.join(dir, 'docs/c3-r36h3/logs/b23-trials-prefix.log'), 'replaced\n');
  commitAll(dir, 'replace log');
  const r = verify(dir, REVIEWED);
  record('replaced reviewed log is refused', catches(r, ['nothing-outside-review-docs-differs', 'reviewed-evidence-exceptions-present']),
    { exit: r.status, failed: r.failed });
}

// 8 — the lockfile modified.
{
  const dir = cloneInto('case-08-lockfile-changed');
  const p = path.join(dir, 'package-lock.json');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('"lockfileVersion": 3', '"lockfileVersion": 3 '));
  commitAll(dir, 'tamper lockfile');
  const r = verify(dir, REVIEWED);
  record('modified lockfile is refused', catches(r, ['nothing-outside-review-docs-differs', 'manifest-rows-match-committed-blobs']),
    { exit: r.status, failed: r.failed });
}

// 9 — a required scaffold removed.
{
  const dir = cloneInto('case-09-scaffold-missing');
  fs.rmSync(path.join(dir, 'packages/ui/README.md'));
  commitAll(dir, 'drop scaffold');
  const r = verify(dir, REVIEWED);
  record('missing required scaffold is refused', catches(r, ['nothing-outside-review-docs-differs', 'required-scaffolds-present']),
    { exit: r.status, failed: r.failed });
}


// 10 — an extra source file the manifest does not list.
{
  const dir = cloneInto('case-10-unexpected-file');
  fs.writeFileSync(path.join(dir, 'infrastructure/c3/build/unreviewed.mjs'), 'export const x = 1;\n');
  commitAll(dir, 'add unreviewed file');
  const r = verify(dir, REVIEWED);
  record('unexpected integration file is refused', catches(r, ['nothing-outside-review-docs-differs']),
    { exit: r.status, failed: r.failed });
}

// 11 — an unauthorised deployment workflow.
{
  const dir = cloneInto('case-11-workflow-added');
  fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.github/workflows/deploy.yml'),
    'name: deploy\non: push\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx wrangler deploy\n');
  commitAll(dir, 'add deploy workflow');
  const r = verify(dir, REVIEWED);
  record('unauthorised workflow is refused', catches(r, ['nothing-outside-review-docs-differs']),
    { exit: r.status, failed: r.failed });
}

// 12 — the manifest removed, so the verifier has nothing to verify against.
{
  const dir = cloneInto('case-12-manifest-missing');
  fs.rmSync(path.join(dir, 'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json'));
  commitAll(dir, 'drop manifest');
  const r = verify(dir, REVIEWED);
  record('missing manifest is refused', catches(r, ['manifest-schema-supported', 'manifest-rows-match-committed-blobs']),
    { exit: r.status, failed: r.failed });
}

// 13 — a sensitive file committed. `*.pem` is ignored, so it only reaches the commit with an explicit force-add,
// which is exactly the accident this check exists to catch.
{
  const dir = cloneInto('case-13-secret-present');
  fs.writeFileSync(path.join(dir, 'apps/web/credentials.pem'), 'PRIVATE KEY\n');
  git(dir, ['add', '-f', 'apps/web/credentials.pem']);
  git(dir, ['-c', 'user.name=probe', '-c', 'user.email=probe@local', 'commit', '-q', '-m', 'force-add pem'], FIXED_DATE);
  const r = verify(dir, REVIEWED);
  const tracked = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.includes('credentials.pem');
  record('force-added sensitive file is refused', tracked && catches(r, ['no-sensitive-files-tracked', 'nothing-outside-review-docs-differs']),
    { exit: r.status, tracked, failed: r.failed });
}

// 14 — omitting the expected commit must be a usage refusal, not a pass.
{
  const dir = cloneInto('case-14-no-expectation');
  const run = spawnSync(process.execPath, [VERIFIER, '--repo', dir], { encoding: 'utf8', cwd: dir });
  record('omitting the expected commit is a refusal', run.status !== 0 && /R37C_EXPECT_COMMIT_REQUIRED/.test(String(run.stderr)),
    { exit: run.status, stderr: String(run.stderr).split('\n')[0] });
}

// 15 — the check count is identical in every run, because a shrinking denominator hides failures.
{
  const dir = cloneInto('case-15-count');
  const clean = verify(dir, REVIEWED);
  fs.writeFileSync(path.join(dir, 'infrastructure/c3/build/unreviewed2.mjs'), 'export const y = 2;\n');
  commitAll(dir, 'drift');
  const dirty = verify(dir, REVIEWED);
  record('check count is fixed across pass and fail runs', clean.total === 15 && dirty.total === 15,
    { cleanTotal: clean.total, dirtyTotal: dirty.total });
}

const allOk = cases.every((c) => c.ok);
const out = path.join(WORK, 'portable-verify-tests.json');
fs.writeFileSync(out, `${JSON.stringify({ schema: 'alp-c3-r37c-negative-tests-v1', reviewedCommit: REVIEWED, cases, allExpectationsMet: allOk }, null, 2)}\n`);
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  cases=${cases.length}  sha256=${sha(fs.readFileSync(out))}`);
process.exitCode = allOk ? 0 : 1;

