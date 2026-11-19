#!/usr/bin/env node
// C3-R37E — generate the R37E carry policy and a NEW trust anchor for the commit that carries the test fix.
//
// The C3-R37D anchor covers a different set of carry files and must not be reused to authorise new code (C3-R37D
// review, and this milestone's brief). This generator emits a versioned policy at its own path and prints the anchor
// the caller must supply independently.
//
// Anchor material, identical in shape to the verifier's:
//   policy|<sha256 of the policy file bytes>
//   carry|<len>:<path>|<sha256>      one entry per carry file, sorted by path
//
// Usage: node docs/c3-r37e/tools/build-r37e-carry-policy.mjs <candidateDir> <targetCommit> <headCommit>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r37e', 'C3-R37E-CARRY-POLICY.json');
const POLICY_REL = 'docs/c3-r37e/C3-R37E-CARRY-POLICY.json';

const [candidateDir, targetCommit, headCommit] = process.argv.slice(2);
if (!candidateDir || !targetCommit || !headCommit) throw new Error('usage: build-r37e-carry-policy.mjs <candidateDir> <targetCommit> <headCommit>');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args, cwd = candidateDir, encoding = 'buffer') => {
  const result = spawnSync('git', args, { cwd, encoding });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return result.stdout;
};

const META = {
  'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json': ['manifest-data', 'content inventory of the verified commit; it cannot live inside the commit it describes'],
  'docs/c3-r37d/C3-R37D-CARRY-POLICY.json': ['verification-policy', 'the C3-R37D carry policy, superseded by this one but retained as reviewed history'],
  'docs/c3-r37d/tools/portable-verify.mjs': ['verifier-code', 'the verification implementation that must itself be anchored'],
  'docs/c3-r37d/tools/build-carry-policy.mjs': ['verification-policy', 'generator for the C3-R37D policy and anchor'],
  'docs/c3-r37d/tools/portable-verify-tests.mjs': ['verification-policy', 'negative tests that define which failures must be refused'],
  'tests/c3-evidence-rehearsal.test.mjs': ['test-code', 'the B32 fix: generated build output excluded from the source-mutation snapshot']
};

const diff = String(git(['diff', '--name-status', targetCommit, headCommit], candidateDir, 'utf8'))
  .split('\n').filter(Boolean).map((line) => {
    const [status, ...rest] = line.split('\t');
    return { status, path: rest.join('\t') };
  });

const carry = diff
  .filter((change) => change.path !== POLICY_REL)
  .map((change) => {
    const meta = META[change.path];
    if (!meta) throw new Error(`R37E_UNCLASSIFIED_CARRY_FILE:${change.path} — every carry file needs a stated kind and purpose`);
    return {
      path: change.path,
      changeType: change.status,
      sha256: sha(git(['cat-file', 'blob', `${headCommit}:${change.path}`])),
      kind: meta[0],
      purpose: meta[1]
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const policy = {
  schema: 'alp-c3-r37d-carry-policy-v1',
  note: 'Exact paths permitted to differ between the verified commit and HEAD for the C3-R37E chain. A directory prefix is never authorisation. This file does not list itself; the trust anchor covers its bytes.',
  supersedes: 'docs/c3-r37d/C3-R37D-CARRY-POLICY.json',
  reviewedChain: { target: targetCommit, head: headCommit },
  carry,
  selfExcluded: { path: POLICY_REL, reason: 'a file cannot contain its own digest; the anchor covers the policy bytes' }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(policy, null, 2)}\n`);

const policyBytes = fs.readFileSync(OUT);
const lines = [`policy|${sha(policyBytes)}`];
for (const entry of carry) lines.push(`carry|${entry.path.length}:${entry.path}|${entry.sha256}`);

console.log(JSON.stringify({
  target: targetCommit,
  head: headCommit,
  carryFiles: carry.length,
  paths: carry.map((c) => `${c.changeType} ${c.path} (${c.kind})`),
  policySha256: sha(policyBytes),
  trustAnchor: sha(Buffer.from(lines.join('\n'), 'utf8'))
}, null, 2));
