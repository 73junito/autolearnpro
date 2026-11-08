-- Foundation 7 extension: academic lessons within courses.
-- Instructors create and own lessons; enrolled students read lessons in their courses.
-- All access is mediated by forced RLS referencing Foundation 7 role assignments.
BEGIN;

CREATE TABLE public.alp_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.alp_courses(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  content text NOT NULL DEFAULT '' CHECK (length(btrim(content)) <= 10000),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.alp_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_lessons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_lessons FROM PUBLIC, anon, authenticated;

-- Instructors manage lessons in their own courses.
CREATE POLICY "lesson_instructor_own_course" ON public.alp_lessons
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_lessons.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND alp_lessons.instructor_id = c.instructor_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_lessons.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND alp_lessons.instructor_id = c.instructor_id
    )
  );

-- Enrolled students read lessons in courses they are enrolled in.
CREATE POLICY "lesson_enrolled_student_read" ON public.alp_lessons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_enrollments e
      WHERE e.course_id = alp_lessons.course_id
        AND e.student_id = auth.uid()
    )
  );

COMMIT;
