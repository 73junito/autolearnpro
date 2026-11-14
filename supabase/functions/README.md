# `supabase/functions` — reserved (no edge functions)

**Status: reserved scaffold directory. No functions, no deployed endpoints.**

## Intended responsibility

Supabase Edge Functions (Deno runtime), for server-side work that must run close to the database and
cannot be expressed as SQL policy alone.

## Why this file exists

Git does not track empty directories. `infrastructure/scripts/validate-foundation.mjs` requires this
path, so without tracked content a clean checkout fails validation — observed in C3-R25 as 7 of 13
required paths missing from a fresh worktree. This README is the minimum tracked content that makes the
validated scaffold reproducible.

## Before adding a function here

- Secret handling: Edge Functions read credentials from the platform environment. No service-role key,
  JWT secret or connection string may appear in this directory, in a test, or in a workflow file.
- Authorization: a function that bypasses row-level security is a security boundary change, not a
  convenience. It needs review, and the reason must be recorded.
- Deployment: creating a function here does not deploy it. This repository's Cloudflare workflow is
  validation-only and its deployment job is disabled; no Supabase deployment is authorized from this
  branch.

Creating a new directory under this path is enough to make a function appear to exist to
`supabase functions deploy`. Treat adding one as a deliberate act.
