// C3-R37.1 — line-ending policy experiment in disposable repositories. Read-only w.r.t. the real workspace.
// Usage: node c3r37a-lineending.mjs <baseDir>
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const base = process.argv[2];
fs.mkdirSync(base, { recursive: true });

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const crlfCount = (text) => (text.match(/\r\n/g) ?? []).length;

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return String(result.stdout).trim();
}

// Same logical content every time: three lines, CRLF, exactly as the Windows worktree has it.
const CONTENT = 'line1\r\nline2\r\nline3\r\n';

const scenarios = [
  { name: 'A-status-quo', attributes: null },
  { name: 'B-text-auto-lf', attributes: '* text=auto eol=lf\n' },
  { name: 'C-text-off-all', attributes: '* -text\n' },
  { name: 'D-text-off-scoped', attributes: 'sample.mjs -text\n*.json -text\n' }
];

const report = [];
for (const scenario of scenarios) {
  const repo = path.join(base, scenario.name, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'probe@local']);
  git(repo, ['config', 'user.name', 'probe']);
  fs.writeFileSync(path.join(repo, 'sample.mjs'), CONTENT);
  if (scenario.attributes) fs.writeFileSync(path.join(repo, '.gitattributes'), scenario.attributes);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'probe']);

  const blob = spawnSync('git', ['cat-file', 'blob', 'HEAD:sample.mjs'], { cwd: repo });
  const blobText = String(blob.stdout);
  const entry = {
    scenario: scenario.name,
    attributes: scenario.attributes,
    committedBytes: CONTENT.length,
    blobBytes: Buffer.byteLength(blobText, 'utf8'),
    blobCrlf: crlfCount(blobText),
    checkouts: {}
  };

  // Two checkouts of the same commit, differing only in core.autocrlf.
  for (const autocrlf of ['false', 'true']) {
    const clone = path.join(base, scenario.name, `clone-autocrlf-${autocrlf}`);
    git(base, ['clone', '-q', '-c', `core.autocrlf=${autocrlf}`, repo, clone]);
    const text = fs.readFileSync(path.join(clone, 'sample.mjs'), 'utf8');
    entry.checkouts[`autocrlf=${autocrlf}`] = {
      bytes: Buffer.byteLength(text, 'utf8'),
      crlf: crlfCount(text),
      sha256: sha(fs.readFileSync(path.join(clone, 'sample.mjs')))
    };
  }
  report.push(entry);
}

const expected = sha(Buffer.from(CONTENT, 'utf8'));
console.log(JSON.stringify({ sourceSha256: expected, sourceBytes: CONTENT.length, report }, null, 2));
