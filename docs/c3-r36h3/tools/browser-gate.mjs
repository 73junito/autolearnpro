#!/usr/bin/env node
// C3-R36H.3 — browser verification gate with a strict output boundary.
//
// WHY THIS EXISTS (finding B24): the C3-R36H.2 gate accepted *any* directory outside the repository, provided it
// existed and was empty. That is safer than the original silent default (F-5) but it is not a temporary-only policy:
// an arbitrary external directory — a documents folder, a network share, another drive — could still be selected.
//
// This copy keeps the C3-R36H.2 check logic and evidence-output safety (gate verified at a99b1d68…) and narrows only
// WHERE results may be written. Two destinations exist, and nothing else:
//
//   1. a fresh, owned directory directly beneath the OS temporary directory, whose name matches
//      `c3r36h3-<12 hex>` — i.e. a directory this milestone's tooling created and can prove it owns;
//   2. a uniquely named reviewed run directory: `docs/c3-r36h3/runs/<name>` where <name> matches
//      `^[a-z0-9][a-z0-9-]{2,39}$` — a single flat level, no nesting.
//
// Everything else is refused, including any other location inside the repository, any subdirectory of the OS temp
// directory that does not match the owned pattern, and any path outside both roots.
//
// Environment:
//   R36H3_OUT    REQUIRED. One of the two authorised destinations above.
//   R36H_PWCORE, R36H_AXE, R36H_BROWSER, R36H_DIST  (unchanged)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { waitForRequestsSettled } from './navigation-readiness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..', '..', '..');

const PWCORE = process.env.R36H_PWCORE ?? 'f:/autolearnpro-meshy-staging/node_modules/playwright-core';
const AXE = process.env.R36H_AXE ?? 'f:/autolearnpro-meshy-staging/node_modules/axe-core/axe.min.js';
const BROWSER = process.env.R36H_BROWSER ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.resolve(process.env.R36H_DIST ?? path.join(REPO, 'apps', 'catalog', 'dist'));

// Variable names a caller might plausibly use by mistake. Reported by name, never honoured silently.
const LEGACY_OUTPUT_VARIABLES = Object.freeze(['R36H2_OUT', 'R36H_OUT', 'R36H1_OUT', 'R36_OUT', 'R36H3_OUTPUT', 'OUTPUT_DIR']);

// The only repository-relative location where results may be written: one flat level under this milestone's runs.
const ALLOWED_REPO_RUNS_DIR = 'docs/c3-r36h3/runs/';
const RUN_NAME = /^[a-z0-9][a-z0-9-]{2,39}$/;

// An owned temporary directory is a direct child of the OS temp root with this exact shape. The random suffix is what
// makes "owned" checkable: a caller cannot point the gate at an arbitrary existing folder and call it temporary.
const OWNED_TEMP_NAME = /^c3r36h3-[0-9a-f]{12}$/;

const RESULT_FILE = 'gate-results.json';
const SCREENSHOTS = Object.freeze(['gate-1280.png', 'gate-zoom200.png', 'gate-360.png']);
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

// --- output safety -------------------------------------------------------------------------------------------

let outputDir = null;        // resolved absolute path
let outputAuthorisedAs = null; // 'owned-temporary' or 'repository-run'
let outputPolicyError = null;
const createdFiles = [];

