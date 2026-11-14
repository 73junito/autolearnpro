#!/usr/bin/env node
// C3-R37C — portable integration verifier (schema alp-c3-portable-verify-v1, report v1).
//
// WHY THIS EXISTS: docs/c3-r25/verify-review.mjs pins HEAD to ea67a03, a branch name, a GitHub origin URL and a
// Windows staging path. Those were correct requirements for reviewing the original R25 workstation, and they make the
// verifier fail on any integrated commit by construction (B29). That file is left untouched. This one verifies
// *committed content* only, so it works on any machine, any drive, any branch.
//
// A caller-supplied expected commit is a comparison value. Passing this verifier establishes that the checkout is the
// commit the caller named and that its content is the reviewed content. It establishes nothing about who produced it,
// whether CI ran, or whether anyone approved a release.
//
// Usage:
//   node docs/c3-r37c/tools/portable-verify.mjs --repo <dir> --expect-commit <sha> [--expect-tree <sha>] [--json]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH_IN_REPO = 'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json';

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const REPO = arg('--repo');
const EXPECT_COMMIT = arg('--expect-commit');
const EXPECT_TREE = arg('--expect-tree');
const JSON_ONLY = args.includes('--json');

class UsageError extends Error {}
if (!REPO) throw new UsageError('R37C_REPO_REQUIRED: pass --repo <checkout>');
if (!EXPECT_COMMIT) throw new UsageError('R37C_EXPECT_COMMIT_REQUIRED: pass --expect-commit <sha> — an unverified checkout is not a verified checkout');

const git = (gitArgs, encoding = 'buffer') => {
  const result = spawnSync('git', gitArgs, { cwd: REPO, encoding });
  return { ok: result.status === 0, out: result.stdout, err: String(result.stderr ?? '') };
};
const gitText = (gitArgs) => {
  const r = git(gitArgs, 'utf8');
  return r.ok ? String(r.out).trim() : null;
};

// Fixed denominator. Every run reports all of them, on every platform, so the count itself is a check.
const CHECKS = [
  'expected-commit-matches-HEAD',
  'expected-tree-matches-HEAD',
  'manifest-schema-supported',
  'manifest-digest-recomputed',
  'manifest-rows-match-committed-blobs',
  'integration-set-matches-parent-diff',
  'reviewed-evidence-exceptions-present',
  'required-scaffolds-present',
  'required-toolchain-manifests-present',
  'worker-and-catalog-inputs-present',
  'nothing-outside-review-docs-differs',
  'no-sensitive-files-tracked',
  'release-authority-denied',
  'worktree-clean-except-ignored',
  'check-count-is-fixed'
];

const results = [];
const test = (name, ok, detail = {}) => results.push({ name, ok: ok === true, detail });

// --- identity -------------------------------------------------------------------------------------------------
// The verified commit is the one the caller names. It must exist and be HEAD or an ancestor of HEAD: a manifest
// cannot describe the commit that carries it, so a reviewed manifest legitimately lives in a later commit.
const TARGET = EXPECT_COMMIT;
const exists = git(['cat-file', '-e', `${TARGET}^{commit}`]).ok;
const head = gitText(['rev-parse', 'HEAD']);
const isAncestor = exists && git(['merge-base', '--is-ancestor', TARGET, 'HEAD']).ok;
const targetTree = exists ? gitText(['rev-parse', `${TARGET}^{tree}`]) : null;
const parent = exists ? gitText(['rev-parse', `${EXPECT_COMMIT}^`]) : null;

test('expected-commit-matches-HEAD', exists && isAncestor,
  { expected: EXPECT_COMMIT, head, exists, isHeadOrAncestor: isAncestor, note: 'a caller-supplied expectation is a comparison value, not proof of authorship' });
test('expected-tree-matches-HEAD', EXPECT_TREE ? targetTree === EXPECT_TREE : targetTree !== null,
  { expected: EXPECT_TREE ?? '(not supplied)', actual: targetTree, commit: TARGET });

// --- the manifest ---------------------------------------------------------------------------------------------
let manifest = null;
let manifestError = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(REPO, MANIFEST_PATH_IN_REPO), 'utf8'));
} catch (error) {
  manifestError = String(error?.message ?? error);
}

const SCHEMA = 'alp-c3-integration-manifest-v1';
test('manifest-schema-supported', manifest?.schema === SCHEMA,
  manifestError ? { error: manifestError } : { expected: SCHEMA, actual: manifest?.schema });

const canonicalDigest = (rows, exceptions) => {
  const parts = [];
  for (const row of rows) parts.push(`row|${row.path.length}:${row.path}|${row.sha256}`);
  for (const entry of exceptions) parts.push(`exc|${entry.path.length}:${entry.path}|${entry.sha256}|${entry.gitDisposition}`);
  return sha(Buffer.from(parts.join('\n'), 'utf8'));
};
const recomputed = manifest ? canonicalDigest(manifest.rows, manifest.exceptions) : null;
test('manifest-digest-recomputed', recomputed !== null && recomputed === manifest?.manifestDigest,
  { computed: recomputed, recorded: manifest?.manifestDigest ?? null, note: 'detects edits to any row even though no file can hash itself' });

