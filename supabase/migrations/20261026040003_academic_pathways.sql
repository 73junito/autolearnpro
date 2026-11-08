-- Foundation 7 extension: academic learning pathways.
-- Pathways are curated sequences of courses. Instructors create and own them;
-- all authenticated users can read published pathways.
-- All access is mediated by forced RLS referencing Foundation 7 role assignments.
BEGIN;

CREATE TABLE public.alp_learning_pathways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(btrim(description)) <= 2000),
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alp_pathway_courses (
  pathway_id uuid NOT NULL REFERENCES public.alp_learning_pathways(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.alp_courses(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (pathway_id, course_id)
);

ALTER TABLE public.alp_learning_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_learning_pathways FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_learning_pathways FROM PUBLIC, anon, authenticated;

-- Instructors manage their own pathways.
CREATE POLICY "pathway_instructor_own" ON public.alp_learning_pathways
  FOR ALL TO authenticated
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

-- Published pathways are readable by authenticated users.
CREATE POLICY "pathway_published_read" ON public.alp_learning_pathways
  FOR SELECT TO authenticated
  USING (is_published);

ALTER TABLE public.alp_pathway_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alp_pathway_courses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.alp_pathway_courses FROM PUBLIC, anon, authenticated;

-- Pathway instructors manage their pathway-course links.
CREATE POLICY "pathway_course_instructor_own" ON public.alp_pathway_courses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      JOIN alp_private.alp_role_assignments ra ON ra.user_id = p.instructor_id
      WHERE p.id = alp_pathway_courses.pathway_id
        AND ra.user_id = auth.uid()
        AND ra.role_name = 'instructor'
    )
  );

-- Authenticated users read pathway-course links for published pathways.
CREATE POLICY "pathway_course_published_read" ON public.alp_pathway_courses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.alp_learning_pathways p
      WHERE p.id = alp_pathway_courses.pathway_id
        AND p.is_published
    )
  );

COMMIT;
