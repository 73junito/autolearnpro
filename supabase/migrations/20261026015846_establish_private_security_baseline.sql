-- Foundation 6: safe to run on new isolated PostgreSQL development database.
-- No Supabase-managed auth/storage schemas, extension requirements, or exposed tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS alp_private;
REVOKE ALL ON SCHEMA alp_private FROM PUBLIC;
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA alp_private FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA alp_private FROM authenticated';
  END IF;
END
$block$;
CREATE TABLE IF NOT EXISTS alp_private.foundation_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name text NOT NULL CHECK (length(event_name) BETWEEN 1 AND 100),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alp_private.foundation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.foundation_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA alp_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA alp_private FROM PUBLIC;
DO $block$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA alp_private FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA alp_private FROM %I',role_name);
    END IF;
  END LOOP;
END
$block$;
ALTER DEFAULT PRIVILEGES IN SCHEMA alp_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA alp_private REVOKE ALL ON SEQUENCES FROM PUBLIC;
DO $block$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA alp_private REVOKE ALL ON TABLES FROM %I',role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA alp_private REVOKE ALL ON SEQUENCES FROM %I',role_name);
    END IF;
  END LOOP;
END
$block$;
COMMIT;
