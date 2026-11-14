#!/usr/bin/env node
// C3-R37B — build an isolated integration candidate in a throwaway Git repository and measure the byte results.
//
// It never touches the authoritative worktree: it clones HEAD into %TEMP%, copies the C3-R37.1 inventory into the
// clone, applies the candidate `.gitattributes`, commits locally, and then clones that commit twice to test both
// core.autocrlf settings.
//
// Usage: node docs/c3-r37b/tools/build-candidate.mjs <baseDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const INVENTORY = path.join(REPO, 'docs', 'c3-r37a', 'C3-R37A-FILE-INVENTORY.json');
const BASE = process.argv[2];
if (!BASE) throw new Error('usage: build-candidate.mjs <baseDir>');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (cwd, args, env) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd}: ${result.stderr}`);
  return String(result.stdout).trim();
};

// Both dates are pinned so the candidate commit is byte-identical across runs; `--date` alone sets only the author.
const FIXED_DATE = { GIT_AUTHOR_DATE: '2026-11-04T00:00:00+0000', GIT_COMMITTER_DATE: '2026-11-04T00:00:00+0000' };

// Expanded scoped Policy D, as approved by the C3-R37.1 review. Root-level patterns are anchored with `/` so they
// apply only to the repository root and not to a same-named file deeper in the tree.
const GITATTRIBUTES = `# C3-R37B candidate policy — reviewed byte-sensitive C3 sources.
# These paths are stored and checked out verbatim, so the SHA-256 fingerprints recorded in the C3 milestone
# documents survive a clone regardless of core.autocrlf. Do not add \`text\` rules for these paths.
infrastructure/c3/**                      -text
tests/c3-*.test.mjs                       -text
tests/fixtures/**                         -text
docs/c3-r2*/**                            -text
docs/c3-r3*/**                            -text
apps/catalog/**                           -text

# Scaffold READMEs: their SHA-256 values are recorded in C3-R37A-FILE-INVENTORY.json, so they are byte-sensitive too.
# The first candidate run proved this omission: without these rules the seven scaffolds were LF-normalised into the
# blob and one clone could not reproduce the reviewed bytes.
/apps/classroom/**                        -text
/apps/simulator/**                        -text
/packages/**                              -text
/supabase/functions/**                    -text

# External inputs to the reviewed C3 contracts (root-anchored).
/infrastructure/cloudflare/worker.mjs     -text
/infrastructure/cloudflare/wrangler.jsonc -text
/package.json                             -text
/package-lock.json                        -text
`;

// The tracked .gitignore's *.log rule would silently drop four reviewed console captures. Rather than un-ignoring
// logs generally, the candidate adds one scoped negation. This is a candidate-only modification, not an inventory row.
const LOG_NEGATION = `
# C3-R37B: four console captures under docs/c3-r36h3/logs/ are reviewed evidence (C3-R37A §3) and must survive the
# *.log rule above. Scoped to that directory; unrelated logs remain ignored.
!docs/c3-r36h3/logs/*.log
`;

// Files that the C3-R37A retention decision explicitly protects but which `git status` can never report, because the
// tracked `*.log` rule hides them. The inventory is derived from `git status`, so it structurally cannot see them —
// C3-R37B found this when a clone arrived without them. They are listed here by name, with hashes, and counted apart.
const REVIEWED_IGNORED = [
  'docs/c3-r36h3/logs/b23-trials-prefix.log',
  'docs/c3-r36h3/logs/b23-trials-postfix.log',
  'docs/c3-r36h3/logs/injection-run-postfix-a.log',
  'docs/c3-r36h3/logs/injection-run-postfix-b.log'
];

fs.mkdirSync(BASE, { recursive: true });
const candidate = path.join(BASE, 'candidate');
const report = { base: BASE, candidate, steps: [] };

// --- clone the real HEAD ---------------------------------------------------------------------------------------
git(BASE, ['clone', '--quiet', '--no-hardlinks', REPO, candidate]);
report.headCloned = git(candidate, ['rev-parse', 'HEAD']);
report.steps.push({ step: 'clone HEAD', head: report.headCloned });

// --- copy the inventory into the candidate ---------------------------------------------------------------------
const inventory = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
const copied = [];
for (const row of inventory.rows) {
  if (row.action !== 'add' && row.action !== 'modify') continue;
  const from = path.join(REPO, row.path);
  const to = path.join(candidate, row.path);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const written = fs.readFileSync(to);
  if (sha(written) !== row.sha256) throw new Error(`R37B_COPY_MISMATCH:${row.path}`);
  copied.push({ path: row.path, action: row.action, sha256: row.sha256, bytes: written.length });
}
for (const extra of inventory.milestoneAdditions) {
  const from = path.join(REPO, extra.path);
  const to = path.join(candidate, extra.path);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied.push({ path: extra.path, action: 'add', sha256: sha(fs.readFileSync(to)), bytes: fs.statSync(to).size });
}
report.copiedCount = copied.length;
report.copiedByAction = copied.reduce((acc, c) => { acc[c.action] = (acc[c.action] ?? 0) + 1; return acc; }, {});
report.reviewedIgnored = REVIEWED_IGNORED.map((p) => {
  const from = path.join(REPO, p);
  const to = path.join(candidate, p);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  const bytes = fs.readFileSync(to);
  if (sha(bytes) !== sha(fs.readFileSync(from))) throw new Error(`R37B_LOG_COPY_MISMATCH:${p}`);
  return { path: p, bytes: bytes.length, sha256: sha(bytes), note: 'ignored by *.log, absent from the Git-derived inventory, protected by the retention decision' };
});

// --- candidate-only policy files -------------------------------------------------------------------------------
fs.writeFileSync(path.join(candidate, '.gitattributes'), GITATTRIBUTES);
const gitignorePath = path.join(candidate, '.gitignore');
fs.writeFileSync(gitignorePath, fs.readFileSync(gitignorePath, 'utf8') + LOG_NEGATION);
report.steps.push({ step: 'policy applied', gitattributesBytes: Buffer.byteLength(GITATTRIBUTES, 'utf8') });

// --- byte-representation test: stage, then compare staged blob content with the reviewed file ------------------
git(candidate, ['add', '-A']);
const staged = git(candidate, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);

// `git cat-file blob :path` returns the exact bytes that would be stored, with any eol filter already applied.
// Hashing that is the only honest way to prove what a clone will receive.
const evidenceSensitive = copied
  .filter((c) => c.path !== 'docs/c3-r37b/C3-R37B-ISOLATED-INTEGRATION-PREFLIGHT.md')
  .concat(report.reviewedIgnored.map((r) => ({ path: r.path, sha256: r.sha256, action: 'add', bytes: r.bytes })));
// Two distinct properties, tested separately because conflating them hides policy gaps:
//   A) blobIsVerbatim        — the staged blob equals the candidate file's bytes, i.e. `-text` actually applied.
//   B) cloneReproducesReviewed — the checked-out file equals the SHA-256 recorded in C3-R37A-FILE-INVENTORY.json.
// A file can pass B on Windows while failing A, which is exactly how the scaffold omission hid in the first run.
const blobChecks = evidenceSensitive.map((c) => {
  const candidateFile = path.join(candidate, c.path);
  const fileBytes = fs.readFileSync(candidateFile);
  const blob = spawnSync('git', ['cat-file', 'blob', `:${c.path}`], { cwd: candidate });
  if (blob.status !== 0) throw new Error(`R37B_NO_STAGED_BLOB:${c.path}`);
  const blobSha256 = sha(blob.stdout);
  return {
    path: c.path,
    inventorySha256: c.sha256,
    candidateFileSha256: sha(fileBytes),
    blobSha256,
    blobIsVerbatim: blobSha256 === sha(fileBytes),
    candidateMatchesInventory: sha(fileBytes) === c.sha256
  };
});
report.stagedCount = staged.length;
// `.gitignore` is modified by this builder on purpose (scoped log negation), so its inventory hash no longer applies.
const INTENTIONAL = new Set(['.gitignore']);
const unmodified = blobChecks.filter((b) => !INTENTIONAL.has(b.path));
report.blobChecks = {
  total: blobChecks.length,
  intentionalCandidateModifications: blobChecks.filter((b) => INTENTIONAL.has(b.path)).map((b) => ({
    path: b.path,
    inventorySha256: b.inventorySha256,
    candidateSha256: b.candidateFileSha256,
    note: 'candidate-only change: scoped *.log negation for the four reviewed console captures'
  })),
  unmodifiedChecked: unmodified.length,
  unmodifiedVerbatim: unmodified.filter((b) => b.blobIsVerbatim).length,
  notVerbatim: unmodified.filter((b) => !b.blobIsVerbatim).map((b) => b.path)
};

// Which tracked files the policy itself rewrote (HEAD stored LF, `-text` now stores the CRLF worktree bytes).
const statusAfterAdd = git(candidate, ['status', '--porcelain']).split('\n').filter(Boolean);
report.statusAfterAdd = {
  modified: statusAfterAdd.filter((l) => /^(M| M|MM)/.test(l.slice(0, 2))).map((l) => l.slice(3)),
  added: statusAfterAdd.filter((l) => /^(A|AM)/.test(l.slice(0, 2))).map((l) => l.slice(3))
};

// --- commit locally, with fixed identity and date so the candidate is reproducible ------------------------------
git(candidate, ['-c', 'user.name=C3 candidate', '-c', 'user.email=candidate@local', 'commit', '-q', '-m',
  'C3-R37B isolated integration candidate (disposable; not authorised for publication)'], FIXED_DATE);
report.candidateCommit = git(candidate, ['rev-parse', 'HEAD']);
report.candidateTree = git(candidate, ['rev-parse', 'HEAD^{tree}']);
report.workingTreeClean = git(candidate, ['status', '--porcelain']) === '';

// --- clone the candidate twice, one per autocrlf setting ------------------------------------------------------
for (const autocrlf of ['false', 'true']) {
  const clone = path.join(BASE, `clone-autocrlf-${autocrlf}`);
  git(BASE, ['clone', '--quiet', '-c', `core.autocrlf=${autocrlf}`, candidate, clone]);
  const check = evidenceSensitive.map((c) => {
    const target = path.join(clone, c.path);
    if (!fs.existsSync(target)) return { path: c.path, missing: true };
    const actual = sha(fs.readFileSync(target));
    return { path: c.path, expected: c.sha256, actual, identical: actual === c.sha256 };
  });
  const mismatches = check.filter((c) => c.missing || !c.identical);
  // Ignored material must not appear in the clone.
  report[`clone_autocrlf_${autocrlf}`] = {
    path: clone,
    head: git(clone, ['rev-parse', 'HEAD']),
    filesChecked: check.length,
    mismatches,
    nodeModulesPresent: fs.existsSync(path.join(clone, 'node_modules')),
    distPresent: fs.existsSync(path.join(clone, 'apps', 'catalog', 'dist'))
  };
}

report.allBlobsIdentical = report.blobChecks.notVerbatim.length === 0;
report.bothClonesReproduce = ['false', 'true'].every((k) =>
  report[`clone_autocrlf_${k}`].mismatches.every((m) => INTENTIONAL.has(m.path)));
console.log(JSON.stringify({
  candidateCommit: report.candidateCommit,
  stagedCount: report.stagedCount,
  copiedCount: report.copiedCount,
  copiedByAction: report.copiedByAction,
  blobChecks: report.blobChecks,
  allBlobsIdentical: report.allBlobsIdentical,
  bothClonesReproduce: report.bothClonesReproduce,
  statusAfterAdd: { modified: report.statusAfterAdd.modified.length, added: report.statusAfterAdd.added.length },
  clones: ['false', 'true'].map((k) => ({ autocrlf: k, mismatches: report[`clone_autocrlf_${k}`].mismatches.length, nodeModules: report[`clone_autocrlf_${k}`].nodeModulesPresent }))
}, null, 2));
fs.writeFileSync(path.join(BASE, 'candidate-report.json'), `${JSON.stringify(report, null, 2)}\n`);

