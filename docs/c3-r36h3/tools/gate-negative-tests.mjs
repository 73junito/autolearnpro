#!/usr/bin/env node
// C3-R36H.2 — failure-injection tests for the browser gate (repeated from C3-R36H.1).
//
// A gate that cannot fail is not a gate. Each case builds a fixture that isolates ONE defect, runs
// `browser-gate.mjs` as a child process against it, and asserts both the exit code and the specific diagnostic.
// The clean case runs against the real, unchanged catalog build.
//
// Differences from the C3-R36H.1 driver: the gate now requires an explicit R36H2_OUT directory (created empty per
// case), reads `gate-results.json`, and writes its own summary to docs/c3-r36h2 — so repeating the suite cannot
// overwrite the C3-R36H.1 evidence, which is exactly the defect this milestone exists to fix.
//
// Usage: node docs/c3-r36h1/tools/gate-negative-tests.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const GATE = path.join(here, 'browser-gate.mjs');
const REAL_DIST = path.join(REPO, 'apps', 'catalog', 'dist');

// --- B22: this driver writes files too, so it gets its own output policy -------------------------------------
//
// C3-R36H.2 applied output validation to the *gate* only. The driver was left able to write wherever OUT_ROOT
// pointed, which is how a stray file appeared in docs/c3-r36h1 during that milestone. The policy below is the same
// shape as the gate's, expressed for the driver:
//   * its summary may be written to docs/c3-r36h3, or to a caller-chosen directory that must NOT be reviewed
//     evidence — anything under docs/c3-r36h1 is refused by name, because that is the exact destination that was
//     mistakenly used before;
//   * it may remove only directories it created itself, and only beneath the OS temporary directory.
const PROTECTED_DIRS = Object.freeze([
  path.join(REPO, 'docs', 'c3-r36h1'),
  path.join(REPO, 'docs', 'c3-r36h2')
]);
const DEFAULT_OUT_ROOT = path.join(REPO, 'docs', 'c3-r36h3');
const TMP_ROOT = fs.realpathSync(os.tmpdir());

function assertWritableSummaryPath(target) {
  // Validates the FULL prospective file path. An earlier version validated only the directory, so the directory's
  // own parent was compared with the protected roots and docs/c3-r36h1 slipped through as docs — the same class of
  // mistake this milestone exists to remove.
  const resolved = path.resolve(target);
  const parent = fs.realpathSync(path.dirname(resolved));
  const parentLower = parent.toLowerCase();
  for (const guarded of PROTECTED_DIRS) {
    const guardedReal = fs.realpathSync(guarded).toLowerCase();
    if (parentLower === guardedReal || parentLower.startsWith(guardedReal + path.sep)) {
      throw Error(`R36H3_INJECTION_OUTPUT_PROTECTED:${resolved} — ${path.relative(REPO, guarded)} holds reviewed evidence and is never a destination`);
    }
  }
  // Inside the repository, this driver may write only in its own milestone directory.
  const repoLower = REPO.toLowerCase();
  if (parentLower === repoLower || parentLower.startsWith(repoLower + path.sep)) {
    const allowed = fs.realpathSync(path.join(REPO, 'docs', 'c3-r36h3')).toLowerCase();
    if (!(parentLower === allowed || parentLower.startsWith(allowed + path.sep))) {
      throw Error(`R36H3_INJECTION_OUTPUT_FORBIDDEN:${resolved} — inside the repository, only docs/c3-r36h3 is authorised for this driver`);
    }
  }
  return path.join(parent, path.basename(resolved));
}

// Deletion is confined to the OS temporary directory. A mistake in a case body can therefore never remove a file from
// the repository, but a wrong temporary path still surfaces as a failed case rather than being silently accepted.
function assertRemovable(target) {
  const real = fs.realpathSync(target).toLowerCase();
  if (!real.startsWith(TMP_ROOT.toLowerCase() + path.sep)) {
    throw Error(`R36H3_INJECTION_DELETE_REFUSED:${target} — only directories created beneath the OS temporary directory may be removed`);
  }
}


const BASE_HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>R36H1 fixture</title><style>body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#16202a;background:#fff}h1{font-size:1.5rem}h2{font-size:1.1rem}</style></head><body><main>';
const BASE_TAIL = '</main></body></html>';
const READY = "<script>document.documentElement.dataset.catalogShell='started';</script>";

function page(body) {
  return `${BASE_HEAD}${READY}<h1>Fixture heading</h1><p class="notice">Local prototype — not a released catalog.</p><p id="boot-status" role="status">started</p><h2>Section</h2><dl><dt>A</dt><dd>B</dd></dl>${body}${BASE_TAIL}`;
}

