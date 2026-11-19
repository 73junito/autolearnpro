// C3-R37H remediation R2 (finding B23) — browser navigation stability tests.
//
// Acceptance cases required by the remediation directive:
//   - repeated navigation runs
//   - slow-resource simulation
//   - delayed service startup
//   - navigation error
//   - missing resource
//   - timeout expiration
//   - browser shutdown during navigation
//
// Every test has an explicit timeout and explicit cleanup. There are no unconditional retries: a failure is a
// failure. Skips are reported with a reason when no browser or Playwright is available — never as a pass.
//
// Run with: node --test tests/c3-browser-stability.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { waitForRequestsSettled, navigateSettled } from '../docs/c3-r36h3/tools/navigation-readiness.mjs';

const { resolvePlaywright, engineExecutable, STRICT } = await import('./helpers/browser-resolution.mjs');
const { module: pwModule, error: moduleError } = resolvePlaywright();
const chromium = pwModule ? pwModule.chromium : null;
const CHROMIUM_EXE = chromium ? engineExecutable(pwModule, 'chromium') : null;
let unavailableReason = null;
if (!chromium) unavailableReason = moduleError || 'playwright-core unavailable';
else if (!CHROMIUM_EXE) unavailableReason = 'chromium executable could not be resolved (run: npx playwright install chromium)';
else if (!fs.existsSync(CHROMIUM_EXE)) unavailableReason = `chromium browser not installed at ${CHROMIUM_EXE} (run: npx playwright install chromium)`;

const PAGE = [
  '<!doctype html><html lang="en" data-fix="1"><head><meta charset="utf-8"><title>stability fixture</title></head>',
  '<body><main><h1>Fixture</h1><p class="notice">Local prototype — not a released catalog.</p>',
  '<p id="boot-status" role="status">started</p><h2>Section</h2><dl><dt>A</dt><dd>B</dd></dl></main>',
  "<script>document.documentElement.dataset.catalogShell='started';</script>",
  '</body></html>'
].join('');

// Scenario server. Every request is recorded server-side WHEN ITS RESPONSE IS COMPLETE (readiness must
// observe completion, not arrival — a slow in-flight response is not a settled page); /missing.js answers
// 404; /slow.js answers after `slowMs`; /hold never answers.
function startServer({ slowMs = 0 } = {}) {
  const log = [];
  const pending = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    log.push({ event: 'request', path: url.pathname, status: null });
    const record = (status) => log.push({ event: 'response', path: url.pathname, status });
    if (url.pathname === '/hold') { pending.push(response); return; }
    if (url.pathname === '/missing.js') {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      record(404);
      return;
    }
    const body = url.pathname === '/slow.js' ? 'window.__slowLoaded = true;' : PAGE;
    const send = () => {
      response.writeHead(200, { 'content-type': url.pathname.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
      record(200);
    };
    if (url.pathname === '/slow.js' && slowMs > 0) setTimeout(send, slowMs); else send();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, log, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => {
      for (const response of pending) { try { response.destroy(); } catch { /* already gone */ } }
      server.close(done);
    }) });
  }));
}

async function launch() {
  if (!chromium || !CHROMIUM_EXE) {
    // Strict CI mode reaches here only when a required chromium is unavailable: fail loudly, never skip.
    throw new Error(`R36H_REQUIRED_COVERAGE: ${unavailableReason || 'chromium unavailable'}`);
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-r2-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: CHROMIUM_EXE,
    headless: true,
    timeout: 30000,
    viewport: { width: 1280, height: 900 },
    args: ['--no-first-run', '--disable-extensions', '--disable-sync']
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(30000);
  return {
    context,
    page,
    cleanup: async () => {
      try { await context.close(); } catch { /* already closed */ }
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  };
}

const skipReason = (timeout) => ({ skip: STRICT ? false : (unavailableReason || false), timeout });

test('1. repeated navigation runs settle deterministically', skipReason(120000), async () => {
  const server = await startServer();
  const session = await launch();
  try {
    for (let run = 1; run <= 5; run += 1) {
      const result = await navigateSettled(session.page, `${server.origin}/`, {
        serverLog: server.log,
        readyFlag: 'catalogShell',
        loadTimeoutMs: 30000,
        readyTimeoutMs: 10000,
        quietMs: 300,
        budgetMs: 10000
      });
      assert.equal(result.navigated, true, `run ${run} must navigate`);
      assert.equal(result.settle.settled, true, `run ${run} must reach observable request quiescence`);
    }
  } finally {
    await session.cleanup();
    await server.close();
  }
});

test('2. slow resources are waited for observably, not raced with a fixed sleep', skipReason(60000), async () => {
  const server = await startServer({ slowMs: 1500 });
  const session = await launch();
  try {
    await session.page.goto(`${server.origin}/?slow=1`, { waitUntil: 'load', timeout: 30000 });
    // Kick off the slow subresource AFTER load, which is exactly the favicon-after-load shape of B23.
    await session.page.evaluate(() => {
      const script = document.createElement('script');
      script.src = '/slow.js';
      document.head.append(script);
    });
    const settle = await waitForRequestsSettled(server.log, { quietMs: 500, budgetMs: 10000 });
    assert.equal(settle.settled, true);
    assert.ok(server.log.some((entry) => entry.path === '/slow.js'), 'the slow request is observed server-side before settling');
    // Observable confirmation that the slow resource executed — not a timing guess.
    await session.page.waitForFunction(() => window.__slowLoaded === true, null, { timeout: 5000 });
  } finally {
    await session.cleanup();
    await server.close();
  }
});

test('3. delayed service startup: navigation succeeds once the service is actually up', skipReason(60000), async () => {
  const session = await launch();
  let server = null;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500)); // service starts late
    server = await startServer();
    const result = await navigateSettled(session.page, `${server.origin}/`, {
      serverLog: server.log,
      readyFlag: 'catalogShell',
      quietMs: 300,
      budgetMs: 10000
    });
    assert.equal(result.navigated, true);
    assert.equal(result.settle.settled, true);
  } finally {
    await session.cleanup();
    if (server) await server.close();
  }
});

