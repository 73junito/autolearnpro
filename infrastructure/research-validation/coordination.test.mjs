import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedCoordinator, createMemoryState, createCoordinatedLimiter } from './lib/research-rate-limiter.mjs';
import { createSemanticScholarClient } from './lib/semantic-scholar.mjs';

const SPACING_MS = 3000;
test('two API consumers sharing one coordinator reserve globally spaced slots across endpoints', async () => {
  let clock = 1_000_000;
  const reserved = [];
  const shared = createSharedCoordinator({
    state: createMemoryState(),
    now: () => clock,
    minimumSpacingMs: SPACING_MS
  });
  // Every client receives a distinct limiter; both use the same shared authority.
  const limiterA = createCoordinatedLimiter({
    coordinator: shared, now: () => clock,
    wait: async ms => { /* virtual clock is not used to infer reservations */ }
  });
  const limiterB = createCoordinatedLimiter({
    coordinator: shared, now: () => clock,
    wait: async ms => {}
  });
  const [a, b, c] = await Promise.all([
    limiterA.acquire(), limiterB.acquire(), limiterA.acquire()
  ]);
  reserved.push(a.dispatchAt, b.dispatchAt, c.dispatchAt);
  // A virtual clock is intentionally stationary. Verify assigned slots, not
  // simulated dispatch timestamps, because timers must not be faked in production.
  const slots = [a.dispatchAt, b.dispatchAt, c.dispatchAt].sort((x,y)=>x-y);
  assert.deepEqual(slots, [clock, clock + SPACING_MS, clock + SPACING_MS * 2]);
  assert(SPACING_MS > 1000);
});

test('live validator requires no retry and cannot make a second request after 429', async () => {
  let calls = 0;
  const coordinator = createSharedCoordinator({
    state: createMemoryState(), minimumSpacingMs: SPACING_MS
  });
  const client = createSemanticScholarClient({
    apiKey: 'FAKE_TEST_ONLY',
    limiter: createCoordinatedLimiter({ coordinator }),
    maxRetries: 0,
    fetchImpl: async () => { calls++; return new Response('', { status: 429 }); }
  });
  const result = await client.searchPapers({ query: 'test', limit: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'rate_limited');
  assert.equal(calls, 1);
});
