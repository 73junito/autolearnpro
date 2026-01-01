const { execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

let prisma
let useFallback = false
try {
  const { PrismaClient } = require('@prisma/client')
  prisma = new PrismaClient({ adapter: { provider: 'sqlite', url: process.env.DATABASE_URL || 'file:./dev.db' } })
} catch (e) {
  console.warn('Prisma client init failed, falling back to sqlite CLI seed:', e.message)
  useFallback = true
}

const seedActor = process.env.SEED_ACTOR || 'seed'

async function main() {
  if (useFallback) {
    const dbPath = (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '')
    const sql = `
INSERT OR IGNORE INTO Competency (id, code, title, description, level, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-competency-1','HMEM-01','Braking Systems — Heavy Mobile Equipment','Inspect, diagnose and repair heavy equipment braking systems.', NULL, '${seedActor}', '${seedActor}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Competency WHERE code='HMEM-01');

INSERT INTO Standard (id, source, code, title, description, notes, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-standard-1','FWG','FWG-5803','Heavy Mobile Equipment Maintenance','FWG 5803 alignment for heavy equipment maintenance tasks.', NULL, '${seedActor}', '${seedActor}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Standard WHERE source='FWG' AND code='FWG-5803');

INSERT OR IGNORE INTO CompetencyStandardMap (id, competencyId, standardId, strength, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-map-1','seed-competency-1','seed-standard-1',5,'${seedActor}','${seedActor}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM CompetencyStandardMap WHERE competencyId='seed-competency-1' AND standardId='seed-standard-1');
`
    try {
      const tmp = path.join(os.tmpdir(), `prisma-seed-${Date.now()}.sql`)
      fs.writeFileSync(tmp, sql)
      execSync(`sqlite3 "${dbPath}" < "${tmp}"`, { stdio: 'inherit' })
      fs.unlinkSync(tmp)
      console.log('Fallback seed applied via sqlite3 CLI')
      return
    } catch (err) {
      console.error('Fallback sqlite3 seed failed:', err.message)
      throw err
    }
  }

  // Prisma-based seed path (guarded) - if runtime fails, fall back to sqlite CLI
  try {
    let competency = await prisma.competency.findFirst({ where: { code: 'HMEM-01' } })
    if (!competency) {
      competency = await prisma.competency.create({
        data: {
          code: 'HMEM-01',
          title: 'Braking Systems — Heavy Mobile Equipment',
          description: 'Inspect, diagnose and repair heavy equipment braking systems.',
          createdBy: seedActor,
          updatedBy: seedActor
        }
      })
    }

    let fwg = await prisma.standard.findFirst({ where: { source: 'FWG', code: 'FWG-5803' } })
    if (!fwg) {
      fwg = await prisma.standard.create({
        data: {
          source: 'FWG',
          code: 'FWG-5803',
          title: 'Heavy Mobile Equipment Maintenance',
          description: 'FWG 5803 alignment for heavy equipment maintenance tasks.',
          createdBy: seedActor,
          updatedBy: seedActor
        }
      })
    }

    const existingMap = await prisma.competencyStandardMap.findFirst({ where: { competencyId: competency.id, standardId: fwg.id } })
    if (!existingMap) {
      await prisma.competencyStandardMap.create({
        data: {
          competencyId: competency.id,
          standardId: fwg.id,
          strength: 5,
          createdBy: seedActor,
          updatedBy: seedActor
        }
      })
    }

    console.log('Seeded: competency, standard (FWG-5803), and mapping (via Prisma)')
  } catch (prismaErr) {
    console.warn('Prisma runtime error during seed, falling back to sqlite CLI:', prismaErr.message)
    // reuse the earlier sql block
    const dbPath = (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '')
    const sql = `
INSERT OR IGNORE INTO Competency (id, code, title, description, level, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-competency-1','HMEM-01','Braking Systems — Heavy Mobile Equipment','Inspect, diagnose and repair heavy equipment braking systems.', NULL, '${seedActor}', '${seedActor}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Competency WHERE code='HMEM-01');

INSERT INTO Standard (id, source, code, title, description, notes, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-standard-1','FWG','FWG-5803','Heavy Mobile Equipment Maintenance','FWG 5803 alignment for heavy equipment maintenance tasks.', NULL, '${seedActor}', '${seedActor}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Standard WHERE source='FWG' AND code='FWG-5803');

INSERT OR IGNORE INTO CompetencyStandardMap (id, competencyId, standardId, strength, createdBy, updatedBy, createdAt, updatedAt)
SELECT 'seed-map-1','seed-competency-1','seed-standard-1',5,'${seedActor}','${seedActor}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM CompetencyStandardMap WHERE competencyId='seed-competency-1' AND standardId='seed-standard-1');
`
    try {
      const tmp = path.join(os.tmpdir(), `prisma-seed-${Date.now()}.sql`)
      fs.writeFileSync(tmp, sql)
      execSync(`sqlite3 "${dbPath}" < "${tmp}"`, { stdio: 'inherit' })
      fs.unlinkSync(tmp)
      console.log('Fallback seed applied via sqlite3 CLI')
      return
    } catch (err) {
      console.error('Fallback sqlite3 seed failed:', err.message)
      throw err
    }
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    if (prisma && prisma.$disconnect) await prisma.$disconnect()
  })
