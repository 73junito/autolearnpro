// R11 portable browser/accessibility dependency resolution (shared by the browser tests).
//
// Goals:
//   - Resolve one playwright-core module and one axe-core script portably (Windows/Linux), preferring explicit
//     env overrides, then the repo's own node_modules, then documented legacy local paths. No hardcoded
//     historical Windows staging path is required.
//   - Resolve a concrete executable per engine. With playwright-core, `pw[engine].executablePath()` returns the
//     path where `npx playwright install <engine>` places the browser; env overrides (R36H_BROWSER/_FIREFOX/
//     _WEBKIT) win when set.
//   - Strict CI mode (R36H_REQUIRE_BROWSERS=1): a missing module/browser/axe is a FAILURE, not a skip, so an
//     all-skipped matrix can never be recorded as success.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..');
export const STRICT = process.env.R36H_REQUIRE_BROWSERS === '1';
export const ENGINES = Object.freeze(['chromium', 'firefox', 'webkit']);

const LEGACY_PWCORE = ['f:/autolearnpro-meshy-staging/node_modules/playwright-core'];
const LEGACY_AXE = [
  'f:/autolearnpro-meshy-staging/node_modules/axe-core/axe.min.js',
  'F:/autolearnpro/meshy-studio/node_modules/axe-core/axe.min.js'
];

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Resolve a playwright-core module. Returns { module, source, error }. */
export function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.R36H_PWCORE,
    path.join(REPO_ROOT, 'node_modules', 'playwright-core'),
    ...LEGACY_PWCORE,
    'F:/autolearnpro/meshy-studio/node_modules/playwright-core' // local convenience (never required in CI)
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      if (mod && (mod.chromium || mod.firefox || mod.webkit)) return { module: mod, source: candidate, error: null };
      errors.push(`${candidate}: module has no browser launchers`);
    } catch (error) {
      errors.push(`${candidate}: ${String(error && error.message || error).slice(0, 120)}`);
    }
  }
  return { module: null, source: null, error: errors.join(' | ') };
}

/** Resolve the axe-core injected script path, or null. */
export function resolveAxe() {
  return firstExistingPath([
    process.env.R36H_AXE,
    path.join(REPO_ROOT, 'node_modules', 'axe-core', 'axe.min.js'),
    ...LEGACY_AXE
  ]);
}

/** Resolve a concrete executable path for one engine (env override wins; then Playwright's install path; then
 *  a system browser fallback for local convenience). Returns the first existing path, else the Playwright path. */
export function engineExecutable(pwModule, engine) {
  const envName = { chromium: 'R36H_BROWSER', firefox: 'R36H_FIREFOX', webkit: 'R36H_WEBKIT' }[engine];
  const envValue = process.env[envName];
  const systemFallback = {
    chromium: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
    firefox: ['C:/Program Files/Mozilla Firefox/firefox.exe', 'C:/Program Files (x86)/Mozilla Firefox/firefox.exe'],
    webkit: []
  }[engine] || [];
  let playwrightPath = null;
  try {
    const launcher = pwModule && pwModule[engine];
    if (launcher && typeof launcher.executablePath === 'function') playwrightPath = launcher.executablePath();
  } catch { /* fall through */ }
  const ordered = [envValue, playwrightPath, ...systemFallback].filter(Boolean);
  return firstExistingPath(ordered) || playwrightPath || null;
}

/**
 * Build the per-engine channel descriptors. Each: { engine, name, executable, pending }.
 * `pending` is a human reason the engine cannot run here (null when usable).
 */
export function resolveChannels(pwModule) {
  return ENGINES.map((engine) => {
    const candidate = pwModule ? engineExecutable(pwModule, engine) : null;
    const exists = Boolean(candidate) && fs.existsSync(candidate);
    let pending = null;
    if (!pwModule) pending = 'playwright-core module unavailable';
    else if (!candidate) pending = `${engine} executable could not be resolved (run: npx playwright install ${engine})`;
    else if (!exists) pending = `${engine} browser not installed at ${candidate} (run: npx playwright install ${engine})`;
    return { engine, name: engine, executable: exists ? candidate : null, pending };
  });
}

/**
 * Decide the node:test `skip` value for a channel. In non-strict mode a missing engine is skipped (local
 * convenience). In strict mode it is NOT skipped, so the test runs and must fail via requireChannel().
 */
export function channelSkip(channel, moduleError) {
  const reason = moduleError || channel.pending;
  if (!reason) return false;
  return STRICT ? false : reason;
}

/** Throw in strict mode when a required engine (or the module) is unavailable; no-op otherwise. */
export function requireChannel(channel, moduleError) {
  const reason = moduleError || channel.pending;
  if (STRICT && reason) {
    const error = new Error(`R36H_REQUIRED_COVERAGE: ${channel.engine} unavailable: ${reason}`);
    error.code = 'R36H_REQUIRED_COVERAGE';
    throw error;
  }
  return reason;
}