test('4. navigation errors reject explicitly instead of hanging or passing', skipReason(60000), async () => {
  const server = await startServer();
  const deadPort = server.origin;
  await server.close(); // nothing listens on the port now
  const session = await launch();
  try {
    await assert.rejects(
      () => session.page.goto(`${deadPort}/`, { waitUntil: 'load', timeout: 10000 }),
      (error) => {
        assert.match(String(error.message), /net::|ERR_|Timeout|closed/i, 'the failure is an explicit network-level error');
        return true;
      }
    );
  } finally {
    await session.cleanup();
  }
});

test('5. missing resources are observed server-side and attributed, not hidden', skipReason(60000), async () => {
  const server = await startServer();
  const session = await launch();
  try {
    await session.page.goto(`${server.origin}/`, { waitUntil: 'load', timeout: 30000 });
    await session.page.evaluate(() => {
      const script = document.createElement('script');
      script.src = '/missing.js';
      document.head.append(script);
    });
    const settle = await waitForRequestsSettled(server.log, { quietMs: 400, budgetMs: 10000 });
    assert.equal(settle.settled, true);
    const missing = server.log.filter((entry) => entry.event === 'response' && entry.path === '/missing.js');
    assert.equal(missing.length, 1, 'the missing resource is recorded exactly once');
    assert.equal(missing[0].status, 404, 'the 404 has a URL and a status server-side');
  } finally {
    await session.cleanup();
    await server.close();
  }
});

test('6. readiness budget expiry is an explicit named failure, not a silently raised timeout', skipReason(60000), async () => {
  const server = await startServer();
  const session = await launch();
  try {
    await session.page.goto(`${server.origin}/`, { waitUntil: 'load', timeout: 30000 });
    // A page that requests forever: the quiescence condition can never hold.
    await session.page.evaluate(() => {
      setInterval(() => fetch('/endless-ping').catch(() => {}), 50);
    });
    await assert.rejects(
      () => waitForRequestsSettled(server.log, { quietMs: 200, budgetMs: 1500 }),
      (error) => {
        assert.match(String(error.message), /R37H_READINESS_TIMEOUT/);
        return true;
      }
    );
  } finally {
    await session.cleanup();
    await server.close();
  }
});

test('7. browser shutdown during navigation tears down cleanly without hanging', skipReason(60000), async () => {
  const server = await startServer();
  const session = await launch();
  try {
    // /hold never answers: navigation is in flight when the browser is shut down mid-navigation.
    const pending = session.page.goto(`${server.origin}/hold`, { waitUntil: 'load', timeout: 30000 })
      .then(() => 'resolved', (error) => `rejected:${String(error?.message ?? error).slice(0, 80)}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await session.context.close(); // external-style shutdown while navigation is pending
    const outcome = await pending;
    assert.ok(
      outcome === 'resolved' || outcome.startsWith('rejected:'),
      `navigation must settle deterministically after shutdown, saw ${outcome}`
    );
    // Teardown must be complete: a second close is a harmless no-op and the profile cleanup runs.
    await session.cleanup();
  } finally {
    await session.cleanup();
    await server.close();
  }
});
