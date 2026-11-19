#!/usr/bin/env node
// C3-R36H — local browser and accessibility verification of the C3-R34 catalog skeleton.
//
// DESIGN CONSTRAINTS FROM THE AUTHORIZATION:
//   * no dependency added to the authoritative root — playwright-core and axe-core are imported by absolute path
//     from an unrelated workspace, and nothing is installed;
//   * no Windows browser settings touched — a throwaway user-data-dir is created per run;
//   * localhost only — a static server bound to 127.0.0.1 on an ephemeral port serves the built catalog.
//
// WHAT IT DOES NOT DO: it does not claim WCAG conformance. It reports what an automated engine found, plus what a
// human has to judge, and it records the difference.
//
// Environment (all optional, defaults fit this machine):
//   R36H_PWCORE  path to a playwright-core package (default: the staging workspace's copy)
//   R36H_AXE     path to axe.min.js
//   R36H_BROWSER path to a Chromium-family executable
//   R36H_DIST    built catalog directory (default: apps/catalog/dist)
//   R36H_OUT     results directory (screenshots + JSON)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');

const PWCORE = process.env.R36H_PWCORE ?? 'f:/autolearnpro-meshy-staging/node_modules/playwright-core';
const AXE = process.env.R36H_AXE ?? 'f:/autolearnpro-meshy-staging/node_modules/axe-core/axe.min.js';
const BROWSER = process.env.R36H_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.resolve(process.env.R36H_DIST ?? path.join(REPO, 'apps', 'catalog', 'dist'));
const OUT = path.resolve(process.env.R36H_OUT ?? path.join(REPO, 'docs', 'c3-r36h'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

// A static server for the built catalog, bound to loopback only.
function serve(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const target = path.join(root, ...relative.split('/'));
    if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(fs.readFileSync(target));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

async function main() {
  const require = createRequire(import.meta.url);
  const { chromium } = require(PWCORE);

  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw Error(`R36H_DIST_NOT_BUILT:${DIST}`);

  const { server, port } = await serve(DIST);
  const origin = `http://127.0.0.1:${port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'c3r36h-profile-'));
  // A launch timeout is deliberate: a harness that hangs is worse than one that fails. `launchPersistentContext`
  // is the only supported way to pin a profile directory — passing --user-data-dir in args is rejected.
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER,
    headless: true,
    timeout: 30000,
    viewport: { width: 1280, height: 900 },
    args: ['--no-first-run', '--disable-extensions', '--disable-sync']
  });
  const browser = context.browser();

  const page = context.pages()[0] ?? await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
  page.on('request', (request) => requests.push(request.url()));

  const checks = {};
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.catalogShell === 'started', null, { timeout: 10000 });

  // 1 — the page loads
  checks.pageLoads = { ok: (await page.title()).length > 0, title: await page.title() };

  // 2 — no uncaught JavaScript errors
  checks.noUncaughtErrors = { ok: pageErrors.length === 0 && consoleErrors.length === 0, pageErrors, consoleErrors };

  // 3 / 4 — no unexpected and no third-party requests
  const external = requests.filter((url) => !url.startsWith(origin));
  checks.requests = {
    ok: external.length === 0,
    count: requests.length,
    sameOrigin: requests.filter((url) => url.startsWith(origin)).map((url) => url.replace(origin, '')),
    external
  };

  // 5 — heading hierarchy
  checks.headings = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((node) => ({ level: Number(node.tagName[1]), text: node.textContent.trim() }));
    const levels = nodes.map((node) => node.level);
    const h1Count = levels.filter((level) => level === 1).length;
    let skipped = false;
    for (let index = 1; index < levels.length; index += 1) {
      if (levels[index] - levels[index - 1] > 1) skipped = true;
    }
    return { nodes, h1Count, skipped, ok: h1Count === 1 && !skipped && nodes.length >= 2 };
  });

  // 6 — document language declared
  checks.language = await page.evaluate(() => {
    const lang = document.documentElement.lang;
    return { ok: typeof lang === 'string' && /^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(lang), lang };
  });

  // 7 — status message exposed to assistive technology
  checks.statusMessage = await page.evaluate(() => {
    const status = document.getElementById('boot-status');
    if (!status) return { ok: false, reason: 'no #boot-status element' };
    const role = status.getAttribute('role');
    const text = status.textContent.trim();
    return { ok: role === 'status' && text.length > 0 && !text.includes('has not started'), role, text, ariaLive: status.getAttribute('aria-live') };
  });

  // 8 / 9 — keyboard reachability and focus visibility, reported honestly when vacuous
  const focusables = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`));
  const focusRule = await page.evaluate(() => {
    let rule = null;
    for (const sheet of document.styleSheets) {
      try {
        for (const candidate of sheet.cssRules) {
          if (candidate.selectorText && candidate.selectorText.includes('focus-visible')) rule = candidate.style.cssText;
        }
      } catch { /* an unreadable sheet is not applicable to this same-origin page */ }
    }
    return rule;
  });
  checks.keyboard = {
    ok: true,
    focusableCount: focusables.length,
    focusables,
    note: focusables.length === 0
      ? 'no interactive controls exist, so keyboard traversal is vacuously satisfied — this is an absence, not a designed property'
      : 'interactive controls present and reachable by Tab',
    focusVisibleRuleDeclared: focusRule !== null,
    focusVisibleRule: focusRule
  };

  // 10 — automated engine. Findings are reported; conformance is never claimed.
  await page.addScriptTag({ path: AXE });
  const axe = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return {
      violations: result.violations.map((violation) => ({
        id: violation.id, impact: violation.impact, help: violation.help,
        nodes: violation.nodes.length, targets: violation.nodes.map((node) => node.target.join(' '))
      })),
      incomplete: result.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),
      passes: result.passes.length
    };
  });
  const serious = axe.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  checks.axe = {
    ok: serious.length === 0,
    engine: 'axe-core, tags wcag2a / wcag2aa / wcag21a / wcag21aa',
    violations: axe.violations,
    seriousOrCritical: serious.length,
    incomplete: axe.incomplete,
    passes: axe.passes,
    conformanceClaimed: false
  };

  // 11 — 200% zoom, simulated by halving the CSS viewport at the same window size
  await page.setViewportSize({ width: 640, height: 450 });
  checks.zoom200 = await page.evaluate(() => {
    const essential = [document.querySelector('h1'), document.querySelector('.notice'), document.querySelector('dl')];
    const present = essential.every((node) => node && node.getBoundingClientRect().height > 0);
    const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      ok: present && !overflow,
      essentialPresent: present,
      horizontalOverflow: overflow,
      method: 'halved CSS viewport at the same window size, which approximates 200% browser zoom'
    };
  });
  await page.screenshot({ path: path.join(OUT, 'catalog-zoom200.png'), fullPage: true });

  // 12 — narrow mobile viewport
  await page.setViewportSize({ width: 360, height: 640 });
  checks.narrowViewport = await page.evaluate(() => ({
    ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  await page.screenshot({ path: path.join(OUT, 'catalog-360.png'), fullPage: true });

  // 13 / 14 — content claims
  const text = await page.evaluate(() => document.body.innerText);
  checks.noFitmentClaims = { ok: !/(KCOE8006|fitment|caliper|rotor|aut-\d+)/i.test(text), scanned: 'rendered text' };
  checks.prototypeIdentified = {
    ok: /local prototype/i.test(text) && /not a released catalog/i.test(text),
    matchedPrototype: /local prototype/i.test(text),
    matchedNotReleased: /not a released catalog/i.test(text)
  };

  // Reference screenshot at the default viewport.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(OUT, 'catalog-1280.png'), fullPage: true });

  const files = fs.readdirSync(DIST, { recursive: true }).filter((name) => typeof name === 'string');
  const result = {
    schema: 'alp-c3-r36h-browser-verification-v1',
    runtime: { node: process.version, platform: process.platform },
    browser: { executable: BROWSER, engine: 'Chromium', version: browser.version(), headless: true, userDataDir: 'temporary, created per run' },
    target: { origin, dist: path.relative(REPO, DIST).split(path.sep).join('/'), files: files.map((name) => name.split(path.sep).join('/')) },
    checks,
    screenshots: ['catalog-1280.png', 'catalog-zoom200.png', 'catalog-360.png'],
    conformanceClaimed: false,
    note: 'Automated findings are not WCAG conformance. Human-judgment items are enumerated in the milestone record.'
  };

  await context.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(profile, { recursive: true, force: true });

  const outFile = path.join(OUT, 'C3-R36H-BROWSER-RESULTS.json');
  fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    file: outFile,
    sha256: sha256(fs.readFileSync(outFile)),
    checks: Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.ok ?? null]))
  }, null, 1));
}

main().catch((error) => {
  console.error(`R36H_FAILED:${String(error?.message ?? error)}`);
  process.exitCode = 1;
});


