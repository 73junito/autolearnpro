#!/usr/bin/env node
// C3-R36H.2 — output-safety tests for the browser gate.
//
// Every case here is about *where evidence may be written*, not about the page. The gate must fail closed on missing
// configuration, refuse to overwrite reviewed evidence, and never write outside an authorised location.
//
// Usage: node docs/c3-r36h2/tools/output-safety-tests.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const GATE = path.join(here, 'browser-gate.mjs');
const REVIEWED_RESULTS = path.join(REPO, 'docs', 'c3-r36h1', 'C3-R36H1-GATE-RESULTS.json');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const reviewedBefore = fs.existsSync(REVIEWED_RESULTS) ? sha256(fs.readFileSync(REVIEWED_RESULTS)) : null;

function gate(env) {
  const merged = { ...process.env, ...env };
  for (const name of ['R36H2_OUT', 'R36H_OUT', 'R36H1_OUT', 'R36_OUT', 'OUTPUT_DIR']) {
    if (!(name in env)) delete merged[name];
  }
  const child = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: merged, timeout: 180000 });
  // The gate pretty-prints its payload, so parse from the first brace to the end rather than the last line.
  const stdout = String(child.stdout);
  let json = null;
  const start = stdout.indexOf('{');
  if (start >= 0) {
    try {
      json = JSON.parse(stdout.slice(start).trim());
    } catch {
      json = null;
    }
  }
  return { status: child.status, json, stderr: String(child.stderr) };
}

const cases = [];
function record(name, ok, detail) {
  cases.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
}

// 1 — no output configuration at all: nothing may be written, and the run must fail.
{
  const before = fs.readdirSync(path.join(REPO, 'docs')).sort().join(',');
  const result = gate({});
  const after = fs.readdirSync(path.join(REPO, 'docs')).sort().join(',');
  record('missing output configuration fails closed', result.status === 1
    && /^R36H2_OUTPUT_REQUIRED/.test(String(result.json?.reason ?? ''))
    && result.json?.written === false
    && before === after, { exit: result.status, reason: result.json?.reason, docsUnchanged: before === after });
}

// 2 — the F-5 case: a mistyped variable must be named, not ignored.
{
  const result = gate({ R36H_OUT: path.join(os.tmpdir(), 'r36h2-typo-never-used') });
  record('mistyped variable is reported by name (F-5)', result.status === 1
    && /^R36H2_OUTPUT_VARIABLE_MISNAMED/.test(String(result.json?.reason ?? ''))
    && String(result.json?.reason).includes('R36H_OUT'), { exit: result.status, reason: result.json?.reason });
}

// 3 — destination does not exist.
{
  const missing = path.join(os.tmpdir(), `r36h2-missing-${Date.now()}`);
  const result = gate({ R36H2_OUT: missing });
  record('missing destination directory is refused', result.status === 1
    && /^R36H2_OUTPUT_MISSING/.test(String(result.json?.reason ?? '')), { exit: result.status, reason: result.json?.reason });
}

// 4 — destination already occupied: refuse, and leave the occupant byte-identical.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r36h2-occupied-'));
  const planted = path.join(dir, 'gate-results.json');
  fs.writeFileSync(planted, '{"reviewed":"evidence"}');
  const plantedHash = sha256(fs.readFileSync(planted));
  const result = gate({ R36H2_OUT: dir });
  const survived = sha256(fs.readFileSync(planted)) === plantedHash;
  record('occupied destination is refused and preserved', result.status === 1
    && /^R36H2_OUTPUT_NOT_EMPTY/.test(String(result.json?.reason ?? '')) && survived,
  { exit: result.status, reason: result.json?.reason, occupantUnchanged: survived });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5 — the reviewed evidence directory itself must be refused (the exact F-5 destination).
{
  const result = gate({ R36H2_OUT: path.join(REPO, 'docs', 'c3-r36h1') });
  record('reviewed evidence directory is forbidden', result.status === 1
    && /^R36H2_OUTPUT_FORBIDDEN/.test(String(result.json?.reason ?? '')), { exit: result.status, reason: result.json?.reason });
}