// Fails closed. There is no default: a missing variable is an error, and a mistyped one is named.
function resolveOutputDir() {
  const raw = process.env.R36H3_OUT;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    const legacy = LEGACY_OUTPUT_VARIABLES.filter((name) => process.env[name] !== undefined);
    throw Error(legacy.length
      ? `R36H3_OUTPUT_VARIABLE_MISNAMED:set R36H3_OUT (found ${legacy.join('/')}; that name is not honoured)`
      : 'R36H3_OUTPUT_REQUIRED:set R36H3_OUT to an owned temporary directory or an authorised run directory');
  }
  if (!path.isAbsolute(raw)) throw Error(`R36H3_OUTPUT_NOT_ABSOLUTE:${raw}`);

  let stats;
  try {
    stats = fs.lstatSync(raw);
  } catch {
    throw Error(`R36H3_OUTPUT_MISSING:${raw}`);
  }
  if (stats.isSymbolicLink()) throw Error(`R36H3_OUTPUT_SYMLINK:${raw}`);
  if (!stats.isDirectory()) throw Error(`R36H3_OUTPUT_NOT_DIRECTORY:${raw}`);

  // Containment is judged on the real path, so a junction cannot smuggle the write somewhere else.
  const resolved = fs.realpathSync(raw);
  const lower = resolved.toLowerCase();
  const repoLower = REPO.toLowerCase();
  let authorisedAs = null;

  if (lower === repoLower || lower.startsWith(repoLower + path.sep)) {
    // Inside the repository: exactly docs/c3-r36h3/runs/<name>, one flat level, no deeper.
    const relative = path.relative(REPO, resolved).split(path.sep).join('/');
    if (!relative.toLowerCase().startsWith(ALLOWED_REPO_RUNS_DIR)) {
      throw Error(`R36H3_OUTPUT_FORBIDDEN:${relative} — only ${ALLOWED_REPO_RUNS_DIR}<name> is authorised inside the repository`);
    }
    const name = relative.slice(ALLOWED_REPO_RUNS_DIR.length);
    if (!RUN_NAME.test(name)) {
      throw Error(`R36H3_OUTPUT_RUN_NAME_INVALID:${name} — must match ${RUN_NAME} (flat, lower-case, 3-40 chars)`);
    }
    authorisedAs = 'repository-run';
  } else {
    // Outside the repository: a direct child of the OS temp root with the owned name shape. Nothing else.
    const tempRoot = fs.realpathSync(os.tmpdir()).toLowerCase();
    const parent = path.dirname(lower);
    const base = path.basename(lower);
    if (parent !== tempRoot) {
      throw Error(`R36H3_OUTPUT_NOT_AUTHORISED:${resolved} — outside the repository and not directly beneath the OS temporary directory`);
    }
    if (!OWNED_TEMP_NAME.test(base)) {
      throw Error(`R36H3_OUTPUT_NOT_OWNED:${base} — a temporary destination must be named c3r36h3-<12 hex>, proving this tooling created it`);
    }
    authorisedAs = 'owned-temporary';
  }

  if (fs.readdirSync(resolved).length) throw Error(`R36H3_OUTPUT_NOT_EMPTY:${resolved}`);
  return { directory: resolved, authorisedAs };
}

// Exclusive creation: an existing reviewed artefact is never replaced.
function writeExclusive(name, data) {
  const target = path.join(outputDir, name);
  fs.writeFileSync(target, data, { flag: 'wx' });
  createdFiles.push(target);
  return target;
}

