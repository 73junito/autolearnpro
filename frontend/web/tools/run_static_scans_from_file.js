#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Very small arg parser: non-flag args are [indexFile, outDir]
const rawArgs = process.argv.slice(2);
const flags = new Set();
const nonFlagArgs = [];
let max = Infinity;
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--max') {
    const v = rawArgs[i + 1];
    if (v && !v.startsWith('--')) {
      max = parseInt(v, 10) || Infinity;
      i += 1; // skip value
    }
    continue;
  }
  if (a.startsWith('--')) {
    flags.add(a);
    continue;
  }
  nonFlagArgs.push(a);
}
const indexFile = nonFlagArgs[0] || path.join(__dirname, '../../outputs/html_pages.txt');
const outDir = nonFlagArgs[1] || path.join(__dirname, '..', 'a11y-reports');
const dryRun = flags.has('--dry-run');

function sanitizeName(p) {
  return p.replace(/[:\\/\\\\\s]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

if (!fs.existsSync(indexFile)) {
  console.error(`Index file not found: ${indexFile}`);
  process.exit(2);
}

const raw = fs.readFileSync(indexFile, 'utf8');
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

// Normalize lines: skip lines that are not .html paths
const htmlPaths = [];
for (const l of lines) {
  // skip header lines like "1018 results for **/*.html"
  if (!/\.html$/i.test(l)) continue;
  // if the line is wrapped in backticks or code fences, strip
  let p = l.replace(/^`+|`+$/g, '');
  // convert Windows-style paths to platform paths
  p = p.replace(/\\\\/g, path.sep).replace(/\//g, path.sep);
  // if relative, make absolute relative to repo root (two levels up from this script)
  if (!path.isAbsolute(p)) p = path.resolve(__dirname, '..', '..', p);
  htmlPaths.push(p);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const p of htmlPaths) {
  if (count >= max) break;
  if (!fs.existsSync(p)) {
    console.warn(`Skipping missing file: ${p}`);
    continue;
  }

  const name = sanitizeName(path.relative(path.resolve(__dirname, '..', '..'), p));
  const outFile = path.join(outDir, `${name}.json`);

  const cmd = process.execPath; // node
  const args = [path.join(__dirname, 'a11y_scan_file.js'), p, outFile];

  console.log((dryRun ? '[DRYRUN]' : '[RUN]') + ` ${cmd} ${args.map(a=>a.includes(' ')?`"${a}"`:a).join(' ')}`);

  if (!dryRun) {
    const res = spawnSync(cmd, args, { stdio: 'inherit' });
    if (res.status !== 0) {
      console.error(`Scan failed for ${p} (exit ${res.status})`);
    }
  }

  count += 1;
}

console.log(`Processed ${count} files (reports in ${outDir})`);
