-- Stage 2 remediation: grant service_role table-level access on academic tables.
-- The academic API uses SET LOCAL ROLE service_role for all DB operations.
-- Prior migrations revoked all from PUBLIC/anon/authenticated but did not grant to service_role.
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_courses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_enrollments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_lessons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_learning_pathways TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_pathway_courses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alp_academic_progress TO service_role;

-- Grant sequence access if needed
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

COMMIT;
