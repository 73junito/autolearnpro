# Foundation 7 — local Auth JWT and REST API security validation

Ran `tests/foundation-07-auth-api.ps1` against the isolated local Supabase stack (`127.0.0.1:55121`). Test script fetches local public API key at runtime; neither token nor secret values are printed or saved. It creates two uniquely named disposable local Auth accounts and deletes them in `finally`.

## Verified
- Two email/password sign-ups each returned an Auth-issued JWT.
- User A created and read their own profile. User B saw no profile rows owned by A.
- User B could not create a profile claiming A's identity (HTTP 403).
- User A could not access the private role-assignment API (HTTP 404).
- User A could not change their profile `user_id` (HTTP 403).
- User A could update their own `display_name`.
- Both local test accounts were deleted; no cloud Auth or application data was touched.

## Limitations

This is an isolated local integration test, not a cloud deployment or production authentication audit. Future scenarios include expired/revoked JWT behavior, privilege escalation workflows, storage ACLs, instructor and administrator resource scoping, and multi-user concurrency. Local development API endpoints are not suitable for public network exposure.
