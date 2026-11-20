/**
 * Research rate control.
 *
 * The approved Semantic Scholar key allows one request per second *cumulatively*,
 * so a per-instance delay is not enough: several Worker isolates would each
 * honour their own spacing and still exceed the limit. This module therefore
 * separates the two concerns:
 *
 *   * `createSharedCoordinator` is the authority. It serialises reservations and
 *     hands out the next permitted dispatch time from state that lives outside
 *     any single request (a Durable Object's storage in production, an object in
 *     tests).
 *   * `createCoordinatedLimiter` is the client. It asks the coordinator how long
 *     to wait and then waits — it never decides spacing for itself.
 *
 * Spacing defaults to 1200 ms, deliberately above the 1000 ms contractual limit.
 */

export const MIN_REQUEST_SPACING_MS = 1200;
export const COORDINATOR_STATE_KEY = 'research:nextAllowedAt';

/** Serialise async work so reservations cannot interleave. */
function createSerialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

/**
 * Shared coordinator over a key/value store.
 *
 * @param {object} options
 * @param {{get: (key: string) => Promise<any>, put: (key: string, value: any) => Promise<void>}} options.state
 * @param {() => number} [options.now]
 * @param {number} [options.minimumSpacingMs]
 * @returns {{reserve: () => Promise<{waitMs: number, dispatchAt: number}>, peek: () => Promise<number>}}
 */
export function createSharedCoordinator({
  state,
  now = () => Date.now(),
  minimumSpacingMs = MIN_REQUEST_SPACING_MS
} = {}) {
  if (!state || typeof state.get !== 'function' || typeof state.put !== 'function') {
    throw new Error('coordinator requires state.get and state.put');
  }
  if (!Number.isFinite(minimumSpacingMs) || minimumSpacingMs < 1000) {
    throw new Error('minimumSpacingMs must be at least 1000');
  }
  const serialise = createSerialQueue();

  const reserveOnce = async () => {
    const stored = Number((await state.get(COORDINATOR_STATE_KEY)) ?? 0);
    const current = now();
    const dispatchAt = Math.max(current, Number.isFinite(stored) ? stored : 0);
    await state.put(COORDINATOR_STATE_KEY, dispatchAt + minimumSpacingMs);
    return { waitMs: Math.max(0, dispatchAt - current), dispatchAt };
  };

  return {
    reserve: () => serialise(reserveOnce),
    peek: async () => Number((await state.get(COORDINATOR_STATE_KEY)) ?? 0)
  };
}

/** In-memory state store with the same shape as Durable Object storage. */
export function createMemoryState(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    async get(key) {
      return data.has(key) ? data.get(key) : undefined;
    },
    async put(key, value) {
      data.set(key, value);
    },
    async delete(key) {
      data.delete(key);
    },
    snapshot() {
      return Object.fromEntries(data.entries());
    }
  };
}

/**
 * Client limiter bound to a coordinator.
 *
 * @param {object} options
 * @param {{reserve: () => Promise<{waitMs: number, dispatchAt: number}>}} options.coordinator
 * @param {(ms: number) => Promise<void>} [options.wait]
 * @param {() => number} [options.now]
 * @returns {{acquire: () => Promise<object>, stats: object}}
 */
export function createCoordinatedLimiter({ coordinator, wait = null, now = () => Date.now() } = {}) {
  if (!coordinator || typeof coordinator.reserve !== 'function') {
    throw new Error('limiter requires a coordinator');
  }
  const sleep = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const stats = { acquired: 0, totalWaitedMs: 0, dispatchTimes: [] };

  return {
    async acquire() {
      const reservation = await coordinator.reserve();
      if (reservation.waitMs > 0) await sleep(reservation.waitMs);
      stats.acquired += 1;
      stats.totalWaitedMs += reservation.waitMs;
      const dispatchedAt = now();
      stats.dispatchTimes.push(dispatchedAt);
      return { waitedMs: reservation.waitMs, dispatchedAt, dispatchAt: reservation.dispatchAt };
    },
    stats
  };
}

/** Smallest gap between consecutive dispatch times, for assertions and logs. */
export function minimumObservedSpacing(dispatchTimes) {
  if (!Array.isArray(dispatchTimes) || dispatchTimes.length < 2) return null;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < dispatchTimes.length; i += 1) min = Math.min(min, dispatchTimes[i] - dispatchTimes[i - 1]);
  return Number.isFinite(min) ? min : null;
}
