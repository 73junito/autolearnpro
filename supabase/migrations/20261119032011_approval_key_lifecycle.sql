-- D02-E-R3D: bounded HMAC key rotation, retiring overlap and emergency revoke.
-- Do not provision key material inside migration files.
BEGIN;

ALTER TABLE alp_private.alp_approval_attestation_keys
  DROP CONSTRAINT alp_approval_attestation_keys_key_id_check;
ALTER TABLE alp_private.alp_approval_attestation_keys
  ADD CONSTRAINT alp_approval_attestation_keys_key_id_check CHECK (key_id > 0),
  ADD COLUMN state text NOT NULL DEFAULT 'active',
  ADD COLUMN not_after timestamptz,
  ADD CONSTRAINT alp_approval_key_state_check CHECK (
    (state = 'active' AND not_after IS NULL)
    OR (state = 'retiring' AND not_after IS NOT NULL)
    OR state = 'revoked'
  );
-- At most one active key and one short-lived retiring key at a time.
CREATE UNIQUE INDEX alp_approval_one_active_key
  ON alp_private.alp_approval_attestation_keys ((1)) WHERE state = 'active';
CREATE UNIQUE INDEX alp_approval_one_retiring_key
  ON alp_private.alp_approval_attestation_keys ((1)) WHERE state = 'retiring';

-- Only the signed verifier's owner may replace its function.
-- Revoke the temporary schema CREATE permission before COMMIT.
GRANT CREATE ON SCHEMA alp_private TO service_role;
SET LOCAL ROLE service_role;

CREATE OR REPLACE FUNCTION alp_private.verify_approval_attestation(
  p_operation text, p_actor uuid, p_arguments text[],
  p_issued_at bigint, p_nonce uuid, p_signature text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  signed_text text;
  current_epoch bigint;
  key_valid boolean;
BEGIN
  IF p_actor IS NULL OR p_operation IS NULL OR p_arguments IS NULL
     OR p_issued_at IS NULL OR p_nonce IS NULL OR p_signature IS NULL
     OR p_signature !~ '^[0-9a-f]{64}$'
     OR EXISTS (SELECT 1 FROM unnest(p_arguments) AS a(value) WHERE value IS NULL) THEN
    RAISE EXCEPTION 'invalid approval attestation' USING ERRCODE='42501';
  END IF;

  current_epoch := extract(epoch FROM clock_timestamp())::bigint;
  IF p_issued_at < current_epoch - 60 OR p_issued_at > current_epoch + 15 THEN
    RAISE EXCEPTION 'expired approval attestation' USING ERRCODE='42501';
  END IF;

  SELECT string_agg(octet_length(convert_to(value,'UTF8'))::text || ':' || value,
                    '|' ORDER BY ord)
  INTO signed_text
  FROM unnest(ARRAY[p_operation, p_actor::text] || p_arguments ||
              ARRAY[p_issued_at::text, p_nonce::text])
       WITH ORDINALITY AS part(value,ord);

  SELECT EXISTS (
    SELECT 1 FROM alp_private.alp_approval_attestation_keys AS k
    WHERE (k.state = 'active' OR
           (k.state = 'retiring' AND k.not_after > clock_timestamp()))
      AND encode(extensions.hmac(convert_to(signed_text,'UTF8'),
                                  k.key_bytes,'sha256'),'hex') = p_signature
  ) INTO key_valid;
  IF NOT key_valid THEN
    RAISE EXCEPTION 'approval attestation mismatch or key revoked'
      USING ERRCODE='42501';
  END IF;

  INSERT INTO alp_private.alp_approval_used_nonces(nonce) VALUES(p_nonce)
  ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'replayed approval attestation' USING ERRCODE='42501';
  END IF;
END;
$$;

RESET ROLE;
REVOKE CREATE ON SCHEMA alp_private FROM service_role;

-- Ensure no new direct access to the private keys or verifier.
DO $check$
BEGIN
  IF has_table_privilege('alp_approval_executor',
       'alp_private.alp_approval_attestation_keys','SELECT')
     OR has_function_privilege('alp_approval_executor',
       'alp_private.verify_approval_attestation(text,uuid,text[],bigint,uuid,text)',
       'EXECUTE')
     OR has_schema_privilege('service_role','alp_private','CREATE')
  THEN
    RAISE EXCEPTION 'R3D boundary violation';
  END IF;
END;
$check$;

-- Privileged, parameterized administrative operations. Never store key bytes
-- in migration history, logs, source or audit rows.
CREATE TABLE alp_private.alp_approval_key_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event_type text NOT NULL CHECK (event_type IN ('rotate','revoke','emergency_revoke')),
  key_id integer,
  overlap_seconds integer,
  actor_role text NOT NULL DEFAULT session_user
);
REVOKE ALL ON alp_private.alp_approval_key_events FROM PUBLIC,anon,authenticated,
  service_role,alp_approval_executor,alp_approval_worker_login;
