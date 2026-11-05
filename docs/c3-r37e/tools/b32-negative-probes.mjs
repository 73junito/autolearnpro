#!/usr/bin/env node
// C3-R37E — prove the repaired source-mutation assertion still bites.
//
// Excluding generated build output must not turn "the rehearsal never mutates the source tree" into a no-op.
//
// IMPORTANT: an earlier version of this harness cloned a fresh directory per probe. Every clone lacked node_modules,
// so every probe "failed" — with ERR_MODULE_NOT_FOUND, not with the assertion. Six vacuous passes. This version clones
// ONCE, installs the two dependency sets once, and restores the test file between probes, then asserts *which* subtest
// failed and that the failure is an assertion, not an environment error.
//
// Usage: node docs/c3-r37e/tools/b32-negative-probes.mjs <candidateDir> <workDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CANDIDATE = path.resolve(process.argv[2] ?? '');
const WORK = path.resolve(process.argv[3] ?? '');
if (!CANDIDATE || !WORK) throw new Error('usage: b32-negative-probes.mjs <candidateDir> <workDir>');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout);
};
const TARGET_LINE = '  await rehearse(workspace(t));';
const TEST_REL = 'tests/c3-evidence-rehearsal.test.mjs';

const PROBES = [
  { name: 'tracked source file modified inside the window', inject: `  fs.appendFileSync(path.join(CATALOG, 'src', 'main.js'), '// injected\\n');`, expect: 'fail' },
  { name: 'tracked source file deleted inside the window', inject: `  fs.rmSync(path.join(CATALOG, 'src', 'main.js'));`, expect: 'fail' },
  { name: 'new file added beside the sources inside the window', inject: `  fs.writeFileSync(path.join(CATALOG, 'INJECTED.md'), 'x\\n');`, expect: 'fail' },
  { name: 'new directory added at the top of the app inside the window', inject: `  fs.mkdirSync(path.join(CATALOG, 'injected-dir'), { recursive: true });`, expect: 'fail' },
  { name: 'root package.json modified inside the window', inject: `  fs.appendFileSync(path.join(REPO, 'package.json'), '\\n');`, expect: 'fail' },
  { name: 'Worker source modified inside the window', inject: `  fs.appendFileSync(path.join(WORKER, 'worker.mjs'), '// injected\\n');`, expect: 'fail' },
  // The two dist probes write AFTER the rehearsal call: writing before it makes the rehearsal refuse for its own
  // reason (R35_INPUT_MISSING), which would attribute the failure to the wrong mechanism. Placing the write between the
  // rehearsal and the assertion isolates exactly what the snapshot comparison tolerates.
  { name: 'generated dist written inside the window (documented exclusion)', when: 'after', inject: `  fs.mkdirSync(path.join(CATALOG, 'dist'), { recursive: true }); fs.writeFileSync(path.join(CATALOG, 'dist', 'injected.txt'), 'x');`, expect: 'pass' },
  { name: 'corrupt artefact inside generated dist (documented exclusion)', when: 'after', inject: `  { const d = path.join(CATALOG, 'dist'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'index.html'), 'corrupt'); }`, expect: 'pass' }
];

const dir = path.join(WORK, 'probe-clone');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
git(WORK, ['clone', '--quiet', '--no-hardlinks', CANDIDATE, dir]);

// Install once. Two installs are required (root workspace + isolated toolchain), as documented in C3-R37C §6.
for (const cwd of [dir, path.join(dir, 'infrastructure/c3/build')]) {
  const install = spawnSync('npm', ['ci', '--ignore-scripts'], { cwd, encoding: 'utf8', shell: true });
  if (install.status !== 0) throw new Error(`R37E_INSTALL_FAILED:${cwd}: ${install.stderr}`);
}

const pristine = fs.readFileSync(path.join(dir, TEST_REL), 'utf8');
const cases = [];
for (const [index, probe] of PROBES.entries()) {
  const marker = '    catalog: digestTree(CATALOG, GENERATED_OUTPUT),';
  const markerIndex = pristine.lastIndexOf(marker);
  const callIndex = pristine.lastIndexOf(TARGET_LINE, markerIndex);
  if (markerIndex < 0 || callIndex < 0) throw new Error(`R37E_ANCHOR_NOT_FOUND:${probe.name}`);
  const insertAt = probe.when === 'after' ? callIndex + TARGET_LINE.length : callIndex;
  fs.writeFileSync(path.join(dir, TEST_REL), `${pristine.slice(0, insertAt)}\n${probe.inject}${pristine.slice(insertAt)}`);

  const run = spawnSync(process.execPath, ['--test', '--test-name-pattern=16\\.', TEST_REL], { cwd: dir, encoding: 'utf8' });
  const out = String(run.stdout);
  const failCount = Number((out.match(/# fail (\d+)/) ?? [])[1] ?? -1);
  const namedSixteen = /not ok \d+ - 16\. the rehearsal never mutates the source tree/.test(out)
    || /Subtest: 16\. the rehearsal never mutates the source tree[\s\S]*not ok/.test(out);
  const environmentError = /ERR_MODULE_NOT_FOUND|Cannot find package/.test(out);
  const observed = failCount > 0 ? 'fail' : 'pass';
  // A probe only counts when the outcome matches, the failure is attributed to subtest 16, and no environment error
  // polluted the run. Anything else is a vacuous result and must be reported as such.
  const ok = observed === probe.expect && !environmentError && (observed === 'pass' || namedSixteen);
  cases.push({ probe: probe.name, expected: probe.expect, observed, failCount, attributedToTest16: namedSixteen, environmentError, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${probe.name}  expected=${probe.expect} observed=${observed} fail=${failCount} test16=${namedSixteen} envErr=${environmentError}`);
  // Restore BOTH the test file and the working tree. One probe deletes apps/catalog/src/main.js; without this reset every
  // later probe would run against a damaged checkout and fail for the wrong reason — the same trap as the vacuous
  // per-clone harness, one level further in.
  fs.writeFileSync(path.join(dir, TEST_REL), pristine);
  git(dir, ['checkout', '--', '.']);
  git(dir, ['clean', '-fdq', '-e', 'node_modules']);
}

const allOk = cases.every((c) => c.ok);
const out = path.join(WORK, 'b32-negative-probes.json');
fs.writeFileSync(out, `${JSON.stringify({
  schema: 'alp-c3-r37e-negative-probes-v1',
  note: 'the two "pass" expectations are the accepted cost of excluding generated build output; they are asserted, not assumed',
  cases,
  allExpectationsMet: allOk
}, null, 2)}\n`);
console.log(`\nALL_EXPECTATIONS_MET=${allOk}  cases=${cases.length}  sha256=${sha(fs.readFileSync(out))}`);
process.exitCode = allOk ? 0 : 1;
