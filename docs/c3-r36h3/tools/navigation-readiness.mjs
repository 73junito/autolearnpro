// C3-R37H remediation R2 (finding B23) — observable page-readiness conditions for browser automation.
//
// WHY THIS EXISTS (finding B23): the browser gate settled the page with a fixed `waitForTimeout(750)` sleep
// because Chrome requests /favicon.ico AFTER the load event and the gate evaluated console errors before that
// request could arrive. A fixed sleep is a race with a constant: it fails intermittently on slower machines and
// wastes time on faster ones. The rule replaced by this module is simple:
//
//   NEVER sleep for a guessed duration. Wait for an observable condition, with an explicit budget, and fail
//   loudly when the budget expires. A timeout is a reported outcome, never a silently relaxed assertion.
//
// The condition implemented here is request quiescence measured from the SERVER side: the local static server
// records every request it answers (including browser-initiated ones invisible to page.on('request')), so "no
// new server requests for `quietMs` within `budgetMs`" is a directly observable statement about the world.
export const READINESS_SCHEMA = 'alp-c3-navigation-readiness-v1';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// In-flight accounting: entries carrying `event: 'request'` open a request that `event: 'response'` closes.
// Entries without an `event` field are synchronous single-event records and count as already completed.
function countInflight(serverLog) {
  let inflight = 0;
  for (const entry of serverLog) {
    if (entry && entry.event === 'request') inflight += 1;
    else if (entry && entry.event === 'response') inflight -= 1;
  }
  return inflight;
}

/**
 * Wait until the server-side request log has been quiet for `quietMs` AND no request is in flight, within a
 * hard `budgetMs` budget. Returns { settled: true, waitedMs, requests, quietMs, budgetMs } on success.
 * Throws Error('R37H_READINESS_TIMEOUT:...') when the budget expires — an explicit, reported failure.
 */
export async function waitForRequestsSettled(serverLog, { quietMs = 400, budgetMs = 10000, pollMs = 50 } = {}) {
  if (!Array.isArray(serverLog)) throw Error('R37H_READINESS_BAD_LOG:serverLog must be an array');
  const startedAt = Date.now();
  let lastCount = serverLog.length;
  let quietSince = Date.now();
  for (;;) {
    await sleep(pollMs);
    const count = serverLog.length;
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    }
    const now = Date.now();
    const inflight = countInflight(serverLog);
    if (inflight <= 0 && now - quietSince >= quietMs) {
      return Object.freeze({ settled: true, waitedMs: now - startedAt, requests: count, quietMs, budgetMs });
    }
    if (now - startedAt > budgetMs) {
      throw Error(`R37H_READINESS_TIMEOUT:requests did not settle (${inflight} in flight, ${count} events) within ${budgetMs}ms`);
    }
  }
}

/**
 * Full navigation-readiness: goto with an explicit timeout, wait for the application's own ready flag, then
 * wait for request quiescence. Every wait has a named budget; no step sleeps for a fixed guess.
 */
export async function navigateSettled(page, url, { serverLog, readySelector = null, readyFlag = null, loadTimeoutMs = 30000, readyTimeoutMs = 10000, quietMs = 400, budgetMs = 10000 } = {}) {
  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: loadTimeoutMs });
  if (readyFlag) {
    await page.waitForFunction(
      (flag) => document.documentElement.dataset[flag] === 'started',
      readyFlag,
      { timeout: readyTimeoutMs }
    );
  }
  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: readyTimeoutMs });
  }
  const settle = await waitForRequestsSettled(serverLog, { quietMs, budgetMs });
  return Object.freeze({ navigated: true, totalMs: Date.now() - startedAt, settle });
}
