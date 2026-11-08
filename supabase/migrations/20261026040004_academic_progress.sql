-- Foundation 7 extension: academic progress tracking.
-- Students track their own lesson/course progress; instructors view progress of
-- students enrolled in their own courses.
-- All access is mediated by forced RLS referencing Foundation 7 role assignments.
BEGIN;

CREATE TABLE public.alp_academic_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.alp_lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.alp_courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','in_progress','completed')),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id)
);

ALTER TABLE public.alp_academic_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_academic_progress FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_academic_progress FROM PUBLIC, anon, authenticated;

-- Students manage their own progress records.
CREATE POLICY "progress_student_own" ON public.alp_academic_progress
  FOR ALL TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Instructors read progress of students enrolled in their own courses.
CREATE POLICY "progress_instructor_read_own_course" ON public.alp_academic_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_academic_progress.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

COMMIT;
