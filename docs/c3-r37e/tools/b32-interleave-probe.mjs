#!/usr/bin/env node
// C3-R37E — deterministic reproduction of B32 by controlled interleaving.
//
// The real failure is timing-dependent: `c3-catalog-skeleton` deletes and rebuilds `apps/catalog/dist` while
// `c3-evidence-rehearsal` snapshots the whole `apps/catalog` tree before and after a rehearsal run. Two parallel test
// files, one shared generated directory.
//
// Rather than hope to hit the window, this probe FORCES the interleaving and timestamps every step with a monotonic
// clock, so the mechanism is demonstrated instead of inferred:
//
//   t0  snapshot A (dist absent)
//   t1  rm -rf dist
//   t2  vite build ............ completes at t3
//   t4  snapshot B (dist present)
//
// It then evaluates the assertion the rehearsal makes, twice: with dist included in the snapshot (current behaviour)
// and with generated output excluded (the proposed fix). The first must mismatch, the second must match.
//
// Usage: node docs/c3-r37e/tools/b32-interleave-probe.mjs <repoDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(process.argv[2] ?? '');
if (!REPO) throw new Error('usage: b32-interleave-probe.mjs <repoDir>');

const APP = path.join(REPO, 'apps', 'catalog');
const DIST = path.join(APP, 'dist');
const VITE_BIN = path.join(REPO, 'node_modules', 'vite', 'bin', 'vite.js');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // milliseconds, monotonic

function walk(dir, filter = () => true) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) visit(abs);
      else if (filter(abs)) out.push(abs);
    }
  };
  if (fs.existsSync(dir)) visit(dir);
  return out.sort();
}

// Faithful copy of the rehearsal's digestTree: relative path, sha256, size. `skip` is the only addition, used to model
// the proposed fix without touching the test.
function digestTree(dir, skip = null) {
  const rows = [];
  const visit = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      if (skip && skip(absolute)) continue;
      const stats = fs.lstatSync(absolute);
      if (stats.isDirectory()) visit(absolute);
      else rows.push([path.relative(dir, absolute).split(path.sep).join('/'), sha256(fs.readFileSync(absolute)), stats.size]);
    }
  };
  visit(dir);
  return rows;
}

if (!fs.existsSync(VITE_BIN)) throw new Error(`R37E_VITE_MISSING:${VITE_BIN} — run npm ci first`);

const timeline = [];
const mark = (event, extra = {}) => timeline.push({ t: +now().toFixed(3), event, ...extra });

mark('probe-start');
fs.rmSync(DIST, { recursive: true, force: true });
mark('dist-removed', { distExists: fs.existsSync(DIST) });

// t0 — the rehearsal's "before" snapshot
const beforeAll = digestTree(APP);
const beforeSource = digestTree(APP, (abs) => abs === DIST);
mark('snapshot-before', { includingDist: beforeAll.length, sourceOnly: beforeSource.length, distExists: fs.existsSync(DIST) });

// t1..t3 — the catalog-build test's rm + build, which is what really happens in parallel
fs.rmSync(DIST, { recursive: true, force: true });
mark('skeleton-rm-dist');
const buildStart = now();
const build = spawnSync(process.execPath, [VITE_BIN, 'build', '--logLevel', 'warn'], { cwd: APP, encoding: 'utf8', timeout: 120000 });
mark('skeleton-build-end', { exit: build.status, durationMs: +(now() - buildStart).toFixed(1), distExists: fs.existsSync(DIST) });

// t4 — the rehearsal's "after" snapshot
const afterAll = digestTree(APP);
const afterSource = digestTree(APP, (abs) => abs === DIST);
mark('snapshot-after', { includingDist: afterAll.length, sourceOnly: afterSource.length });

const sameAll = JSON.stringify(afterAll) === JSON.stringify(beforeAll);
const sameSource = JSON.stringify(afterSource) === JSON.stringify(beforeSource);
const appeared = afterAll.filter((row) => !beforeAll.some((b) => b[0] === row[0])).map((row) => row[0]);

const result = {
  schema: 'alp-c3-r37e-interleave-probe-v1',
  repo: REPO,
  mechanism: 'catalog-build test recreates apps/catalog/dist inside the rehearsal test\'s snapshot window',
  timeline,
  windowMs: +(timeline.at(-2).t - timeline.find((e) => e.event === 'snapshot-before').t).toFixed(3),
  rowsAppearedDuringWindow: appeared,
  assertionIncludingDist: sameAll ? 'MATCH (would pass)' : 'MISMATCH (would fail) — this is B32',
  assertionSourceOnly: sameSource ? 'MATCH (would pass) — generated output excluded' : 'MISMATCH',
  conclusion: sameAll === false && sameSource === true
    ? 'reproduced: including generated dist in the source snapshot makes the assertion fail whenever the build lands inside the window'
    : 'not reproduced as expected — investigate before claiming a cause'
};

const out = path.join(REPO, 'docs', 'c3-r37e', 'b32-interleave-probe.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, writtenTo: path.relative(REPO, out) }, null, 2));
process.exitCode = sameAll === false && sameSource === true ? 0 : 1;