// --- every row against the committed blob --------------------------------------------------------------------
let rowMismatches = [];
let rowsChecked = 0;
if (manifest && Array.isArray(manifest.rows)) {
  for (const row of manifest.rows) {
    rowsChecked += 1;
    const blob = git(['cat-file', 'blob', `${TARGET}:${row.path}`]);
    if (!blob.ok) {
      rowMismatches.push({ path: row.path, problem: 'missing-in-commit' });
      continue;
    }
    const actual = sha(blob.out);
    if (actual !== row.sha256) rowMismatches.push({ path: row.path, problem: 'content-differs', expected: row.sha256, actual });
  }
}
test('manifest-rows-match-committed-blobs', rowsChecked > 0 && rowMismatches.length === 0,
  { rowsChecked, mismatches: rowMismatches.slice(0, 10), mismatchCount: rowMismatches.length });

// --- the commit changed exactly the integration set, nothing else ---------------------------------------------
let diffMismatches = [];
if (manifest && Array.isArray(manifest.changed) && parent) {
  const actual = (gitText(['diff', '--name-status', parent, TARGET]) ?? '').split('\n').filter(Boolean).map((line) => {
    const [status, ...rest] = line.split('\t');
    return { status, path: rest.join('\t') };
  });
  const expectedKey = new Set(manifest.changed.map((c) => `${c.status}|${c.path}`));
  const actualKey = new Set(actual.map((c) => `${c.status}|${c.path}`));
  for (const key of expectedKey) if (!actualKey.has(key)) diffMismatches.push({ missing: key });
  for (const key of actualKey) if (!expectedKey.has(key)) diffMismatches.push({ unexpected: key });
}
test('integration-set-matches-parent-diff', manifest !== null && diffMismatches.length === 0,
  { expectedChanged: manifest?.changed?.length ?? null, discrepancies: diffMismatches.slice(0, 10), discrepancyCount: diffMismatches.length });


// --- B30: reviewed evidence that .gitignore hides --------------------------------------------------------------
const exceptionProblems = [];
for (const entry of manifest?.exceptions ?? []) {
  const blob = git(['cat-file', 'blob', `${TARGET}:${entry.path}`]);
  if (!blob.ok) {
    exceptionProblems.push({ path: entry.path, problem: 'not-tracked-in-commit' });
    continue;
  }
  const actual = sha(blob.out);
  if (actual !== entry.sha256) exceptionProblems.push({ path: entry.path, problem: 'replaced-or-changed', expected: entry.sha256, actual });
}
test('reviewed-evidence-exceptions-present',
  (manifest?.exceptions?.length ?? 0) > 0 && exceptionProblems.length === 0,
  { exceptions: manifest?.exceptions?.length ?? 0, problems: exceptionProblems });

// --- required integration content -----------------------------------------------------------------------------
const REQUIRED_SCAFFOLDS = [
  'apps/simulator/README.md', 'apps/classroom/README.md', 'packages/ui/README.md', 'packages/core/README.md',
  'packages/curriculum/README.md', 'packages/diagnostics/README.md', 'supabase/functions/README.md'
];
const missingScaffolds = REQUIRED_SCAFFOLDS.filter((p) => !git([`cat-file`, '-e', `${TARGET}:${p}`]).ok);
test('required-scaffolds-present', missingScaffolds.length === 0, { required: REQUIRED_SCAFFOLDS.length, missing: missingScaffolds });

const REQUIRED_TOOLCHAIN = [
  'package.json', 'package-lock.json',
  'infrastructure/c3/build/package.json', 'infrastructure/c3/build/package-lock.json',
  'apps/catalog/package.json', 'apps/catalog/vite.config.js'
];
const missingToolchain = REQUIRED_TOOLCHAIN.filter((p) => !git(['cat-file', '-e', `${TARGET}:${p}`]).ok);
test('required-toolchain-manifests-present', missingToolchain.length === 0, { required: REQUIRED_TOOLCHAIN.length, missing: missingToolchain });

// Byte-sensitive inputs whose hashes the C3 evidence contracts cite. The expected values are NOT duplicated here:
// every tracked file's hash already lives in the manifest and is verified by 'manifest-rows-match-committed-blobs'.
// Duplicating them in this file only creates a second place for a typo — which is how the first version failed, with a
// 65-character constant that printed identically to a correct 64-character hash.
const REQUIRED_INPUTS = [
  'infrastructure/cloudflare/worker.mjs',
  'infrastructure/cloudflare/wrangler.jsonc',
  'apps/catalog/index.html',
  'apps/catalog/src/main.js',
  'infrastructure/c3/build/build-input-contract.mjs'
];
const manifestPaths = new Set((manifest?.rows ?? []).map((row) => row.path));
const inputProblems = [];
for (const p of REQUIRED_INPUTS) {
  if (!git(['cat-file', '-e', `${TARGET}:${p}`]).ok) inputProblems.push({ path: p, problem: 'missing-from-commit' });
  else if (!manifestPaths.has(p)) inputProblems.push({ path: p, problem: 'not-covered-by-manifest' });
}
test('worker-and-catalog-inputs-present', inputProblems.length === 0,
  { checked: REQUIRED_INPUTS.length, problems: inputProblems, note: 'hashes come from the manifest rows, which are verified against the committed blobs' });

