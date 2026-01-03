#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'a11y-playwright.json');
try {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const v = Array.isArray(data.violations) ? data.violations.length : 0;
  const i = Array.isArray(data.incomplete) ? data.incomplete.length : 0;
  const p = Array.isArray(data.passes) ? data.passes.length : 0;
  console.log(`a11y report: violations=${v}, incomplete=${i}, passes=${p}`);
  if (v > 0) {
    console.error('Accessibility violations found — failing. See report for details.');
    process.exit(2);
  }
  console.log('No accessibility violations — OK.');
  process.exit(0);
} catch (err) {
  console.error('Failed to read or parse a11y report:', err.message || err);
  process.exit(3);
}