const CASES = [
  { name: 'clean (real catalog)', dist: REAL_DIST, expectExit: 0, expectFailed: [] },
  {
    name: 'unexpected 404',
    files: { 'index.html': page('<script src="/missing-resource.js"></script>') },
    expectExit: 1,
    expectFailed: ['network']
  },
  {
    name: 'uncaught page error',
    files: { 'index.html': page("<script>throw new Error('injected page error');</script>") },
    expectExit: 1,
    expectFailed: ['noPageErrors']
  },
  {
    name: 'console error not attributable to a classified resource',
    files: { 'index.html': page("<script>console.error('injected console error');</script>") },
    expectExit: 1,
    expectFailed: ['consoleErrors']
  },
  {
    name: 'axe WCAG A/AA violation (image without alternative text)',
    // `region` was tried first and produced no finding: it is a best-practice rule, excluded by the gate's
    // WCAG A/AA tag filter. An image without alt text is a genuine WCAG 1.1.1 failure. A real PNG is served
    // rather than a data: URI, because the data: form stalled the page load event in this browser build.
    files: {
      'index.html': page('<img src="/pixel.png" width="16" height="16">'),
      'pixel.png': Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    },
    expectExit: 1,
    expectFailed: ['axe']
  },
  {
    name: 'layout failure at a narrow viewport',
    files: { 'index.html': page('<div style="width:2000px;height:8px;background:#ccc"></div>') },
    expectExit: 1,
    expectFailed: ['narrowViewport']
  },
  { name: 'missing build output', dist: 'MISSING', expectExit: 1, expectReason: /^R36H_DIST_NOT_BUILT/ },
  {
    name: 'browser launch failure',
    dist: REAL_DIST,
    browser: path.join(os.tmpdir(), 'r36h1-no-such-browser.exe'),
    expectExit: 1,
    expectReason: /^R36H3_HARNESS_EXCEPTION/
  }
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function materialise(testCase, root) {
  if (testCase.dist) return testCase.dist === 'MISSING' ? path.join(root, 'no-dist') : testCase.dist;
  const dir = path.join(root, 'dist');
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(testCase.files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

function runCase(testCase, index) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `c3r36h3-case-${index}-`));
  // The gate accepts only an owned temporary directory: a direct child of the OS temp root, named c3r36h3-<12 hex>.
  // A nested directory such as root/out is refused by that policy, so the driver must create the real shape.
  const outDir = path.join(TMP_ROOT, `c3r36h3-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(outDir);
  const dist = materialise(testCase, root);
  const env = { ...process.env, R36H_DIST: dist, R36H3_OUT: outDir };
  delete env.R36H_OUT;
  delete env.R36H2_OUT;
  if (testCase.browser) env.R36H_BROWSER = testCase.browser;

  const child = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env, timeout: 180000 });
  const resultsFile = path.join(outDir, 'gate-results.json');
  const results = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : null;

  const failed = results?.verdict?.failed ?? [];
  const exitOk = child.status === testCase.expectExit;
  const checksOk = (testCase.expectFailed ?? []).every((name) => failed.includes(name));
  const reasonOk = testCase.expectReason ? testCase.expectReason.test(String(results?.reason ?? '')) : true;
  const impactOk = testCase.expectImpact ? results?.checks?.axe?.worstImpact === testCase.expectImpact : true;

  const record = {
    case: testCase.name,
    exitCode: child.status,
    expectedExit: testCase.expectExit,
    failedChecks: failed,
    expectedFailed: testCase.expectFailed ?? [],
    reason: results?.reason ?? null,
    worstImpact: results?.checks?.axe?.worstImpact ?? null,
    ok: exitOk && checksOk && reasonOk && impactOk
  };
  assertRemovable(root);
  fs.rmSync(root, { recursive: true, force: true });
  return record;
}

// B22: the summary destination is validated BEFORE any case runs, so a protected or malformed destination fails
// immediately instead of after eight browser launches.
const SUMMARY_NAME = 'C3-R36H3-FAILURE-INJECTION.json';
let OUT_ROOT;
let SUMMARY_FILE;
try {
  // Validate the prospective FILE, not the directory: only the file path is what gets written, and only the file
  // path carries the parent that the policy must inspect.
  const candidateRoot = process.env.R36H3_INJ_OUT
    ? path.resolve(process.env.R36H3_INJ_OUT)
    : DEFAULT_OUT_ROOT;
  SUMMARY_FILE = assertWritableSummaryPath(path.join(candidateRoot, SUMMARY_NAME));
  OUT_ROOT = path.dirname(SUMMARY_FILE);
} catch (error) {
  console.error(String(error?.message ?? error));
  process.exitCode = 1;
  process.exit();
}

const started = Date.now();
const records = CASES.map(runCase);
const allOk = records.every((record) => record.ok);

fs.mkdirSync(OUT_ROOT, { recursive: true });
const file = SUMMARY_FILE;
fs.writeFileSync(file, `${JSON.stringify({
  schema: 'alp-c3-r36h3-failure-injection-v1',
  runtime: { node: process.version, platform: process.platform },
  durationMs: Date.now() - started,
  cases: records,
  allExpectationsMet: allOk,
  note: 'Each case isolates one defect. A clean run must exit 0; every injected failure must exit 1 with the named check in verdict.failed.'
}, null, 2)}\n`);

for (const record of records) {
  console.log(`${record.ok ? 'PASS' : 'FAIL'}  ${record.case}  exit=${record.exitCode} (want ${record.expectedExit})  failed=[${record.failedChecks.join(',')}]  reason=${record.reason ?? '-'}`);
}
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  file=${file}  sha256=${sha256(fs.readFileSync(file))}`);
process.exitCode = allOk ? 0 : 1;
