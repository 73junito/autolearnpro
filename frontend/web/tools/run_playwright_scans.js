#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const cwd = path.resolve(__dirname, '..');

// Default pages to scan. Pass space-separated paths as args to override.
const pages = process.argv.length > 2 ? process.argv.slice(2) : ['/', '/courses', '/catalog'];

async function runScan(pagePath, outFile) {
  return new Promise((resolve, reject) => {
    const args = ["tools/run_playwright_scan.js", pagePath, outFile];
    const proc = spawn('node', args, { cwd, shell: true, stdio: 'inherit' });
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`scan failed: ${pagePath}`))));
  });
}

(async () => {
  console.log('Running Playwright scans for pages:', pages.join(', '));
  for (const p of pages) {
    const sanitized = p === '/' ? 'home' : p.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '');
    const out = `a11y-${sanitized}-playwright.json`;
    console.log(`Scanning ${p} -> ${out}`);
    try {
      await runScan(p, out);
      console.log(`Wrote report ${out}`);
    } catch (err) {
      console.error(err.message || err);
    }
  }
  console.log('All scans complete.');
})();
