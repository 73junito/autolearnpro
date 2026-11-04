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
const OUT_ROOT = path.join(REPO, 'docs', 'c3-r36h2');

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
    expectReason: /^R36H2_HARNESS_EXCEPTION/
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `c3r36h2-case-${index}-`));
  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const dist = materialise(testCase, root);
  const env = { ...process.env, R36H_DIST: dist, R36H2_OUT: outDir };
  delete env.R36H_OUT;
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
  fs.rmSync(root, { recursive: true, force: true });
  return record;
}

const started = Date.now();
const records = CASES.map(runCase);
const allOk = records.every((record) => record.ok);

fs.mkdirSync(OUT_ROOT, { recursive: true });
const file = path.join(OUT_ROOT, 'C3-R36H2-FAILURE-INJECTION.json');
fs.writeFileSync(file, `${JSON.stringify({
  schema: 'alp-c3-r36h2-failure-injection-v1',
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
