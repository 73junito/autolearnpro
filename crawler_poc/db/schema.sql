-- Postgres schema for LearningObject versioning

CREATE TABLE IF NOT EXISTS logical_objects (
    logical_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT,
    course_id TEXT,
    module_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS object_versions (
    id BIGSERIAL PRIMARY KEY,
    logical_id TEXT NOT NULL REFERENCES logical_objects(logical_id) ON DELETE CASCADE,
    version_id UUID NOT NULL DEFAULT gen_random_uuid(),
    content_hash TEXT,
    crawl_time TIMESTAMPTZ,
    blob_path TEXT,
    fetch_task_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_object_versions_logical_id ON object_versions(logical_id);
