#!/usr/bin/env node
// C3-R36H.1 — corrected browser verification gate.
//
// WHY THIS EXISTS: the C3-R36H harness (docs/c3-r36h/tools/browser-verify.mjs) reported check results but always
// exited 0, so a failing check could not fail the gate. It also gated axe only on serious/critical findings. Both are
// defects in the *verification mechanism*; the C3-R36H harness and its results are preserved unmodified as historical
// evidence of that defect.
//
// This harness:
//   * computes an explicit aggregate verdict and exits 0 only when every REQUIRED check passed;
//   * exits 1 for a failed check, a launch failure, a missing build, or any unexpected exception;
//   * captures HTTP responses and failed requests, not just console messages, so a 404 has a URL and a status;
//   * classifies a browser-initiated optional resource (favicon) by name, and fails on every other 4xx/5xx;
//   * requires ZERO axe violations of any impact in the selected WCAG A/AA rule set;
//   * reports keyboard and focus visibility as `notTestable` — never as accessibility success.
//
// Environment (all optional, defaults fit this machine):
//   R36H_PWCORE, R36H_AXE, R36H_BROWSER, R36H_DIST, R36H_OUT
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
const OUT = path.resolve(process.env.R36H_OUT ?? path.join(REPO, 'docs', 'c3-r36h1'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

// Every check that must pass for the gate to open.
const REQUIRED = Object.freeze([
  'pageLoads', 'noPageErrors', 'consoleErrors', 'network', 'headings', 'language',
  'statusMessage', 'axe', 'zoom200', 'narrowViewport', 'noFitmentClaims', 'prototypeIdentified'
]);

// Checks that cannot be demonstrated on this page. They are reported, never counted as success.
const NOT_TESTABLE = Object.freeze(['keyboard', 'focusVisible']);

// A browser asking for a favicon is not an application defect and is not an application resource. It is named here
// once, recorded in every result, and excluded from the fatal set — narrowly, by path and resource type. Every other
// 4xx/5xx response fails the gate.
const OPTIONAL_BROWSER_RESOURCES = Object.freeze(['/favicon.ico']);

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function serve(root, observations) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const target = path.join(root, ...relative.split('/'));
    const miss = !target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile();
    // Recorded server-side, because a browser-initiated request (notably /favicon.ico) never reaches
    // page.on('request') and would otherwise be invisible to attribution.
    observations.push({ method: request.method, path: url.pathname, status: miss ? 404 : 200 });
    if (miss) {
      response.writeHead(404, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(fs.readFileSync(target));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

const pass = (detail = {}) => ({ ok: true, status: 'pass', ...detail });
const fail = (reason, detail = {}) => ({ ok: false, status: 'fail', reason, ...detail });
const notTestable = (reason, detail = {}) => ({ ok: null, status: 'notTestable', reason, ...detail });

async function runChecks(origin, chromium, serverLog) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'c3r36h1-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BROWSER,
    headless: true,
    timeout: 30000,
    viewport: { width: 1280, height: 900 },
    args: ['--no-first-run', '--disable-extensions', '--disable-sync']
  });
  const page = context.pages()[0] ?? await context.newPage();

  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];
  const responses = [];
  const requestFailures = [];

  page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text(), location: message.location?.()?.url ?? null }));
  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
  page.on('request', (request) => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status(), type: response.request().resourceType() }));
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), type: request.resourceType(), error: request.failure()?.errorText ?? null }));

  const checks = {};
  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.catalogShell === 'started', null, { timeout: 10000 });
  // A short settle window: Chrome requests /favicon.ico AFTER the load event, and the C3-R36H harness evaluated
  // console errors before that request could arrive. That timing gap is why the defect was intermittent.
  await page.waitForTimeout(750);

  const sameOrigin = requests.filter((request) => request.url.startsWith(origin));
  const external = requests.filter((request) => !request.url.startsWith(origin));

  const title = await page.title();
  checks.pageLoads = title.length > 0 ? pass({ title }) : fail('empty document title', { title });
  checks.noPageErrors = pageErrors.length === 0 ? pass() : fail('uncaught page error', { pageErrors });

  // HTTP responses and failed requests. A 404 must have a URL and a status, not just a console string. The
  // server-side log is the authority, because a browser-initiated request never appears in page.on('request').
  const serverFailures = serverLog.filter((entry) => entry.status >= 400);
  const classified = serverFailures.filter((entry) => OPTIONAL_BROWSER_RESOURCES.includes(entry.path));
  const fatal = serverFailures.filter((entry) => !OPTIONAL_BROWSER_RESOURCES.includes(entry.path));
  const fatalFailures = requestFailures.filter((failure) => !OPTIONAL_BROWSER_RESOURCES.includes(new URL(failure.url).pathname));
  checks.network = (fatal.length === 0 && fatalFailures.length === 0 && external.length === 0)
    ? pass({
      serverLog,
      optionalBrowserResources: classified.map((entry) => ({ path: entry.path, status: entry.status, classification: 'browser-initiated optional resource' })),
      requestedPaths: serverLog.map((entry) => entry.path)
    })
    : fail('unexpected HTTP failure or third-party request', { serverFailures, failedRequests: fatalFailures, external });

  // Console errors. A resource-load console error is admitted ONLY when the only 4xx/5xx the server answered was a
  // classified optional resource — i.e. it is attributed, not merely tolerated.
  const consoleErrors = consoleMessages.filter((message) => message.type === 'error');
  const RESOURCE_LOAD = /Failed to load resource/i;
  const attributable = consoleErrors.length > 0
    && fatal.length === 0
    && classified.length > 0
    && consoleErrors.every((message) => RESOURCE_LOAD.test(message.text));
  if (consoleErrors.length === 0) {
    checks.consoleErrors = pass({ count: 0 });
  } else if (attributable) {
    checks.consoleErrors = pass({
      count: consoleErrors.length,
      classified: consoleErrors.map((message) => message.text),
      attributedTo: classified.map((entry) => `${entry.path} (${entry.status})`),
      basis: 'every console error is the resource-load failure of a request the server itself recorded as a classified optional browser resource'
    });
  } else {
    checks.consoleErrors = fail('console error not attributable to a classified optional resource', { consoleErrors, serverFailures });
  }

  // Headings, language, status message.
  const headingFacts = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((node) => ({ level: Number(node.tagName[1]), text: node.textContent.trim() }));
    const levels = nodes.map((node) => node.level);
    let skipped = false;
    for (let index = 1; index < levels.length; index += 1) if (levels[index] - levels[index - 1] > 1) skipped = true;
    return { nodes, h1Count: levels.filter((level) => level === 1).length, skipped };
  });
  checks.headings = (headingFacts.h1Count === 1 && !headingFacts.skipped && headingFacts.nodes.length >= 2)
    ? pass(headingFacts) : fail('heading hierarchy is not meaningful', headingFacts);

  const lang = await page.evaluate(() => document.documentElement.lang);
  checks.language = /^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(lang ?? '') ? pass({ lang }) : fail('missing or malformed lang attribute', { lang });

  const statusFacts = await page.evaluate(() => {
    const status = document.getElementById('boot-status');
    if (!status) return { found: false };
    return { found: true, role: status.getAttribute('role'), text: status.textContent.trim() };
  });
  checks.statusMessage = (statusFacts.found && statusFacts.role === 'status' && statusFacts.text.length > 0 && !statusFacts.text.includes('has not started'))
    ? pass(statusFacts) : fail('status message is not exposed or not live', statusFacts);

  // Keyboard and focus visibility — NOT TESTABLE on a page with no operable controls.
  const focusables = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .map((node) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}`));
  const focusRule = await page.evaluate(() => {
    let rule = null;
    for (const sheet of document.styleSheets) {
      try {
        for (const candidate of sheet.cssRules) if (candidate.selectorText && candidate.selectorText.includes('focus-visible')) rule = candidate.style.cssText;
      } catch { /* same-origin page: no unreadable sheet expected */ }
    }
    return rule;
  });
  checks.keyboard = notTestable(
    focusables.length === 0 ? 'no focusable element exists, so keyboard traversal cannot be demonstrated' : 'not exercised in this milestone',
    { focusableCount: focusables.length, focusables }
  );
  checks.focusVisible = notTestable(
    focusRule === null ? 'no :focus-visible rule declared' : 'a rule is declared but nothing can receive focus to render it',
    { ruleDeclared: focusRule !== null, rule: focusRule }
  );

  // axe — ZERO violations of ANY impact. Incomplete evaluations are recorded separately.
  await page.addScriptTag({ path: AXE });
  const axeResult = await page.evaluate(async () => {
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
  checks.axe = axeResult.violations.length === 0
    ? pass({
      violations: 0,
      passes: axeResult.passes,
      incomplete: axeResult.incomplete,
      incompleteNote: 'incomplete items are automated evaluations needing human judgment; they are not passes',
      conformanceClaimed: false,
      contrastNote: 'color-contrast is evaluated automatically only; no manual visual inspection or pixel measurement was made'
    })
    : fail('axe reported at least one violation in the selected rule set', {
      violations: axeResult.violations,
      worstImpact: axeResult.violations.some((violation) => ['serious', 'critical'].includes(violation.impact)) ? 'serious/critical' : 'minor/moderate',
      incomplete: axeResult.incomplete
    });

  // Layout: a 200% zoom proxy, then a narrow viewport.
  await page.setViewportSize({ width: 640, height: 450 });
  const zoomFacts = await page.evaluate(() => {
    const essential = [document.querySelector('h1'), document.querySelector('.notice'), document.querySelector('dl')];
    return {
      essentialPresent: essential.every((node) => node && node.getBoundingClientRect().height > 0),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
  checks.zoom200 = (zoomFacts.essentialPresent && !zoomFacts.horizontalOverflow)
    ? pass({ ...zoomFacts, method: 'halved CSS viewport at the same window size, approximating 200% browser zoom' })
    : fail('essential content lost or horizontal overflow at the 200% zoom proxy', zoomFacts);
  await page.screenshot({ path: path.join(OUT, 'gate-zoom200.png'), fullPage: true });

  await page.setViewportSize({ width: 360, height: 640 });
  const narrowFacts = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  checks.narrowViewport = narrowFacts.scrollWidth <= narrowFacts.clientWidth + 1
    ? pass(narrowFacts) : fail('horizontal overflow at a narrow viewport', narrowFacts);
  await page.screenshot({ path: path.join(OUT, 'gate-360.png'), fullPage: true });

  const text = await page.evaluate(() => document.body.innerText);
  checks.noFitmentClaims = /(KCOE8006|fitment|caliper|rotor|aut-\d+)/i.test(text)
    ? fail('automotive or production content found in rendered text') : pass({ scanned: 'rendered text' });
  checks.prototypeIdentified = (/local prototype/i.test(text) && /not a released catalog/i.test(text))
    ? pass() : fail('page does not identify itself as a prototype');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(OUT, 'gate-1280.png'), fullPage: true });

  const browserVersion = context.browser()?.version() ?? null;
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });

  return { checks, browserVersion, observed: { requests: requests.length, responses: responses.length } };
}

// The aggregate verdict and exit code — the part C3-R36H lacked entirely.
function verdictFor(checks) {
  const failed = REQUIRED.filter((name) => checks[name]?.ok !== true);
  const notTestableNames = Object.entries(checks).filter(([, value]) => value?.status === 'notTestable').map(([name]) => name);
  return {
    pass: failed.length === 0,
    requiredCount: REQUIRED.length,
    passed: REQUIRED.filter((name) => checks[name]?.ok === true),
    failed,
    notTestable: notTestableNames,
    note: 'notTestable checks are excluded from the verdict and are never counted as accessibility success'
  };
}

function finish(payload, code, reason) {
  const result = { ...payload, exitCode: code, reason: reason ?? null };
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, 'C3-R36H1-GATE-RESULTS.json');
    fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ file, sha256: sha256(fs.readFileSync(file)), exitCode: code, verdict: result.verdict ?? null, reason: result.reason }, null, 1));
  } catch (error) {
    console.error(`R36H1_RESULT_WRITE_FAILED:${String(error?.message ?? error)}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code;
}

