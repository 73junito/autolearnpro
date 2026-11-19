# Foundation 7 — post-replay live verification and sign-out revocation

Following successful clean seven-migration replay, `npm run test:approval:live` passed two end-to-end local Auth/database tests: actual approval lifecycle and shared cross-connection rate limit. A separate local sign-out/revocation integration test also passed: a user token succeeded on a role-request endpoint before logout and was rejected with HTTP 401 after `POST /auth/v1/logout` returned HTTP 204.

`tests/role-session-revocation-live.test.mjs` recreates this scenario with a disposable local user, removes the resulting requests and quota rows, and is included in the opt-in live integration test command. No public credentials are saved or printed.

This demonstrates local sign-out behavior for the tested token, not comprehensive revoked-session guarantees under every Supabase version, global sign-out, token expiry, concurrent requests, or real deployment topology. Security event alerting and stronger administrator approval remain release blockers.
