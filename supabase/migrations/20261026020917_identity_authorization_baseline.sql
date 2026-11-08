-- Foundation 7: student-owned profiles and server-managed role assignments.
BEGIN;
CREATE TABLE public.alp_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.alp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.alp_profiles TO authenticated;
GRANT UPDATE (display_name) ON public.alp_profiles TO authenticated;
CREATE POLICY "profile_owner_read" ON public.alp_profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "profile_owner_create" ON public.alp_profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "profile_owner_edit" ON public.alp_profiles
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE alp_private.alp_role_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_name text NOT NULL CHECK (role_name IN ('student','instructor','administrator')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,role_name)
);
ALTER TABLE alp_private.alp_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alp_private.alp_role_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON alp_private.alp_role_assignments FROM PUBLIC, anon, authenticated;
-- No public policy or elevated-role assignment function. Trusted server role only.
COMMIT;
