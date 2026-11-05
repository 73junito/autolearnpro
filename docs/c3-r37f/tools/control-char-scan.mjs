#!/usr/bin/env node
// C3-R37F — scan text files for unintended control bytes (finding B33).
//
// Allowed: TAB(9), LF(10), CR(13). Everything else below 0x20, plus DEL(127), is reported with its offset and a
// printable context window so the offending text can be identified without a hex editor.
//
// Usage: node docs/c3-r37f/tools/control-char-scan.mjs <directory>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? '');
if (!ROOT) throw new Error('usage: control-char-scan.mjs <directory>');

const SKIP = new Set(['node_modules', '.git', 'dist']);
const TEXT = /\.(mjs|js|cjs|json|md|html|css|yml|yaml|toml|sql|txt|ps1|sh)$/i;
const ALLOWED = new Set([9, 10, 13]);

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(full);
    } else if (TEXT.test(entry.name)) {
      files.push(full);
    }
  }
};
walk(ROOT);

const printable = (text) => [...text]
  .map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? '<0x' + code.toString(16).padStart(2, '0') + '>' : ch;
  })
  .join('');

const findings = [];
for (const file of files) {
  const buffer = fs.readFileSync(file);
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    if ((byte < 32 && !ALLOWED.has(byte)) || byte === 127) {
      const start = Math.max(0, i - 30);
      findings.push({
        file: path.relative(ROOT, file),
        offset: i,
        byte,
        hex: '0x' + byte.toString(16).padStart(2, '0'),
        context: printable(buffer.subarray(start, start + 60).toString('utf8'))
      });
    }
  }
}

const result = {
  schema: 'alp-c3-r37f-control-char-scan-v1',
  root: ROOT,
  scannedFiles: files.length,
  allowedBytes: 'TAB(9) LF(10) CR(13)',
  unexpected: findings.length,
  findings: findings.slice(0, 50)
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = findings.length === 0 ? 0 : 1;
