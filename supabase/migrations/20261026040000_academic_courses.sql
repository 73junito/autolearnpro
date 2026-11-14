-- Foundation 7 extension: academic course catalog.
-- Instructors create and own courses; enrolled students and instructors read them.
-- All access is mediated by forced RLS referencing Foundation 7 role assignments.
BEGIN;

CREATE TABLE public.alp_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(btrim(description)) <= 2000),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alp_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_courses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_courses FROM PUBLIC, anon, authenticated;

-- Instructors manage their own courses.
CREATE POLICY "course_instructor_all" ON public.alp_courses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_courses.instructor_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_courses.instructor_id
    )
  );

-- Published courses are readable by authenticated users (students and instructors).
CREATE POLICY "course_published_read" ON public.alp_courses
  FOR SELECT TO authenticated
  USING (is_published);

-- Course owners can update their own courses.
CREATE POLICY "course_owner_update" ON public.alp_courses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_courses.instructor_id
    )
  );

COMMIT;