ALTER TABLE alp_private.alp_approval_key_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_approval_key_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION alp_private.rotate_approval_attestation_key(
  p_key_id integer, p_key bytea, p_overlap_seconds integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  previous_key integer;
BEGIN
  IF p_key_id IS NULL OR p_key_id <= 1 OR p_key IS NULL
     OR octet_length(p_key) <> 32
     OR p_overlap_seconds IS NULL OR p_overlap_seconds < 0 OR p_overlap_seconds > 60
  THEN
    RAISE EXCEPTION 'invalid key rotation parameters' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(720203, 4);
  UPDATE alp_private.alp_approval_attestation_keys
     SET state='revoked',not_after=clock_timestamp()
   WHERE state='retiring' AND not_after <= clock_timestamp();
  IF EXISTS (SELECT 1 FROM alp_private.alp_approval_attestation_keys
             WHERE state='retiring') THEN
    RAISE EXCEPTION 'rotation overlap still active' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM alp_private.alp_approval_attestation_keys
             WHERE key_id=p_key_id) THEN
    RAISE EXCEPTION 'key identifiers cannot be reused' USING ERRCODE='22023';
  END IF;
  SELECT key_id INTO previous_key
    FROM alp_private.alp_approval_attestation_keys WHERE state='active' FOR UPDATE;
  IF previous_key IS NOT NULL THEN
    UPDATE alp_private.alp_approval_attestation_keys
       SET state=CASE WHEN p_overlap_seconds=0 THEN 'revoked' ELSE 'retiring' END,
           not_after=clock_timestamp()+make_interval(secs=>p_overlap_seconds)
     WHERE key_id=previous_key;
  END IF;
  INSERT INTO alp_private.alp_approval_attestation_keys(key_id,key_bytes,state)
    VALUES(p_key_id,p_key,'active');
  INSERT INTO alp_private.alp_approval_key_events(event_type,key_id,overlap_seconds)
    VALUES('rotate',p_key_id,p_overlap_seconds);
END;
$$;

CREATE FUNCTION alp_private.revoke_approval_attestation_key(p_key_id integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE n integer;
BEGIN
  IF p_key_id IS NULL OR p_key_id <= 0 THEN
    RAISE EXCEPTION 'invalid key identifier' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(720203,4);
  UPDATE alp_private.alp_approval_attestation_keys
     SET state='revoked',not_after=clock_timestamp()
   WHERE key_id=p_key_id AND state <> 'revoked';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO alp_private.alp_approval_key_events(event_type,key_id,overlap_seconds)
      VALUES('revoke',p_key_id,NULL);
  END IF;
  RETURN n>0;
END;
$$;

CREATE FUNCTION alp_private.emergency_revoke_approval_attestations()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE n integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(720203,4);
  UPDATE alp_private.alp_approval_attestation_keys
     SET state='revoked',not_after=clock_timestamp()
   WHERE state <> 'revoked';
  GET DIAGNOSTICS n=ROW_COUNT;
  INSERT INTO alp_private.alp_approval_key_events(event_type,key_id,overlap_seconds)
    VALUES('emergency_revoke',NULL,NULL);
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION alp_private.rotate_approval_attestation_key(integer,bytea,integer),
  alp_private.revoke_approval_attestation_key(integer),
  alp_private.emergency_revoke_approval_attestations()
FROM PUBLIC,anon,authenticated,service_role,
  alp_approval_executor,alp_approval_worker_login,alp_academic_executor;
GRANT EXECUTE ON FUNCTION alp_private.rotate_approval_attestation_key(integer,bytea,integer),
  alp_private.revoke_approval_attestation_key(integer),
  alp_private.emergency_revoke_approval_attestations()
TO postgres;

COMMIT;
