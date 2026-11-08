-- Restrict execution only if an existing environment defines the RLS event trigger helper.
-- Fresh local Supabase installations may not include this optional helper.
DO $guard$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$guard$;
