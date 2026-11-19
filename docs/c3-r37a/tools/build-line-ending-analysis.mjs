// C3-R37.1 — measure the line-ending question against the real repository and the real experiment.
// Read-only: inspects git blobs, runs the disposable-repo experiment in a temp directory, writes one JSON file.
// Usage: node docs/c3-r37a/tools/build-line-ending-analysis.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r37a', 'C3-R37A-LINE-ENDING-ANALYSIS.json');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args, cwd = REPO) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return String(result.stdout);
};

// --- 1. the configuration in force, which is what actually decides the bytes ---------------------------------
const config = {
  coreAutocrlf: (spawnSync('git', ['config', '--get', 'core.autocrlf'], { cwd: REPO, encoding: 'utf8' }).stdout ?? '').trim() || '(unset)',
  coreEol: (spawnSync('git', ['config', '--get', 'core.eol'], { cwd: REPO, encoding: 'utf8' }).stdout ?? '').trim() || '(unset)',
  gitattributesPresent: fs.existsSync(path.join(REPO, '.gitattributes'))
};

// --- 2. tracked files: blob bytes versus worktree bytes ------------------------------------------------------
// `git cat-file -s` reports the stored object size, which is the only authority on what a clone would hand out.
const trackedFiles = ['package.json', 'infrastructure/cloudflare/worker.mjs', 'infrastructure/cloudflare/wrangler.jsonc', 'package-lock.json', 'README.md', '.npmrc'];
const tracked = trackedFiles.map((p) => {
  const worktree = fs.readFileSync(path.join(REPO, p));
  const text = worktree.toString('utf8');
  const crlfPairs = (text.match(/\r\n/g) ?? []).length;
  const blobBytes = Number(git(['cat-file', '-s', `HEAD:${p}`]).trim());
  const worktreeBytes = worktree.length;
  return {
    path: p,
    worktreeBytes,
    worktreeCrlfPairs: crlfPairs,
    worktreeSha256: sha(worktree),
    blobBytes,
    blobSha: git(['rev-parse', `HEAD:${p}`]).trim(),
    sizeDeltaBytes: worktreeBytes - blobBytes,
    // If the delta is exactly the CRLF count, the difference is pure line-ending transformation.
    deltaExplainedByCrlf: (worktreeBytes - blobBytes) === crlfPairs,
    substantiveDeltaBytes: (worktreeBytes - blobBytes) - crlfPairs
  };
});

// --- 3. the experiment: what each policy actually produces on both platform configurations -------------------
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'c3r37a-le-'));
let experiment = null;
let experimentError = null;
try {
  const run = spawnSync(process.execPath, [path.join(here, 'line-ending-experiment.mjs'), base], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(String(run.stderr));
  experiment = JSON.parse(String(run.stdout));
} catch (error) {
  experimentError = String(error?.message ?? error);
} finally {
  if (fs.realpathSync(base).toLowerCase().startsWith(fs.realpathSync(os.tmpdir()).toLowerCase())) {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

// --- 4. conclusion, derived from the measured bytes rather than asserted ------------------------------------
const statusOf = (scenario, autocrlf, sourceSha) => {
  if (!experiment) return null;
  const entry = experiment.report.find((r) => r.scenario === scenario);
  if (!entry) return null;
  const checkout = entry.checkouts[`autocrlf=${autocrlf}`];
  return {
    bytes: checkout.bytes,
    crlf: checkout.crlf,
    reproducesReviewedBytes: checkout.sha256 === sourceSha
  };
};
const sourceSha = experiment?.sourceSha256 ?? null;

const analysis = {
  schema: 'alp-c3-r37a-line-ending-analysis-v1',
  configuration: config,
  trackedFiles: tracked,
  experiment: experiment ?? { error: experimentError },
  scenarioOutcomes: experiment ? [
    { scenario: 'A-status-quo', win: statusOf('A-status-quo', 'true', sourceSha), posix: statusOf('A-status-quo', 'false', sourceSha) },
    { scenario: 'B-text-auto-eol-lf', win: statusOf('B-text-auto-lf', 'true', sourceSha), posix: statusOf('B-text-auto-lf', 'false', sourceSha) },
    { scenario: 'C-text-off-all', win: statusOf('C-text-off-all', 'true', sourceSha), posix: statusOf('C-text-off-all', 'false', sourceSha) },
    { scenario: 'D-text-off-scoped', win: statusOf('D-text-off-scoped', 'true', sourceSha), posix: statusOf('D-text-off-scoped', 'false', sourceSha) }
  ] : []
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(analysis, null, 2)}\n`);
console.log(JSON.stringify({
  config,
  deltasExplainedByCrlf: tracked.map((t) => `${t.path}: ${t.deltaExplainedByCrlf} (substantive ${t.substantiveDeltaBytes} B)`),
  scenarios: analysis.scenarioOutcomes.map((s) => `${s.scenario}: win=${s.win?.reproducesReviewedBytes} posix=${s.posix?.reproducesReviewedBytes}`),
  out: 'docs/c3-r37a/C3-R37A-LINE-ENDING-ANALYSIS.json'
}, null, 2));