// Removes only files this run created. Nothing pre-existing is touched, because the directory started empty and only
// these paths were ever written.
function removeOwnedFiles() {
  for (const target of createdFiles.splice(0)) {
    try {
      fs.rmSync(target, { force: true });
    } catch { /* best effort: a leftover file is reported by the failure payload, not hidden */ }
  }
}


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
  // B25: every statement below runs inside try/finally. C3-R36H.1 and R36H.2 closed the context only after a
  // successful run, so a navigation timeout left Chrome alive and this process hung until it was killed.
  try {

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
  // B23 (R37H R2): navigation readiness is observable, not timed. The old `waitForTimeout(750)` settle sleep was
  // a race with the favicon-after-load request and the source of the intermittent navigation timeout: the gate
  // evaluated console errors before that request could arrive. Every wait below has a named budget, and the
  // settle step now waits for server-side request quiescence; budget expiry is an explicit reported failure
  // (R37H_READINESS_TIMEOUT), never a silently relaxed assertion or a raised timeout.
  await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.catalogShell === 'started', null, { timeout: 10000 });
  const settle = await waitForRequestsSettled(serverLog, { quietMs: 400, budgetMs: 10000 });

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

  // Keyboard and focus visibility. NOT TESTABLE on a page with no operable controls (the fixture pages); on a
  // page that HAS focusable elements these are real checks: Tab must traverse every focusable in DOM order with
  // no keyboard trap, and a :focus-visible rule must be declared to render the focus indicator.
  const focusables = await page.evaluate(() => [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.closest('[hidden]') && node.getClientRects().length > 0)
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
  if (focusables.length === 0) {
    checks.keyboard = notTestable('no focusable element exists, so keyboard traversal cannot be demonstrated', { focusableCount: 0, focusables });
    checks.focusVisible = notTestable(
      focusRule === null ? 'no :focus-visible rule declared' : 'a rule is declared but nothing can receive focus to render it',
      { ruleDeclared: focusRule !== null, rule: focusRule }
    );
  } else {
    // Real Tab key events — no synthetic focus assignment, no arbitrary waits between presses.
    const traversal = [];
    let trapped = false;
    for (let step = 0; step <= focusables.length + 1; step += 1) {
      await page.keyboard.press('Tab');
      const active = await page.evaluate(() => {
        const node = document.activeElement;
        return node && node !== document.body ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}` : '(body)';
      });
      if (traversal.length > 0 && active === traversal[traversal.length - 1]) { trapped = true; break; }
      traversal.push(active);
    }
    const visited = new Set(traversal);
    const missed = focusables.filter((name) => !visited.has(name));
    checks.keyboard = (!trapped && missed.length === 0)
      ? pass({ traversal, focusableCount: focusables.length, method: 'real Tab key events in DOM order; repeated presses never stalled' })
      : fail(trapped ? 'keyboard trap: focus did not move on Tab' : 'Tab traversal skipped focusable elements', { traversal, missed, focusables });
    checks.focusVisible = focusRule !== null
      ? pass({ ruleDeclared: true, rule: focusRule, focusableCount: focusables.length })
      : fail('focusable elements exist but no :focus-visible rule is declared', { ruleDeclared: false });
  }

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
  writeExclusive('gate-zoom200.png', await page.screenshot({ fullPage: true }));

  await page.setViewportSize({ width: 360, height: 640 });
  const narrowFacts = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  checks.narrowViewport = narrowFacts.scrollWidth <= narrowFacts.clientWidth + 1
    ? pass(narrowFacts) : fail('horizontal overflow at a narrow viewport', narrowFacts);
  writeExclusive('gate-360.png', await page.screenshot({ fullPage: true }));

  const text = await page.evaluate(() => document.body.innerText);
  checks.noFitmentClaims = /(KCOE8006|fitment|caliper|rotor|aut-\d+)/i.test(text)
    ? fail('automotive or production content found in rendered text') : pass({ scanned: 'rendered text' });
  checks.prototypeIdentified = (/local prototype/i.test(text) && /not a released catalog/i.test(text))
    ? pass() : fail('page does not identify itself as a prototype');

  await page.setViewportSize({ width: 1280, height: 900 });
  writeExclusive('gate-1280.png', await page.screenshot({ fullPage: true }));

  const browserVersion = context.browser()?.version() ?? null;
  return { checks, browserVersion, observed: { requests: requests.length, responses: responses.length, settle } };
  } finally {
    try { await context.close(); } catch { /* the browser may already be gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* the profile may already be gone */ }
  }
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
  if (!outputDir) {
    // No validated destination: report to the console and write nothing anywhere.
    console.log(JSON.stringify({ written: false, exitCode: code, reason: result.reason, verdict: result.verdict ?? null }, null, 1));
    process.exitCode = code;
    return;
  }
  try {
    const target = writeExclusive(RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ file: target, sha256: sha256(fs.readFileSync(target)), exitCode: code, verdict: result.verdict ?? null, reason: result.reason }, null, 1));
  } catch (error) {
    console.error(`R36H3_RESULT_WRITE_FAILED:${String(error?.message ?? error)}`);
    // A run whose results could not be written is not a completed run: remove the artefacts it did write.
    removeOwnedFiles();
    process.exitCode = 1;
    return;
  }
  process.exitCode = code;
}

async function main() {
  // Output configuration is validated before anything else, including the build check.
  try {
    const resolved = resolveOutputDir();
    outputDir = resolved.directory;
    outputAuthorisedAs = resolved.authorisedAs;
  } catch (error) {
    outputPolicyError = String(error?.message ?? error);
    finish({ target: { dist: DIST } }, 1, outputPolicyError);
    return;
  }

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
      schema: 'alp-c3-r36h3-browser-gate-v1',
      runtime: { node: process.version, platform: process.platform },
      browser: { executable: BROWSER, version: outcome.browserVersion, headless: true, profile: 'temporary, deleted after the run' },
      target: { origin, dist: path.relative(REPO, DIST).split(path.sep).join('/') },
      output: { directory: outputDir, authorisedAs: outputAuthorisedAs, exclusive: true },
      optionalBrowserResources: OPTIONAL_BROWSER_RESOURCES,
      requiredChecks: REQUIRED,
      checks: outcome.checks,
      observed: outcome.observed,
      verdict,
      conformanceClaimed: false
    }, verdict.pass ? 0 : 1, verdict.pass ? null : `R36H3_REQUIRED_CHECK_FAILED:${verdict.failed.join(',')}`);
  } catch (error) {
    // An exception must not leave artefacts behind that a reader could mistake for a completed run.
    removeOwnedFiles();
    finish({ target: { origin, dist: DIST }, output: { directory: outputDir } }, 1, `R36H3_HARNESS_EXCEPTION:${String(error?.message ?? error).split('\n')[0]}`);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}


main().catch((error) => {
  console.error(`R36H2_UNCAUGHT:${String(error?.message ?? error)}`);
  process.exitCode = 1;
});
