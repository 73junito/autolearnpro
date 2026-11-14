-- Stage 2 remediation: replace broad FOR ALL RLS policies with operation-specific policies.
-- Prior academic migrations (20261026040000-040004) remain immutable.
BEGIN;

-- courses: drop broad instructor_all policy; keep specific operations
DROP POLICY IF EXISTS "course_instructor_all" ON public.alp_courses;
DROP POLICY IF EXISTS "course_owner_update" ON public.alp_courses;

CREATE POLICY "course_instructor_insert" ON public.alp_courses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_courses.instructor_id
    )
  );

CREATE POLICY "course_instructor_update" ON public.alp_courses
  FOR UPDATE TO authenticated
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

CREATE POLICY "course_instructor_delete" ON public.alp_courses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_courses.instructor_id
    )
  );

-- enrollments: replace FOR ALL with SELECT + INSERT only (no UPDATE/DELETE by students)
DROP POLICY IF EXISTS "enrollment_student_own" ON public.alp_enrollments;

CREATE POLICY "enrollment_student_select" ON public.alp_enrollments
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "enrollment_student_insert" ON public.alp_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

-- lessons: replace FOR ALL with specific operations
DROP POLICY IF EXISTS "lesson_instructor_own_course" ON public.alp_lessons;

CREATE POLICY "lesson_instructor_select" ON public.alp_lessons
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_lessons.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND alp_lessons.instructor_id = c.instructor_id
    )
  );

CREATE POLICY "lesson_instructor_insert" ON public.alp_lessons
  FOR INSERT TO authenticated
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

CREATE POLICY "lesson_instructor_update" ON public.alp_lessons
  FOR UPDATE TO authenticated
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

CREATE POLICY "lesson_instructor_delete" ON public.alp_lessons
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_courses c
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = c.instructor_id
      WHERE c.id = alp_lessons.course_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND alp_lessons.instructor_id = c.instructor_id
    )
  );

-- pathways: replace FOR ALL with specific operations
DROP POLICY IF EXISTS "pathway_instructor_own" ON public.alp_learning_pathways;

CREATE POLICY "pathway_instructor_select" ON public.alp_learning_pathways
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_learning_pathways.instructor_id
    )
  );

CREATE POLICY "pathway_instructor_insert" ON public.alp_learning_pathways
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_learning_pathways.instructor_id
    )
  );

CREATE POLICY "pathway_instructor_update" ON public.alp_learning_pathways
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_learning_pathways.instructor_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_learning_pathways.instructor_id
    )
  );

CREATE POLICY "pathway_instructor_delete" ON public.alp_learning_pathways
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM alp_private.alp_role_assignments ra
      WHERE ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
        AND ra.user_id = alp_learning_pathways.instructor_id
    )
  );

-- pathway_courses: replace FOR ALL with specific operations
DROP POLICY IF EXISTS "pathway_course_instructor_own" ON public.alp_pathway_courses;

CREATE POLICY "pathway_course_instructor_select" ON public.alp_pathway_courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

CREATE POLICY "pathway_course_instructor_insert" ON public.alp_pathway_courses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

CREATE POLICY "pathway_course_instructor_update" ON public.alp_pathway_courses
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

CREATE POLICY "pathway_course_instructor_delete" ON public.alp_pathway_courses
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

-- progress: replace FOR ALL with SELECT + INSERT + UPDATE (no DELETE by students)
DROP POLICY IF EXISTS "progress_student_own" ON public.alp_academic_progress;

CREATE POLICY "progress_student_select" ON public.alp_academic_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "progress_student_insert" ON public.alp_academic_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "progress_student_update" ON public.alp_academic_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

COMMIT;
