#!/usr/bin/env node
// C3-R36H.3 — output-boundary tests for the browser gate.
//
// These cases are about WHERE evidence may be written. The C3-R36H.2 gate accepted any empty directory outside the
// repository (finding B24); this suite proves the narrowed policy: an owned temporary directory or an authorised run
// directory, and nothing else.
//
// Usage: node docs/c3-r36h3/tools/output-safety-tests.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const GATE = path.join(here, 'browser-gate.mjs');
const H1 = path.join(REPO, 'docs', 'c3-r36h1');
const H2_TOOLS = path.join(REPO, 'docs', 'c3-r36h2', 'tools');
const TMP = fs.realpathSync(os.tmpdir());

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

// Fingerprint every reviewed file in the two earlier milestones, so the suite can prove it changed none of them.
// Recursive: a non-recursive walk would silently skip docs/c3-r36h1/tools, which holds the reviewed gate itself.
function treeHashes(root) {
  const out = {};
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out[path.relative(root, full).split(path.sep).join('/')] = sha256(fs.readFileSync(full));
      }
    }
  };
  walk(root);
  return out;
}
const h1Before = treeHashes(H1);
const h2Before = treeHashes(H2_TOOLS);

const OUTPUT_VARS = ['R36H3_OUT', 'R36H2_OUT', 'R36H_OUT', 'R36H1_OUT', 'R36_OUT', 'OUTPUT_DIR'];

function gate(env) {
  const merged = { ...process.env, ...env };
  for (const name of OUTPUT_VARS) if (!(name in env)) delete merged[name];
  const child = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: merged, timeout: 180000 });
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
const record = (name, ok, detail) => {
  cases.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};
const reasonOf = (result) => String(result.json?.reason ?? '');


// 1 — no output configuration at all.
{
  const before = fs.readdirSync(path.join(REPO, 'docs')).sort().join(',');
  const result = gate({});
  const after = fs.readdirSync(path.join(REPO, 'docs')).sort().join(',');
  record('missing output configuration fails closed', result.status === 1
    && /^R36H3_OUTPUT_REQUIRED/.test(reasonOf(result)) && result.json?.written === false && before === after,
  { exit: result.status, reason: reasonOf(result).slice(0, 70), docsUnchanged: before === after });
}

// 2 — the F-5/B24 case: the previous milestone's variable name.
{
  const result = gate({ R36H2_OUT: ownedTemp() });
  record('superseded variable name is reported, not honoured', result.status === 1
    && /^R36H3_OUTPUT_VARIABLE_MISNAMED/.test(reasonOf(result)) && reasonOf(result).includes('R36H2_OUT'),
  { exit: result.status, reason: reasonOf(result).slice(0, 80) });
}

// 3 — destination does not exist.
{
  const result = gate({ R36H3_OUT: path.join(TMP, 'c3r36h3-000000000000') });
  record('missing destination is refused', result.status === 1
    && /^R36H3_OUTPUT_MISSING/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 60) });
}

// 4 — occupied destination: refused, and the occupant is byte-identical afterwards.
{
  const dir = ownedTemp();
  const planted = path.join(dir, 'gate-results.json');
  fs.writeFileSync(planted, '{"reviewed":"evidence"}');
  const before = sha256(fs.readFileSync(planted));
  const result = gate({ R36H3_OUT: dir });
  const survived = sha256(fs.readFileSync(planted)) === before;
  record('occupied destination is refused and preserved', result.status === 1
    && /^R36H3_OUTPUT_NOT_EMPTY/.test(reasonOf(result)) && survived,
  { exit: result.status, reason: reasonOf(result).slice(0, 60), occupantUnchanged: survived });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5 — the reviewed C3-R36H.1 evidence directory: the exact previously mistaken destination (B22 test).
{
  const result = gate({ R36H3_OUT: H1 });
  record('C3-R36H.1 evidence directory is refused', result.status === 1
    && /^R36H3_OUTPUT_FORBIDDEN/.test(reasonOf(result)) && reasonOf(result).includes('docs/c3-r36h1'),
  { exit: result.status, reason: reasonOf(result).slice(0, 80) });
}

// 6 — any other in-repository location.
{
  const result = gate({ R36H3_OUT: path.join(REPO, 'docs') });
  record('repository docs root is refused', result.status === 1
    && /^R36H3_OUTPUT_FORBIDDEN/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 60) });
}

