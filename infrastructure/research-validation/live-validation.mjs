// Intentionally disabled: direct GitHub Actions/API-key requests cannot share
// the Durable Object reservation budget used by autolearnpro-api-staging.
// Use the private Cloudflare Worker service binding for authenticated E2E
// validation after all consumers of this key are coordinated.
// No upstream HTTP requests are permitted from this standalone runner.
console.error('RESULT=BLOCKED_UNCOORDINATED_DIRECT_PROVIDER_ACCESS');
process.exitCode = 2;
