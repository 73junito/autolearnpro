// C3-R37H remediation R5 (findings B14, B19, B20) — keyboard and focus behavior in a real browser.
//
// Acceptance behaviors exercised with real key events (never synthetic focus assignment):
//   - full keyboard navigation without a mouse (Tab traversal in DOM order, no keyboard trap)
//   - visible focus indicators (:focus-visible outline actually renders)
//   - Escape-key dismissal of the dismissible overlay
//   - correct focus restoration to the control that opened the overlay
//   - accessible status announcements (role=status live region updates)
//   - zero axe WCAG A/AA violations on the exercised page
//
// Cross-browser matrix: Chromium is executed here. Firefox and WebKit run as PENDING (skip with an explicit
// reason) on workstations where those browsers are not installed — the CI workflow carries the matrix. A
// channel whose executable IS provided via R36H_FIREFOX / R36H_WEBKIT is attempted, and a real failure there
// is a real failure, never a silent pass.
//
// Run with: node --test tests/c3-catalog-keyboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { navigateSettled } from '../docs/c3-r36h3/tools/navigation-readiness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const APP = path.join(root, 'apps', 'catalog');
const VITE_BIN = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const { resolvePlaywright, resolveAxe, resolveChannels, channelSkip, requireChannel, STRICT } = await import('./helpers/browser-resolution.mjs');
const AXE = resolveAxe();
const { module: pw, error: pwError } = resolvePlaywright();

// Channel availability. Strict CI mode turns a missing engine into a FAILURE (requireChannel); local runs
// record it as PENDING so developers without every browser still get a useful subset. The concrete executable
// comes from an env override or playwright-core's own executablePath() (populated by `npx playwright install`).
const CHANNELS = resolveChannels(pw);
// CI matrix jobs select exactly one engine via R36H_ENGINE so a Firefox job does not fail on absent Chromium.
const ONLY_ENGINE = process.env.R36H_ENGINE || null;
const SELECTED_CHANNELS = ONLY_ENGINE ? CHANNELS.filter((channel) => channel.engine === ONLY_ENGINE) : CHANNELS;

// Build the catalog into an isolated temporary copy so this suite never races other suites over
// apps/catalog/dist and never writes inside the reviewed app tree.
function buildFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-keyboard-app-'));
  fs.mkdirSync(path.join(dir, 'src'));
  for (const [from, to] of [
    ['index.html', 'index.html'],
    ['vite.config.js', 'vite.config.js'],
    ['package.json', 'package.json'],
    [path.join('src', 'main.js'), path.join('src', 'main.js')]
  ]) {
    fs.copyFileSync(path.join(APP, from), path.join(dir, to));
  }
  if (!fs.existsSync(VITE_BIN)) return { dir, dist: null, reason: 'vite is not installed at the root; run npm ci first' };
  // Junction the workspace node_modules so vite's config loader can resolve 'vite' from the isolated copy.
  // The junction points INSIDE the authorized project root (the worktree), never outside it.
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction');
  execFileSync(process.execPath, [VITE_BIN, 'build', '--logLevel', 'warn'], { cwd: dir, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] });
  return { dir, dist: path.join(dir, 'dist'), reason: null };
}

