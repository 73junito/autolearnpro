-- R1 work in progress: additive, non-activated execution-role foundation.
-- This migration deliberately grants NO academic table, private function,
-- or login privileges. Do not enable the role in the API until a follow-up
-- policy/grants migration passes isolated integration tests.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alp_academic_executor') THEN
    CREATE ROLE alp_academic_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'alp_academic_executor' AND (rolbypassrls OR rolcanlogin OR rolsuper)) THEN
    RAISE EXCEPTION 'unsafe academic execution role attributes';
  END IF;
END
$$;
-- No GRANTs are intentional. API remains on existing behavior during review.
COMMIT;
