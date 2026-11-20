/**
 * Semantic Scholar adapter.
 *
 * Uses the official Academic Graph API. No page is ever scraped.
 *
 * Security rules encoded here:
 *   * the API key is read from the caller's config (a server-side secret binding)
 *     and never appears in a URL, a cache key, an error message or a log line;
 *   * requests carry the key only in the `x-api-key` header;
 *   * a missing key refuses to make any request at all;
 *   * only the approved metadata projection is returned.
 *
 * Behaviour under pressure:
 *   * every request waits on a shared rate limiter (one request/second globally);
 *   * bounded retries with backoff for 429 and 5xx, honouring `Retry-After`;
 *   * a hard timeout per attempt;
 *   * classified errors so the caller can respond with the right status.
 */

import { projectMetadata, withheldKeysPresent } from './research-contract.mjs';

export const SEMANTIC_SCHOLAR_BASE_URL = 'https://api.semanticscholar.org/graph/v1';

/** Fields requested upstream: metadata only, no abstract, no tldr, no PDFs. */
export const SEARCH_FIELDS = 'paperId,title,authors,year,venue,externalIds,citationCount,url';
export const PAPER_FIELDS = SEARCH_FIELDS;

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_RETRIES = 2;
export const MAX_SEARCH_LIMIT = 20;

/** Error classification; callers map `status` onto their own responses. */
export const ERROR_CODES = Object.freeze({
  missing_api_key: { status: 503, retryable: false },
  rate_limited: { status: 429, retryable: true },
  upstream_error: { status: 502, retryable: true },
  timeout: { status: 504, retryable: true },
  not_found: { status: 404, retryable: false },
  unauthorized_upstream: { status: 502, retryable: false },
  invalid_request: { status: 400, retryable: false },
  network_error: { status: 502, retryable: true }
});

const failure = (code) => ({
  ok: false,
  code,
  status: ERROR_CODES[code].status,
  retryable: ERROR_CODES[code].retryable,
  results: null,
  paper: null,
  detail: null
});

/** Parse a Retry-After header supplied in seconds or as an HTTP date. */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

/** True when a string contains the secret; used by tests and log guards. */
export function leaksSecret(text, secret) {
  if (typeof text !== 'string' || typeof secret !== 'string' || secret.length === 0) return false;
  return text.includes(secret);
}

/** Project upstream papers onto the approved metadata fields. */
function projectPapers(papers) {
  const projected = [];
  for (const paper of Array.isArray(papers) ? papers : []) {
    const metadata = projectMetadata(paper);
    if (!metadata) continue;
    if (withheldKeysPresent(metadata).length > 0) continue;
    projected.push(metadata);
  }
  return projected;
}

/**
 * Create a client bound to a server-side secret.
 *
 * @param {object} options
 * @param {string} options.apiKey server-side secret; never logged or serialised
 * @param {{acquire: () => Promise<object>}} options.limiter shared rate limiter
 * @param {object} [options.cache] research cache
 * @param {typeof fetch} [options.fetchImpl]
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.wait]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @param {string} [options.baseUrl]
 */
export function createSemanticScholarClient({
  apiKey,
  limiter,
  cache = null,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  baseUrl = SEMANTIC_SCHOLAR_BASE_URL
} = {}) {
  const stats = { requests: 0, retries: 0, failures: 0, cacheHits: 0 };

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return {
      configured: false,
      searchPapers: async () => failure('missing_api_key'),
      getPaper: async () => failure('missing_api_key'),
      stats
    };
  }
  if (!limiter || typeof limiter.acquire !== 'function') throw new Error('createSemanticScholarClient requires a limiter');
  if (typeof fetchImpl !== 'function') throw new Error('createSemanticScholarClient requires fetch');

  /** One HTTP attempt. The key appears only in the x-api-key header. */
  const attempt = async (url) => {
    await limiter.acquire();
    stats.requests += 1;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        signal: controller?.signal
      });
      if (timer) clearTimeout(timer);
      return { status: response.status, response };
    } catch (error) {
      if (timer) clearTimeout(timer);
      return { status: error?.name === 'AbortError' ? -1 : -2, response: null };
    }
  };

  /** One logical request with bounded retries. */
  const request = async (url, { allowNotFound = false } = {}) => {
    let index = 0;
    let last = null;

    while (index <= maxRetries) {
      const { status, response } = await attempt(url);

      if (status === -1) return failure('timeout');
      if (status === -2) {
        last = failure('network_error');
      } else if (status === 200) {
        try {
          return { ok: true, code: null, status: 200, results: null, paper: null, detail: null, payload: await response.json() };
        } catch {
          stats.failures += 1;
          return failure('upstream_error');
        }
      } else if (status === 404) {
        if (allowNotFound) return { ok: true, code: null, status: 404, results: [], paper: null, detail: null, payload: null };
        return failure('not_found');
      } else if (status === 401 || status === 403) {
        stats.failures += 1;
        return failure('unauthorized_upstream');
      } else if (status === 429) {
        last = failure('rate_limited');
      } else if (status >= 500) {
        last = failure('upstream_error');
      } else {
        stats.failures += 1;
        return failure('invalid_request');
      }

      index += 1;
      if (index > maxRetries) break;
      stats.retries += 1;
      const retryAfter = parseRetryAfter(response?.headers?.get?.('retry-after') ?? null, now());
      await wait(retryAfter ?? Math.min(600 * 2 ** index, 8000));
    }

    stats.failures += 1;
    return last ?? failure('upstream_error');
  };

  const searchPapers = async ({ query, limit = 10 } = {}) => {
    const cleanQuery = typeof query === 'string' ? query.trim() : '';
    if (cleanQuery.length === 0 || cleanQuery.length > 200) return failure('invalid_request');
    const safeLimit = Math.min(Math.max(Number.isInteger(limit) ? limit : 10, 1), MAX_SEARCH_LIMIT);

    const perform = async () => {
      const url = `${baseUrl}/paper/search?query=${encodeURIComponent(cleanQuery)}&limit=${safeLimit}&fields=${SEARCH_FIELDS}`;
      const result = await request(url, { allowNotFound: true });
      if (!result.ok) return result;
      return {
        ok: true,
        code: null,
        status: 200,
        results: projectPapers(result.payload?.data),
        paper: null,
        detail: { total: result.payload?.total ?? null }
      };
    };

    if (!cache) return perform();
    const before = stats.requests;
    const value = await cache.wrap(`search:${cleanQuery.toLowerCase()}:${safeLimit}`, perform);
    if (stats.requests === before) stats.cacheHits += 1;
    return value;
  };

  const getPaper = async ({ paperId } = {}) => {
    if (typeof paperId !== 'string' || !/^[A-Za-z0-9._:-]{2,120}$/.test(paperId)) return failure('invalid_request');

    const perform = async () => {
      const url = `${baseUrl}/paper/${encodeURIComponent(paperId)}?fields=${PAPER_FIELDS}`;
      const result = await request(url);
      if (!result.ok) return result;
      const paper = projectMetadata(result.payload);
      if (!paper) return failure('not_found');
      return { ok: true, code: null, status: 200, results: null, paper, detail: null };
    };

    if (!cache) return perform();
    const before = stats.requests;
    const value = await cache.wrap(`paper:${paperId}`, perform);
    if (stats.requests === before) stats.cacheHits += 1;
    return value;
  };

  return { configured: true, searchPapers, getPaper, stats };
}