async function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    finish({ target: { dist: DIST } }, 1, `R36H_DIST_NOT_BUILT:${DIST}`);
    return;
  }

  let server;
  let port;
  const serverLog = [];
  try {
    ({ server, port } = await serve(DIST, serverLog));
  } catch (error) {
    finish({ target: { dist: DIST } }, 1, `R36H_SERVER_FAILED:${String(error?.message ?? error)}`);
    return;
  }

  const origin = `http://127.0.0.1:${port}`;
  try {
    const require = createRequire(import.meta.url);
    const { chromium } = require(PWCORE);
    const outcome = await runChecks(origin, chromium, serverLog);
    const verdict = verdictFor(outcome.checks);
    finish({
      schema: 'alp-c3-r36h1-browser-gate-v1',
      runtime: { node: process.version, platform: process.platform },
      browser: { executable: BROWSER, version: outcome.browserVersion, headless: true, profile: 'temporary, deleted after the run' },
      target: { origin, dist: path.relative(REPO, DIST).split(path.sep).join('/') },
      optionalBrowserResources: OPTIONAL_BROWSER_RESOURCES,
      requiredChecks: REQUIRED,
      checks: outcome.checks,
      observed: outcome.observed,
      verdict,
      conformanceClaimed: false
    }, verdict.pass ? 0 : 1, verdict.pass ? null : `R36H1_REQUIRED_CHECK_FAILED:${verdict.failed.join(',')}`);
  } catch (error) {
    finish({ target: { origin, dist: DIST } }, 1, `R36H1_HARNESS_EXCEPTION:${String(error?.message ?? error).split('\n')[0]}`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`R36H1_UNCAUGHT:${String(error?.message ?? error)}`);
  process.exitCode = 1;
});




