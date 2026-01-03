#!/usr/bin/env node
const fs = require('fs');
const { JSDOM } = require('jsdom');
const axeCore = require('axe-core');

const filePath = process.argv[2];
const outPath = process.argv[3] || 'a11y-report.json';

if (!filePath) {
  console.error('Usage: node a11y_scan_file.js <path/to/file.html> [out.json]');
  process.exit(2);
}

const html = fs.readFileSync(filePath, 'utf8');
// Allow injected scripts to run so axe-core attaches to window
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
const { window } = dom;

(async () => {
  let source = axeCore && axeCore.source;
  if (!source) {
    // try dynamic import in case package uses ESM default export
    try {
      const mod = await import('axe-core');
      source = mod && (mod.source || (mod.default && mod.default.source));
    } catch (e) {
      // ignore
    }
  }
  if (!source) {
    console.error('Could not locate axe-core source to inject into jsdom window.');
    process.exit(1);
  }

  const s = window.document.createElement('script');
  s.textContent = source;
  window.document.head.appendChild(s);

  try {
    const results = await window.axe.run(window.document);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log(`Wrote report to ${outPath}`);
    console.log(`Violations: ${results.violations.length}, Passes: ${results.passes.length}, Incomplete: ${results.incomplete.length}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
