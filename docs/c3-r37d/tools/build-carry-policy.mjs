#!/usr/bin/env node
// C3-R37D — generate the exact-path carry policy and the trust anchor for a reviewed chain.
//
// The anchor is the digest the CALLER must supply to the verifier. It is deliberately produced here, outside the
// verifier, so the verifier never derives its own trust input from the repository it is inspecting (B31).
//
// Anchor material (must match portable-verify.mjs exactly):
//   policy|<sha256 of the policy file bytes>
//   carry|<len>:<path>|<sha256>      one line per carry entry, sorted by path
//
// Usage: node docs/c3-r37d/tools/build-carry-policy.mjs <candidateDir> <targetCommit> <expectedCommit> <headCommit>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');
const OUT = path.join(REPO, 'docs', 'c3-r37d', 'C3-R37D-CARRY-POLICY.json');
const POLICY_REL = 'docs/c3-r37d/C3-R37D-CARRY-POLICY.json';

const [candidateDir, targetCommit, expectedCommit, headCommit] = process.argv.slice(2);
if (!candidateDir || !targetCommit || !expectedCommit || !headCommit) {
  throw new Error('usage: build-carry-policy.mjs <candidateDir> <targetCommit> <expectedCommit> <headCommit>');
}

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const git = (args, cwd = candidateDir, encoding = 'buffer') => {
  const result = spawnSync('git', args, { cwd, encoding });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  return result.stdout;
};

// Purpose and classification are stated per file, because "a review document" and "the code that decides whether to
// pass" are not the same kind of object and must not be treated alike.
const META = {
  'docs/c3-r37c/C3-R37C-INTEGRATION-MANIFEST.json': {
    kind: 'manifest-data',
    purpose: 'content inventory of the verified commit; it cannot live inside the commit it describes'
  },
  'docs/c3-r37d/tools/portable-verify.mjs': {
    kind: 'verifier-code',
    purpose: 'the verification implementation that must itself be anchored'
  },
  'docs/c3-r37d/tools/portable-verify-tests.mjs': {
    kind: 'verification-policy',
    purpose: 'negative tests that define which failures must be refused'
  },
  'docs/c3-r37d/tools/build-carry-policy.mjs': {
    kind: 'verification-policy',
    purpose: 'generator for this policy and for the trust anchor'
  }
};

const diff = String(git(['diff', '--name-status', targetCommit, headCommit], candidateDir, 'utf8'))
  .split('\n').filter(Boolean).map((line) => {
    const [status, ...rest] = line.split('\t');
    return { status, path: rest.join('\t') };
  });

const carry = diff
  .filter((change) => change.path !== POLICY_REL)
  .map((change) => {
    const blob = git(['cat-file', 'blob', `${headCommit}:${change.path}`]);
    const meta = META[change.path];
    if (!meta) throw new Error(`R37D_UNCLASSIFIED_CARRY_FILE:${change.path} — every carry file needs a stated kind and purpose`);
    return {
      path: change.path,
      changeType: change.status,
      sha256: sha(blob),
      kind: meta.kind,
      purpose: meta.purpose
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const policy = {
  schema: 'alp-c3-r37d-carry-policy-v1',
  note: 'Every file permitted to differ between the verified commit and HEAD, by exact path. A directory prefix is never authorisation. This file does not list itself; it is bound by the trust anchor instead.',
  reviewedChain: { target: targetCommit, expected: expectedCommit, head: headCommit },
  carry,
  selfExcluded: { path: POLICY_REL, reason: 'a file cannot contain its own digest; the anchor covers the policy bytes' }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(policy, null, 2)}\n`);

// Compute the anchor from the just-written policy bytes and the carry entries, exactly as the verifier will.
const policyBytes = fs.readFileSync(OUT);
const lines = [`policy|${sha(policyBytes)}`];
for (const entry of carry) lines.push(`carry|${entry.path.length}:${entry.path}|${entry.sha256}`);
const anchor = sha(Buffer.from(lines.join('\n'), 'utf8'));

console.log(JSON.stringify({
  target: targetCommit,
  head: headCommit,
  carryFiles: carry.length,
  paths: carry.map((c) => `${c.changeType} ${c.path} (${c.kind})`),
  policySha256: sha(policyBytes),
  trustAnchor: anchor
}, null, 2));
