#!/usr/bin/env node
// C3-R36H.3 — B23 investigation: repeated isolated trials of the injection case that timed out once.
//
// C3-R36H.2 recorded one observed failure of the "console error not attributable to a classified resource" fixture:
// `page.goto: Timeout 30000ms exceeded`. The gate reported it correctly (exit 1, R36H2_HARNESS_EXCEPTION), but the
// case asserts a specific failed-check set, so it failed rather than passing on a different error.
//
// This harness runs that fixture in isolation, repeatedly, and classifies every trial:
//   PASS              exit 1 with verdict.failed = [consoleErrors] and R36H3_REQUIRED_CHECK_FAILED
//   WRONG_DIAGNOSTIC  exit 1 for a different reason, or a different failed set, or exit 0
//   TIMEOUT           the gate reported a Timeout (the observed B23 symptom)
//   HARNESS_ERROR     no result file, or a result that cannot be parsed
//
// Timeouts are NOT raised to make this pass: the gate is invoked with its own unchanged 30 s navigation budget.
//
// Usage: node docs/c3-r36h3/tools/b23-race-trials.mjs [trials]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const GATE = path.join(here, 'browser-gate.mjs');
const TMP_ROOT = fs.realpathSync(os.tmpdir());
const TRIALS = Number(process.argv[2] ?? 12);

const BASE_HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>B23 fixture</title><style>body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#16202a;background:#fff}h1{font-size:1.5rem}h2{font-size:1.1rem}</style></head><body><main>';
const BASE_TAIL = '</main></body></html>';
const READY = "<script>document.documentElement.dataset.catalogShell='started';</script>";

// Byte-identical to the C3-R36H.2 case-4 fixture body.
function page(body) {
  return `${BASE_HEAD}${READY}<h1>Fixture heading</h1><p class="notice">Local prototype — not a released catalog.</p><p id="boot-status" role="status">started</p><h2>Section</h2><dl><dt>A</dt><dd>B</dd></dl>${body}${BASE_TAIL}`;
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function trial(index) {
  const root = fs.mkdtempSync(path.join(TMP_ROOT, `c3r36h3-b23-case-${index}-`));
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), page("<script>console.error('injected console error');</script>"));
  const outDir = path.join(TMP_ROOT, `c3r36h3-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(outDir);

  const env = { ...process.env, R36H_DIST: dist, R36H3_OUT: outDir };
  delete env.R36H_OUT;
  delete env.R36H2_OUT;
  delete env.R36H3_INJ_OUT;

  const started = Date.now();
  const child = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env, timeout: 180000 });
  const durationMs = Date.now() - started;

  const resultsFile = path.join(outDir, 'gate-results.json');
  const raw = fs.existsSync(resultsFile) ? fs.readFileSync(resultsFile, 'utf8') : null;
  let results = null;
  if (raw) {
    try {
      results = JSON.parse(raw);
    } catch {
      results = null;
    }
  }

  const reason = String(results?.reason ?? '');
  const failed = results?.verdict?.failed ?? [];
  let outcome;
  if (!raw) outcome = 'HARNESS_ERROR';
  else if (/Timeout .*exceeded/i.test(reason)) outcome = 'TIMEOUT';
  else if (child.status === 1 && failed.length === 1 && failed[0] === 'consoleErrors') outcome = 'PASS';
  else outcome = 'WRONG_DIAGNOSTIC';

  // Cleanup is confined to the two temporary directories this trial created.
  for (const target of [outDir, root]) {
    const real = fs.realpathSync(target).toLowerCase();
    if (real.startsWith(TMP_ROOT.toLowerCase() + path.sep)) fs.rmSync(target, { recursive: true, force: true });
  }

  return { trial: index + 1, outcome, exitCode: child.status, durationMs, failedChecks: failed, reason: reason.slice(0, 160) };
}

const records = [];
for (let index = 0; index < TRIALS; index += 1) {
  const record = trial(index);
  records.push(record);
  console.log(`${record.outcome.padEnd(17)} trial ${String(record.trial).padStart(2)}  exit=${record.exitCode}  ${record.durationMs}ms  failed=[${record.failedChecks.join(',')}]  ${record.reason || '-'}`);
}

const tally = records.reduce((acc, record) => ({ ...acc, [record.outcome]: (acc[record.outcome] ?? 0) + 1 }), {});
const deterministic = tally.PASS === TRIALS;
const durations = records.map((record) => record.durationMs);
const summary = {
  schema: 'alp-c3-r36h3-b23-race-trials-v1',
  fixture: 'console error not attributable to a classified resource (C3-R36H.2 injection case 4)',
  trials: TRIALS,
  tally,
  durationMs: { min: Math.min(...durations), max: Math.max(...durations), median: durations.slice().sort((a, b) => a - b)[Math.floor(durations.length / 2)] },
  navigationBudgetMs: 30000,
  budgetRaised: false,
  deterministicInIsolation: deterministic,
  records
};
const file = path.join(REPO, 'docs', 'c3-r36h3', 'C3-R36H3-B23-RACE-TRIALS.json');
fs.writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nTALLY=${JSON.stringify(tally)}  DETERMINISTIC_IN_ISOLATION=${deterministic}  sha256=${sha256(fs.readFileSync(file))}`);
process.exitCode = deterministic ? 0 : 1;
