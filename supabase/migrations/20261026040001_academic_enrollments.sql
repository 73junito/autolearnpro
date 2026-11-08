-- Foundation 7 extension: student course enrollments.
-- Students enroll in courses; instructors view enrollments in their own courses.
-- All access is mediated by forced RLS referencing Foundation 7 role assignments.
BEGIN;

CREATE TABLE public.alp_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.alp_courses(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

ALTER TABLE public.alp_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_enrollments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_enrollments FROM PUBLIC, anon, authenticated;

-- Students manage their own enrollments (insert only; no self-unenroll yet).
CREATE POLICY "enrollment_student_own" ON public.alp_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Instructors read enrollments in their own courses.
CREATE POLICY "enrollment_instructor_read_own_course" ON public.alp_enrollments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_enrollments.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

COMMIT;
