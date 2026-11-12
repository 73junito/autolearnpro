import assert from 'node:assert/strict';
import { createSemanticScholarClient, SEARCH_FIELDS } from './lib/semantic-scholar.mjs';
import { createSharedCoordinator, createMemoryState, createCoordinatedLimiter } from './lib/research-rate-limiter.mjs';
import { withheldKeysPresent } from './lib/research-contract.mjs';

const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
if (typeof key !== 'string' || !key.trim()) {
  console.error('RESULT=BLOCKED_MISSING_SECRET');
  process.exit(2);
}
// Do not print the key or any upstream response body.
assert(!SEARCH_FIELDS.includes('abstract') && !SEARCH_FIELDS.includes('openAccessPdf'));
// Conservative spacing below the 1 request/second key-wide ceiling.
// This isolated runner cannot coordinate with other services sharing the same key.
// Do not run it concurrently with any other Semantic Scholar consumer.
const coordinator = createSharedCoordinator({
  state: createMemoryState(),
  minimumSpacingMs: 3000
});
const limiter = createCoordinatedLimiter({ coordinator });
const client = createSemanticScholarClient({
  apiKey: key, limiter, timeoutMs: 15000, maxRetries: 0
});
assert.equal(client.configured, true);
function checkResult(result, name) {
  console.log(name + '_STATUS=' + result.status);
  console.log(name + '_CODE=' + (result.code ?? 'ok'));
  if (!result.ok) throw new Error(name + ' unsuccessful: ' + result.code);
}
try {
  const search = await client.searchPapers({ query: 'automotive brake diagnostics', limit: 3 });
  checkResult(search, 'SEARCH');
  assert(Array.isArray(search.results) && search.results.length > 0, 'No papers returned');
  for (const paper of search.results) {
    assert.deepEqual(withheldKeysPresent(paper), []);
    assert(typeof paper.paperId === 'string' && paper.paperId.length > 1);
  }
  const lookup = await client.getPaper({ paperId: search.results[0].paperId });
  checkResult(lookup, 'LOOKUP');
  assert(lookup.paper && lookup.paper.paperId === search.results[0].paperId);
  assert.deepEqual(withheldKeysPresent(lookup.paper), []);
  console.log('RESULT=PASS');
  console.log('REQUESTS=' + client.stats.requests);
} catch (error) {
  // Deliberately no exception stack or upstream payload in CI logs.
  console.error('RESULT=FAIL');
  console.error('NOTE=HTTP_429_REQUIRES_KEY_WIDE_COORDINATION_OR_PROVIDER_QUOTA_CHECK');
  console.error('FAILURE=' + (error?.message?.split(':')[0] || 'validation_error'));
  process.exitCode = 1;
}
