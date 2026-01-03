#!/usr/bin/env node
const fs = require('fs');
const { chromium } = require('playwright');
const axe = require('axe-core');

const url = process.argv[2] || 'http://localhost:3000/courses';
const out = process.argv[3] || 'a11y-playwright.json';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log(`Navigating to ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle' });

  // inject axe-core
  await page.addScriptTag({ content: axe.source });

  // Wait a moment for client rendering to settle
  await page.waitForTimeout(500);

  const results = await page.evaluate(async () => {
    return await window.axe.run(document);
  });

  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`Wrote Playwright a11y report to ${out}`);

  await browser.close();
})();
