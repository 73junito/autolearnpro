#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const { JSDOM } = require('jsdom');
const axeCore = require('axe-core');

const url = process.argv[2] || 'http://localhost:3000/courses';
const outPath = process.argv[3] || 'a11y-report.json';

function fetchUrl(u) {
  return new Promise((resolve, reject) => {
    const req = http.get(u, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

async function fetchWithRetries(u, attempts = 30, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetchUrl(u);
      if (r.status >= 200 && r.status < 400 && r.body && r.body.length > 50) return r.body;
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Failed to fetch ${u} after ${attempts} attempts`);
}

async function run() {
  console.log(`Fetching ${url} ...`);
  const html = await fetchWithRetries(url);
  console.log('Fetched HTML, running axe-core...');

  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const { window } = dom;

  // Inject axe-core source into the jsdom window
  const s = window.document.createElement('script');
  s.textContent = axeCore.source;
  window.document.head.appendChild(s);

  // Run axe in the page context
  const results = await window.axe.run(window.document);

  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote report to ${outPath}`);
  // Print summary
  console.log(`Violations: ${results.violations.length}, Passes: ${results.passes.length}, Incomplete: ${results.incomplete.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