// 6 — a source-tree destination must be refused.
{
  const result = gate({ R36H2_OUT: path.join(REPO, 'apps', 'catalog') });
  record('application source directory is forbidden', result.status === 1
    && /^R36H2_OUTPUT_FORBIDDEN/.test(String(result.json?.reason ?? '')), { exit: result.status, reason: result.json?.reason });
}

// 7 — a file where a directory is required.
{
  const file = path.join(os.tmpdir(), `r36h2-file-${Date.now()}.txt`);
  fs.writeFileSync(file, 'not a directory');
  const result = gate({ R36H2_OUT: file });
  record('a file is not accepted as a destination', result.status === 1
    && /^R36H2_OUTPUT_NOT_DIRECTORY/.test(String(result.json?.reason ?? '')), { exit: result.status, reason: result.json?.reason });
  fs.rmSync(file, { force: true });
}

// 8 — an exception mid-run (browser cannot launch) must exit nonzero, clean its own artefacts, and still report.
// A post-validation write error is NOT reachable by injection here: the destination must be empty before the run, so
// any planted obstacle fails validation first. The RESULT_WRITE_FAILED branch is retained as defence in depth and is
// documented as unexercised rather than claimed as tested.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r36h2-exception-'));
  const result = gate({ R36H2_OUT: dir, R36H_BROWSER: path.join(os.tmpdir(), 'r36h2-no-such-browser.exe') });
  const files = fs.readdirSync(dir).sort();
  const payload = files.includes('gate-results.json') ? JSON.parse(fs.readFileSync(path.join(dir, 'gate-results.json'), 'utf8')) : null;
  record('exception mid-run exits nonzero, cleans artefacts, and reports',
    result.status === 1
    && /^R36H2_HARNESS_EXCEPTION/.test(String(payload?.reason ?? ''))
    && files.every((name) => name === 'gate-results.json'),
    { exit: result.status, files, reason: String(payload?.reason ?? '').slice(0, 90) });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 9 — the clean run: a caller-owned empty temporary directory, results written there and nowhere else.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r36h2-clean-'));
  const result = gate({ R36H2_OUT: dir });
  const files = fs.readdirSync(dir).sort();
  const expected = ['gate-1280.png', 'gate-360.png', 'gate-results.json', 'gate-zoom200.png'];
  const written = path.join(dir, 'gate-results.json');
  const payload = fs.existsSync(written) ? JSON.parse(fs.readFileSync(written, 'utf8')) : null;
  record('clean run writes only into the caller directory', result.status === 0
    && JSON.stringify(files) === JSON.stringify(expected)
    && payload?.verdict?.pass === true
    && payload?.output?.exclusive === true,
  { exit: result.status, files, verdictPass: payload?.verdict?.pass, sha256: payload ? sha256(fs.readFileSync(written)) : null });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 10 — the reviewed evidence of the previous milestone is byte-identical after all of the above.
{
  const reviewedAfter = fs.existsSync(REVIEWED_RESULTS) ? sha256(fs.readFileSync(REVIEWED_RESULTS)) : null;
  record('C3-R36H.1 results are untouched by this suite', reviewedBefore === reviewedAfter,
    { before: reviewedBefore?.slice(0, 16), after: reviewedAfter?.slice(0, 16) });
}

const allOk = cases.every((entry) => entry.ok);
const outDir = path.join(REPO, 'docs', 'c3-r36h2');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'C3-R36H2-OUTPUT-SAFETY.json');
fs.writeFileSync(file, `${JSON.stringify({
  schema: 'alp-c3-r36h2-output-safety-v1',
  runtime: { node: process.version, platform: process.platform },
  cases,
  allExpectationsMet: allOk
}, null, 2)}\n`);
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  file=${file}  sha256=${sha256(fs.readFileSync(file))}`);
process.exitCode = allOk ? 0 : 1;