// 7 — an existing temporary subdirectory that this tooling did not create (the B24 gap).
{
  const dir = path.join(TMP, `arbitrary-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir);
  const result = gate({ R36H3_OUT: dir });
  record('unowned temporary subdirectory is refused (B24)', result.status === 1
    && /^R36H3_OUTPUT_NOT_OWNED/.test(reasonOf(result)),
  { exit: result.status, reason: reasonOf(result).slice(0, 70) });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 8 — nested below an owned directory: depth, not just naming.
{
  const outer = ownedTemp();
  const inner = path.join(outer, 'nested');
  fs.mkdirSync(inner);
  const result = gate({ R36H3_OUT: inner });
  record('a directory nested below the temp root is refused', result.status === 1
    && /^R36H3_OUTPUT_NOT_AUTHORISED/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 70) });
  fs.rmSync(outer, { recursive: true, force: true });
}

// 9 — a location outside both authorised roots entirely.
{
  const result = gate({ R36H3_OUT: 'F:\\' });
  record('drive root is refused', result.status === 1
    && /^R36H3_OUTPUT_NOT_AUTHORISED/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 60) });
}

// 10 — an authorised root with a non-conforming run name.
{
  const dir = path.join(REPO, 'docs', 'c3-r36h3', 'runs', 'Not_A_Valid_Name');
  fs.mkdirSync(dir, { recursive: true });
  const result = gate({ R36H3_OUT: dir });
  record('invalid run directory name is refused', result.status === 1
    && /^R36H3_OUTPUT_RUN_NAME_INVALID/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 70) });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 11 — a junction inside the temp root pointing at the repository: the link itself must be refused.
{
  const link = path.join(TMP, `c3r36h3-${crypto.randomBytes(6).toString('hex')}`);
  const made = spawnSync('cmd', ['/c', 'mklink', '/J', link, path.join(REPO, 'docs')], { encoding: 'utf8' });
  if (made.status === 0 && fs.existsSync(link)) {
    const result = gate({ R36H3_OUT: link });
    record('junction into the repository is refused', result.status === 1
      && /^R36H3_OUTPUT_(SYMLINK|NOT_AUTHORISED|NOT_OWNED|FORBIDDEN)/.test(reasonOf(result)),
    { exit: result.status, reason: reasonOf(result).slice(0, 70) });
    fs.rmSync(link, { recursive: false, force: true });
  } else {
    // Not a pass: the case could not be exercised on this host, and is reported as such.
    record('junction into the repository is refused', false,
      { skipped: true, note: 'could not create a junction on this host', stderr: String(made.stderr).slice(0, 80) });
  }
}

// 12 — a file where a directory is required.
{
  const file = path.join(TMP, `c3r36h3-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(file, 'not a directory');
  const result = gate({ R36H3_OUT: file });
  record('a file is not accepted as a destination', result.status === 1
    && /^R36H3_OUTPUT_NOT_DIRECTORY/.test(reasonOf(result)), { exit: result.status, reason: reasonOf(result).slice(0, 60) });
  fs.rmSync(file, { force: true });
}

// A directory this tooling owns: the exact name shape the policy requires, created fresh per case.
function ownedTemp() {
  const dir = path.join(TMP, `c3r36h3-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(dir);
  return dir;
}

// 13 — a clean run into an owned temporary directory: exactly four files, and the authorisation is recorded.
{
  const dir = ownedTemp();
  const result = gate({ R36H3_OUT: dir });
  const files = fs.readdirSync(dir).sort();
  const expected = ['gate-1280.png', 'gate-360.png', 'gate-results.json', 'gate-zoom200.png'];
  const written = path.join(dir, 'gate-results.json');
  const payload = fs.existsSync(written) ? JSON.parse(fs.readFileSync(written, 'utf8')) : null;
  record('clean run into an owned temp directory passes', result.status === 0
    && JSON.stringify(files) === JSON.stringify(expected)
    && payload?.verdict?.pass === true
    && payload?.output?.authorisedAs === 'owned-temporary',
  { exit: result.status, files, authorisedAs: payload?.output?.authorisedAs, verdictPass: payload?.verdict?.pass });
  fs.rmSync(dir, { recursive: true, force: true });
}

// 14 — the reviewed evidence of both earlier milestones is byte-identical after the whole suite.
{
  const h1After = treeHashes(H1);
  const h2After = treeHashes(H2_TOOLS);
  record('C3-R36H.1 and C3-R36H.2 files are untouched',
    JSON.stringify(h1Before) === JSON.stringify(h1After) && JSON.stringify(h2Before) === JSON.stringify(h2After),
    { h1Files: Object.keys(h1After).length, h2Files: Object.keys(h2After).length,
      h1Same: JSON.stringify(h1Before) === JSON.stringify(h1After),
      h2Same: JSON.stringify(h2Before) === JSON.stringify(h2After) });
}

const allOk = cases.every((entry) => entry.ok);
const outDir = path.join(REPO, 'docs', 'c3-r36h3');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'C3-R36H3-OUTPUT-BOUNDARY.json');
fs.writeFileSync(file, `${JSON.stringify({
  schema: 'alp-c3-r36h3-output-boundary-v1',
  runtime: { node: process.version, platform: process.platform },
  cases,
  allExpectationsMet: allOk
}, null, 2)}\n`);
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  file=${path.basename(file)}  sha256=${sha256(fs.readFileSync(file))}`);
process.exitCode = allOk ? 0 : 1;

