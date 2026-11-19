# Foundation 7 — Local approval-request throttling

The server-side role approval handler now counts attempts by verified Supabase Auth user ID and limits the combined role-request and decision endpoints to six attempts per 60-second window per process. The seventh attempt responds with HTTP 429 and `Retry-After: 60`, before SQL executes. Invalid bearer tokens are rejected by Supabase Auth before actor-based throttling.

`tests/role-approval-rate-limit.test.mjs` confirms six requests can pass, the seventh is rejected, and no further database query is sent. The test is part of `npm test`.

**Not production rate limiting:** counters are process-local, reset on restart, and do not coordinate across servers. A durable shared limit (database/Redis/edge gateway), network-level anonymous request controls, operational logs, and abuse monitoring are mandatory before a public deployment. No cloud migration or GitHub push was performed.
