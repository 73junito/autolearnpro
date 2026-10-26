\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
INSERT INTO public.alp_profiles(user_id,display_name) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Student A');
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alp_profiles;
  IF n != 1 THEN RAISE EXCEPTION 'own profile not visible'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alp_profiles;
  IF n != 0 THEN RAISE EXCEPTION 'other account can read a profile'; END IF;
  BEGIN
    INSERT INTO public.alp_profiles(user_id,display_name)
    VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Imposter');
    RAISE EXCEPTION 'cross-user insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO n FROM alp_private.alp_role_assignments;
    RAISE EXCEPTION 'role table readable by client';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
UPDATE public.alp_profiles SET display_name='Student A updated' WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $test$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alp_profiles WHERE display_name='Student A updated';
  IF n != 1 THEN RAISE EXCEPTION 'own display name update failed'; END IF;
END
$test$;
ROLLBACK;
\echo FOUNDATION_07_RLS_TRANSACTION_PASSED
