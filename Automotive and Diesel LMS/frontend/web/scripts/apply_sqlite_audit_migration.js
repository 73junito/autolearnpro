#!/usr/bin/env node
/**
 * apply_sqlite_audit_migration.js
 *
 * Checks for missing audit columns and applies non-destructive ALTERs
 * then runs safe backfill. Uses the `sqlite3` CLI.
 *
 * Usage:
 *   node scripts/apply_sqlite_audit_migration.js [path/to/dev.db]
 * If no path provided, reads DATABASE_URL from .env (expects file:./dev.db style).
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function exit(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

function runSqlite(db, sql) {
  try {
    return execFileSync('sqlite3', [db, sql], { encoding: 'utf8' })
  } catch (e) {
    throw new Error(e.message || String(e))
  }
}

function parsePragmaOutput(out) {
  // expected lines like: cid|name|type|notnull|dflt_value|pk
  return out
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => l.split('|'))
}

function hasColumn(db, table, col) {
  const sql = `PRAGMA table_info('${table}');`;
  const out = runSqlite(db, sql)
  const rows = parsePragmaOutput(out)
  for (const r of rows) {
    if (r[1] === col) return true
  }
  return false
}

function ensureSqliteCli() {
  try {
    execFileSync('sqlite3', ['-version'], { encoding: 'utf8' })
  } catch (e) {
    exit('sqlite3 CLI not found in PATH. Install sqlite3 or run the SQL manually.')
  }
}

function readDatabasePath(arg) {
  if (arg) return arg
  // try .env
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8')
    const m = txt.match(/DATABASE_URL=(.+)/)
    if (m) {
      const v = m[1].trim().replace(/"/g, '')
      if (v.startsWith('file:')) return v.replace(/^file:/, '')
      return v
    }
  }
  // default
  return path.join(process.cwd(), 'dev.db')
}

function backupDb(db) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = `${db}.backup-${ts}`
  fs.copyFileSync(db, dest)
  return dest
}

function main() {
  ensureSqliteCli()
  const arg = process.argv[2]
  const db = readDatabasePath(arg)
  if (!fs.existsSync(db)) exit(`Database file not found: ${db}`)

  console.log('Database:', db)
  console.log('Creating backup...')
  const backup = backupDb(db)
  console.log('Backup saved to', backup)

  const ops = []

  // Standard
  if (!hasColumn(db, 'Standard', 'createdAt')) ops.push("ALTER TABLE Standard ADD COLUMN createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP);")
  if (!hasColumn(db, 'Standard', 'updatedAt')) ops.push("ALTER TABLE Standard ADD COLUMN updatedAt   TEXT DEFAULT (CURRENT_TIMESTAMP);")
  if (!hasColumn(db, 'Standard', 'createdBy')) ops.push("ALTER TABLE Standard ADD COLUMN createdBy   TEXT;")
  if (!hasColumn(db, 'Standard', 'updatedBy')) ops.push("ALTER TABLE Standard ADD COLUMN updatedBy   TEXT;")

  // CompetencyStandardMap
  if (!hasColumn(db, 'CompetencyStandardMap', 'createdAt')) ops.push("ALTER TABLE CompetencyStandardMap ADD COLUMN createdAt   TEXT DEFAULT (CURRENT_TIMESTAMP);")
  if (!hasColumn(db, 'CompetencyStandardMap', 'updatedAt')) ops.push("ALTER TABLE CompetencyStandardMap ADD COLUMN updatedAt   TEXT DEFAULT (CURRENT_TIMESTAMP);")
  if (!hasColumn(db, 'CompetencyStandardMap', 'createdBy')) ops.push("ALTER TABLE CompetencyStandardMap ADD COLUMN createdBy   TEXT;")
  if (!hasColumn(db, 'CompetencyStandardMap', 'updatedBy')) ops.push("ALTER TABLE CompetencyStandardMap ADD COLUMN updatedBy   TEXT;")

  // Competency
  if (!hasColumn(db, 'Competency', 'createdBy')) ops.push("ALTER TABLE Competency ADD COLUMN createdBy   TEXT;")
  if (!hasColumn(db, 'Competency', 'updatedBy')) ops.push("ALTER TABLE Competency ADD COLUMN updatedBy   TEXT;")

  if (ops.length === 0) {
    console.log('No missing columns detected. Running backfill only.')
  } else {
    console.log('Applying', ops.length, 'ALTER(s)')
    for (const s of ops) {
      console.log('> ', s)
      runSqlite(db, s)
    }
  }

  console.log('Running safe backfill...')
  const backfill = `BEGIN TRANSACTION;
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
COMMIT;`;

  runSqlite(db, backfill)

  console.log('Done. Verify with PRAGMA table_info(<table>) or open Prisma Studio.')
}

main()
