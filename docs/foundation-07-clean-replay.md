# Foundation 7 — Clean local migration replay

Using the isolated local Supabase CLI configuration from `F:\autolearnpro`, verified that `auth.users`, `public.alp_profiles`, and `alp_private.alp_role_assignments` each contained zero rows before executing `supabase db reset --local --no-seed --yes`.

The local-only CLI reset completed successfully. It applied migrations `20261026015452`, `20261026015846`, and `20261026020917` in order. `supabase migration list --local` verified all three recorded locally.

Reran `tests/foundation-07-rls.sql` against the rebuilt database: `FOUNDATION_07_RLS_TRANSACTION_PASSED`. The two test identities and all profile inserts were rolled back. Final users count 0; profiles count 0.

Remaining: end-to-end sign-in/JWT API tests and attempts to change `user_id`, elevation and server-only role management. This local validation does not authorize cloud deployment. No remote Supabase project was reset or modified.