// --- no post-verification drift -------------------------------------------------------------------------------
// The manifest legitimately lives in a later commit, so HEAD may differ from TARGET — but only by review
// documentation. Anything else is an unreviewed change on top of a verified commit, which must not pass.
const REVIEW_DOC_PREFIX = 'docs/c3-r37c/';
let driftProblems = [];
if (exists) {
  const drift = (gitText(['diff', '--name-status', TARGET, 'HEAD']) ?? '').split('\n').filter(Boolean).map((line) => {
    const [status, ...rest] = line.split('\t');
    return { status, path: rest.join('\t') };
  });
  driftProblems = drift.filter((d) => !d.path.startsWith(REVIEW_DOC_PREFIX));
  var driftCount = drift.length;
}
test('nothing-outside-review-docs-differs', exists && driftProblems.length === 0,
  { changesSinceVerifiedCommit: typeof driftCount === 'number' ? driftCount : null, outsideReviewDocs: driftProblems.slice(0, 10),
    allowedPrefix: REVIEW_DOC_PREFIX });

// --- no secrets, no accidental authority ----------------------------------------------------------------------
const trackedPaths = (gitText(['ls-tree', '-r', '--name-only', TARGET]) ?? '').split('\n').filter(Boolean);
const SENSITIVE = /(^|\/)(\.env($|\.)|[^/]+\.pem$|[^/]+\.key$|[^/]+\.dump$|\.pgdump[a-z.]*$)/i;
const sensitive = trackedPaths.filter((p) => SENSITIVE.test(p) && !p.endsWith('.env.example'));
test('no-sensitive-files-tracked', sensitive.length === 0, { trackedFiles: trackedPaths.length, sensitive });

const manifestPolicies = manifest?.policies ?? {};
const denialOk = manifestPolicies.publicationAuthorized === false
  && manifestPolicies.deployAllowed === false
  && manifestPolicies.sourceCommitVerified === false
  && manifestPolicies.ciAttested === false
  && manifestPolicies.note !== undefined;
test('release-authority-denied', denialOk, { policies: manifestPolicies });

// --- working tree ----------------------------------------------------------------------------------------------
// Ignored dependencies are expected; anything else dirty means the checkout is not the commit being verified.
const porcelain = gitText(['status', '--porcelain']);
const dirty = (porcelain ?? '').split('\n').filter(Boolean);
test('worktree-clean-except-ignored', porcelain !== null && dirty.length === 0,
  { dirtyEntries: dirty.slice(0, 10), note: 'installed node_modules and generated dist are ignored and therefore invisible here' });

// --- the denominator itself ------------------------------------------------------------------------------------
test('check-count-is-fixed', results.length + 1 === CHECKS.length,
  { reported: results.length + 1, expected: CHECKS.length, note: 'a verifier whose check count can vary hides failures' });


// --- verdict ----------------------------------------------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
const verdict = { pass: failed.length === 0, total: results.length, passed: results.length - failed.length, failed: failed.map((r) => r.name) };
const report = {
  schema: 'alp-c3-portable-verify-report-v1',
  verifier: 'docs/c3-r37c/tools/portable-verify.mjs',
  runtime: { node: process.version, platform: process.platform },
  repository: REPO,
  identity: { expectedCommit: EXPECT_COMMIT, expectedTree: EXPECT_TREE, head, targetTree, parent },
  manifest: manifest ? { schema: manifest.schema, manifestDigest: manifest.manifestDigest, generatedFor: manifest.generatedFor } : null,
  verdict,
  establishes: ['checkoutIsTheNamedCommit', 'committedContentMatchesTheReviewedManifest'],
  doesNotEstablish: [
    'gitOrigin', 'ciWorkloadIdentity', 'publisherIdentity', 'signedReleaseAttestation',
    'humanReleaseApproval', 'publicationAuthorization', 'deploymentAuthorization'
  ],
  conformanceClaimed: false,
  checks: results
};

if (!JSON_ONLY) {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  console.log(`\nPORTABLE VERIFY ${verdict.pass ? 'PASS' : 'FAIL'} — ${verdict.passed}/${verdict.total} checks`);
  if (failed.length) {
    console.log(`failed: ${verdict.failed.join(', ')}`);
    // A gate that names only the failing check makes the caller guess; print what it actually found.
    for (const r of failed) console.log(`  ${r.name}: ${JSON.stringify(r.detail)}`);
  }
}
console.log(JSON.stringify({ verdict, identity: report.identity, manifestDigest: report.manifest?.manifestDigest ?? null }, null, JSON_ONLY ? 2 : 0));
process.exitCode = verdict.pass ? 0 : 1;

