-- R1 follow-up: the academic progress endpoint updates these exact three columns.
-- Keep other progress columns non-updatable under the restricted executor.
BEGIN;
GRANT UPDATE (completed_at, updated_at)
  ON public.alp_academic_progress TO alp_academic_executor;
COMMIT;
