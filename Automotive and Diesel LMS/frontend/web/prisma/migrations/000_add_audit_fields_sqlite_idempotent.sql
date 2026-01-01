-- =========================================
-- AutoLearnPro LMS - SQLite Audit Fields Migration (idempotent guidance)
-- Adds createdAt, updatedAt, createdBy, updatedBy to:
--   - Standard
--   - Competency
--   - CompetencyStandardMap
--
-- NOTE: SQLite lacks ADD COLUMN IF NOT EXISTS; run once or via a wrapper script.
-- =========================================

PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- ---------------------------
-- 1) Standard
-- ---------------------------
ALTER TABLE Standard ADD COLUMN createdAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Standard ADD COLUMN updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Standard ADD COLUMN createdBy TEXT;
ALTER TABLE Standard ADD COLUMN updatedBy TEXT;

-- ---------------------------
-- 2) Competency
-- ---------------------------
ALTER TABLE Competency ADD COLUMN createdAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Competency ADD COLUMN updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Competency ADD COLUMN createdBy TEXT;
ALTER TABLE Competency ADD COLUMN updatedBy TEXT;

-- ---------------------------
-- 3) CompetencyStandardMap
-- ---------------------------
ALTER TABLE CompetencyStandardMap ADD COLUMN createdAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE CompetencyStandardMap ADD COLUMN updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE CompetencyStandardMap ADD COLUMN createdBy TEXT;
ALTER TABLE CompetencyStandardMap ADD COLUMN updatedBy TEXT;

-- ---------------------------
-- 4) Safe backfill
-- ---------------------------
UPDATE Standard
SET createdBy = COALESCE(NULLIF(createdBy, ''), 'system'),
    updatedBy = COALESCE(NULLIF(updatedBy, ''), 'system');

UPDATE Competency
SET createdBy = COALESCE(NULLIF(createdBy, ''), 'system'),
    updatedBy = COALESCE(NULLIF(updatedBy, ''), 'system');

UPDATE CompetencyStandardMap
SET createdBy = COALESCE(NULLIF(createdBy, ''), 'system'),
    updatedBy = COALESCE(NULLIF(updatedBy, ''), 'system');

UPDATE Standard
SET createdAt = COALESCE(NULLIF(createdAt, ''), CURRENT_TIMESTAMP),
    updatedAt = COALESCE(NULLIF(updatedAt, ''), CURRENT_TIMESTAMP);

UPDATE Competency
SET createdAt = COALESCE(NULLIF(createdAt, ''), CURRENT_TIMESTAMP),
    updatedAt = COALESCE(NULLIF(updatedAt, ''), CURRENT_TIMESTAMP);

UPDATE CompetencyStandardMap
SET createdAt = COALESCE(NULLIF(createdAt, ''), CURRENT_TIMESTAMP),
    updatedAt = COALESCE(NULLIF(updatedAt, ''), CURRENT_TIMESTAMP);

COMMIT;
PRAGMA foreign_keys=ON;

-- Quick verification:
-- PRAGMA table_info(Standard);
-- PRAGMA table_info(Competency);
-- PRAGMA table_info(CompetencyStandardMap);