function serve(rootDir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
    const target = path.join(rootDir, ...relative.split('/'));
    if (!target.startsWith(rootDir) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(fs.readFileSync(target));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

const activeId = (page) => page.evaluate(() => {
  const node = document.activeElement;
  return node && node.id ? node.id : `(none:${node ? node.tagName : 'null'})`;
});

async function runKeyboardScenario(page, origin, serverLog) {
  await navigateSettled(page, `${origin}/`, { serverLog, readyFlag: 'catalogShell', quietMs: 300, budgetMs: 10000 });

  // 1. Tab reaches the trigger; 2. the focus indicator is actually rendered.
  await page.keyboard.press('Tab');
  assert.equal(await activeId(page), 'about-open', 'Tab moves focus to the overlay trigger');
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  assert.notEqual(outline.style, 'none', `focus indicator must be visible, saw outline ${JSON.stringify(outline)}`);

  // 3. Enter opens the overlay; focus moves into it.
  await page.keyboard.press('Enter');
  let state = await page.evaluate(() => ({
    hidden: document.getElementById('about-panel').hidden,
    expanded: document.getElementById('about-open').getAttribute('aria-expanded'),
    active: document.activeElement?.id
  }));
  assert.equal(state.hidden, false, 'Enter opens the overlay');
  assert.equal(state.expanded, 'true', 'aria-expanded reflects the open state');
  assert.equal(state.active, 'about-close', 'focus moves to the dismiss control');

  // 4. The status region announces the state change.
  const announced = await page.evaluate(() => {
    const live = document.getElementById('about-live');
    return { role: live?.getAttribute('role'), text: live?.textContent.trim() };
  });
  assert.equal(announced.role, 'status', 'announcements go through a role=status live region');
  assert.match(announced.text ?? '', /opened/i);

  // 5. Escape dismisses and restores focus to the opener.
  await page.keyboard.press('Escape');
  state = await page.evaluate(() => ({
    hidden: document.getElementById('about-panel').hidden,
    expanded: document.getElementById('about-open').getAttribute('aria-expanded'),
    active: document.activeElement?.id
  }));
  assert.equal(state.hidden, true, 'Escape dismisses the overlay');
  assert.equal(state.expanded, 'false');
  assert.equal(state.active, 'about-open', 'focus returns to the control that opened the overlay');

  // 6. Space re-opens with focus moved into the overlay; the dismiss button closes by keyboard and focus is
  // restored again.
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => document.getElementById('about-panel').hidden), false, 'Space opens the overlay');
  assert.equal(await activeId(page), 'about-close', 'focus moves into the overlay on open');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.getElementById('about-panel').hidden), true);
  assert.equal(await activeId(page), 'about-open', 'focus is restored after keyboard dismissal');

  // 7. No keyboard trap: repeated Tab always moves focus and cycles through the controls.
  const seen = new Set();
  for (let step = 0; step < 4; step += 1) {
    const before = await activeId(page);
    await page.keyboard.press('Tab');
    const after = await activeId(page);
    assert.notEqual(after, before, 'focus must always move on Tab — no keyboard trap');
    seen.add(after);
  }
  assert.ok(seen.has('about-open'), 'the traversal cycles back through the trigger');

  // 8. axe-core: zero WCAG A/AA violations on the exercised page state.
  if (AXE && fs.existsSync(AXE)) {
    await page.addScriptTag({ path: AXE });
    const axeResult = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return result.violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
    });
    assert.deepEqual(axeResult, [], `axe reported violations: ${JSON.stringify(axeResult)}`);
  } else if (STRICT) {
    assert.fail('R36H_REQUIRED_COVERAGE: axe-core unavailable; accessibility check cannot run');
  }
}

for (const channel of SELECTED_CHANNELS) {
  const skip = channelSkip(channel, pwError);

  test(`keyboard and focus behavior: ${channel.name}`, { skip, timeout: 180000 }, async (t) => {
    requireChannel(channel, pwError);
    const fixture = buildFixture();
    let browser = null;
    let server = null;
    try {
      if (!fixture.dist) {
        if (STRICT) assert.fail(`${channel.name}: ${fixture.reason}`);
        t.skip(fixture.reason);
        return;
      }
      server = await serve(fixture.dist);
      browser = await pw[channel.engine].launch({
        executablePath: channel.executable,
        headless: true,
        timeout: 30000,
        args: ['--no-first-run', '--disable-extensions', '--disable-sync']
      });
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const serverLog = [];
      try {
        await runKeyboardScenario(page, server.origin, serverLog);
      } finally {
        await context.close();
      }
    } finally {
      if (browser) { try { await browser.close(); } catch { /* already closed */ } }
      if (server) await new Promise((resolve) => server.server.close(resolve));
      try { fs.rmdirSync(path.join(fixture.dir, 'node_modules')); } catch { try { fs.unlinkSync(path.join(fixture.dir, 'node_modules')); } catch { /* junction may be gone */ } }
      try { fs.rmSync(fixture.dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  });
}
