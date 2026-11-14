#!/usr/bin/env node
// C3-R37F — confirm the B33 correction changed comment text only.
//
// Line splitting and joins use String.fromCharCode so the script is transport-safe: an earlier attempt using a literal
// regex with escape sequences was mangled by the shell layer, which is exactly the class of byte-level problem this
// milestone is about.
//
// Usage: node docs/c3-r37f/tools/comment-only-check.mjs <candidateDir> <oldCommit> <file>
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const [repo, oldCommit, relFile] = process.argv.slice(2);
if (!repo || !oldCommit || !relFile) throw new Error('usage: comment-only-check.mjs <candidateDir> <oldCommit> <file>');

const LF = String.fromCharCode(10);
const strip = (text) => text
  .split(new RegExp(String.fromCharCode(13) + '?' + LF))
  .filter((line) => !line.trim().startsWith('//'))
  .join(LF);

const old = execSync(`git show ${oldCommit}:${relFile}`, { cwd: repo, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const now = fs.readFileSync(path.join(repo, relFile), 'utf8');

const oldCode = strip(old);
const nowCode = strip(now);
const oldComments = Buffer.byteLength(old) - Buffer.byteLength(oldCode);
const nowComments = Buffer.byteLength(now) - Buffer.byteLength(nowCode);

const result = {
  schema: 'alp-c3-r37f-comment-only-check-v1',
  file: relFile,
  oldCommit,
  executableCodeIdentical: oldCode === nowCode,
  executableBytes: Buffer.byteLength(nowCode),
  commentBytes: { before: oldComments, after: nowComments, delta: nowComments - oldComments },
  totalBytes: { before: Buffer.byteLength(old), after: Buffer.byteLength(now) }
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.executableCodeIdentical ? 0 : 1;
