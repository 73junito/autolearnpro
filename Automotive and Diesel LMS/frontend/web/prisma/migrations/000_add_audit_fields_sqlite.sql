-- Migration: add audit fields (SQLite)
-- Non-destructive ALTER TABLE + safe backfill
BEGIN TRANSACTION;

-- Add audit columns to Standard
ALTER TABLE Standard ADD COLUMN createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Standard ADD COLUMN updatedAt   TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE Standard ADD COLUMN createdBy   TEXT;
ALTER TABLE Standard ADD COLUMN updatedBy   TEXT;

-- Add audit columns to CompetencyStandardMap
ALTER TABLE CompetencyStandardMap ADD COLUMN createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE CompetencyStandardMap ADD COLUMN updatedAt   TEXT DEFAULT (CURRENT_TIMESTAMP);
ALTER TABLE CompetencyStandardMap ADD COLUMN createdBy   TEXT;
ALTER TABLE CompetencyStandardMap ADD COLUMN updatedBy   TEXT;

-- Add createdBy/updatedBy to Competency (createdAt/updatedAt often exist already)
ALTER TABLE Competency ADD COLUMN createdBy   TEXT;
ALTER TABLE Competency ADD COLUMN updatedBy   TEXT;

-- Safe backfill: set actor fields to 'system' where NULL and ensure timestamps present
UPDATE Competency
SET createdBy = COALESCE(createdBy, 'system'),
    updatedBy = COALESCE(updatedBy, 'system'),
    createdAt = COALESCE(createdAt, CURRENT_TIMESTAMP),
    updatedAt = COALESCE(updatedAt, CURRENT_TIMESTAMP)
WHERE createdBy IS NULL OR updatedBy IS NULL OR createdAt IS NULL OR updatedAt IS NULL;

UPDATE Standard
SET createdBy = COALESCE(createdBy, 'system'),
    updatedBy = COALESCE(updatedBy, 'system'),
    createdAt = COALESCE(createdAt, CURRENT_TIMESTAMP),
    updatedAt = COALESCE(updatedAt, CURRENT_TIMESTAMP)
WHERE createdBy IS NULL OR updatedBy IS NULL OR createdAt IS NULL OR updatedAt IS NULL;

UPDATE CompetencyStandardMap
SET createdBy = COALESCE(createdBy, 'system'),
    updatedBy = COALESCE(updatedBy, 'system'),
    createdAt = COALESCE(createdAt, CURRENT_TIMESTAMP),
    updatedAt = COALESCE(updatedAt, CURRENT_TIMESTAMP)
WHERE createdBy IS NULL OR updatedBy IS NULL OR createdAt IS NULL OR updatedAt IS NULL;

COMMIT;

-- Notes:
-- 1) If a column already exists, ALTER TABLE will fail; check schema with:
--    PRAGMA table_info('Competency');
--    PRAGMA table_info('Standard');
--    PRAGMA table_info('CompetencyStandardMap');
-- 2) Run this against your SQLite dev DB (e.g. using sqlite3 or your SQL Tools Service).
-- 3) After applying, run your app and verify models in Prisma Studio or via queries.
