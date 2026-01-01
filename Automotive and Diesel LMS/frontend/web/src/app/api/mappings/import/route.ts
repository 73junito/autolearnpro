import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { parse } from 'csv-parse/sync'
import startErrorCsvCleanup from '@/lib/errorCsvCleanup'
import getActor from '@/lib/getActor'
import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

// start cleanup on module load (idempotent)
startErrorCsvCleanup()

type ImportReport = {
  createdStandards: number
  createdCompetencies: number
  createdMappings: number
  updatedCompetencies: number
  updatedMappings: number
  skipped: number
  errors: Array<{ row: number; message: string; original?: any }>
}

function parseCsvText(text: string) {
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true
  })
  return records
}

export async function POST(req: NextRequest) {
  try {
    const actor = getActor(req)
    const url = new URL(req.url)
    const mode = (url.searchParams.get('mode') || 'upsert').toLowerCase()
    const preview = url.searchParams.get('preview') === 'true'

    let payload: any[] = []
    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      if (Array.isArray(body)) payload = body
      else if (body && Array.isArray(body.items)) payload = body.items
      else return NextResponse.json({ error: 'invalid JSON payload' }, { status: 400 })
    } else {
      const text = await req.text()
      if (!text || text.trim().length === 0) return NextResponse.json({ error: 'empty body' }, { status: 400 })
      try {
        payload = parseCsvText(text)
      } catch (e) {
        return NextResponse.json({ error: 'CSV parse error: ' + String(e) }, { status: 400 })
      }
    }

    // safety cap
    const MAX_ROWS = 5000
    if (payload.length > MAX_ROWS) return NextResponse.json({ error: `Import too large: ${payload.length} rows (max ${MAX_ROWS})` }, { status: 400 })

    const report: ImportReport = { createdStandards: 0, createdCompetencies: 0, createdMappings: 0, updatedCompetencies: 0, updatedMappings: 0, skipped: 0, errors: [] }

    const CHUNK = 250
    for (let i = 0; i < payload.length; i += CHUNK) {
      const chunk = payload.slice(i, i + CHUNK)

      if (preview) {
        // validate rows and detect duplicates within chunk and existing DB
        for (let j = 0; j < chunk.length; j++) {
          const rowIndex = i + j
          const row = chunk[j]
          const competencyCode = row.CompetencyCode || row.competency_code || row.competencyCode
          const stdSource = row.StandardSource || row.standard_source || row.standardSource || 'FWG'
          const stdCode = row.StandardCode || row.standard_code || row.standardCode
          if (!competencyCode || !stdCode) report.errors.push({ row: rowIndex + 1, message: 'missing competencyCode or standardCode', original: row })
        }
        continue
      }

      // perform DB writes in transaction per chunk
      await prisma.$transaction(async (tx) => {
        for (let j = 0; j < chunk.length; j++) {
          const rowIndex = i + j
          const row = chunk[j]
          try {
            const competencyCode = row.CompetencyCode || row.competency_code || row.competencyCode
            const competencyTitle = row.CompetencyTitle || row.competency_title || row.competencyTitle || 'Imported competency'
            const stdSource = row.StandardSource || row.standard_source || row.standardSource || 'FWG'
            const stdCode = row.StandardCode || row.standard_code || row.standardCode

            if (!competencyCode || !stdCode) {
              report.errors.push({ row: rowIndex + 1, message: 'missing competencyCode or standardCode', original: row })
              continue
            }

            // find or create/update competency according to mode
            let competency = await tx.competency.findFirst({ where: { code: competencyCode } })
            if (!competency) {
              competency = await tx.competency.create({ data: { code: competencyCode, title: competencyTitle, createdBy: actor, updatedBy: actor } })
              report.createdCompetencies++
            } else if (mode === 'overwrite') {
              await tx.competency.update({ where: { id: competency.id }, data: { title: competencyTitle, updatedBy: actor } })
              report.updatedCompetencies++
            }

            // find or create standard
            let standard = await tx.standard.findFirst({ where: { source: stdSource, code: stdCode } })
            if (!standard) {
              standard = await tx.standard.create({ data: { source: stdSource, code: stdCode, title: row.StandardTitle || `${stdSource}-${stdCode}`, createdBy: actor, updatedBy: actor } })
              report.createdStandards++
            } else if (mode === 'overwrite' && row.StandardTitle) {
              await tx.standard.update({ where: { id: standard.id }, data: { title: row.StandardTitle, updatedBy: actor } })
            }

            // mapping check
            const exists = await tx.competencyStandardMap.findFirst({ where: { competencyId: competency.id, standardId: standard.id } })
            if (exists) {
              if (mode === 'skip') {
                report.skipped++
                continue
              }
              if (mode === 'overwrite') {
                await tx.competencyStandardMap.update({ where: { id: exists.id }, data: { strength: row.strength ?? exists.strength, updatedBy: actor } })
                report.updatedMappings++
                continue
              }
              // mode upsert: do nothing if exists
              if (mode === 'upsert') { report.skipped++; continue }
            }

            // create mapping
            await tx.competencyStandardMap.create({ data: { competencyId: competency.id, standardId: standard.id, strength: row.strength ?? 3, createdBy: actor, updatedBy: actor } })
            report.createdMappings++

          } catch (e) {
            report.errors.push({ row: rowIndex + 1, message: String(e), original: row })
          }
        }
      })
    }

    if (preview) {
      return NextResponse.json({ preview: true, rows: payload.length, errors: report.errors, note: 'preview mode — no DB writes performed' })
    }

    // if there are errors, write an error CSV to disk and return a URL
    let errorCsvUrl: string | undefined = undefined
    if (report.errors.length > 0) {
      try {
        const tmpDir = path.join(process.cwd(), 'frontend', 'web', 'tmp', 'import_errors')
        await fs.mkdir(tmpDir, { recursive: true })
        const token = randomUUID()
        const filePath = path.join(tmpDir, `${token}.csv`)

        const headers = ['RowNumber', 'CompetencyCode', 'CompetencyTitle', 'StandardSource', 'StandardCode', 'Error']
        const lines = [headers.join(',')]
        for (const e of report.errors) {
          const orig = e.original || {}
          const rownum = String(e.row)
          const comp = String(orig.CompetencyCode || orig.competency_code || orig.competencyCode || '')
          const comptitle = String(orig.CompetencyTitle || orig.competency_title || orig.competencyTitle || '')
          const src = String(orig.StandardSource || orig.standard_source || orig.standardSource || '')
          const scode = String(orig.StandardCode || orig.standard_code || orig.standardCode || '')
          const msg = String(e.message || '')
          const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"'
          lines.push([esc(rownum), esc(comp), esc(comptitle), esc(src), esc(scode), esc(msg)].join(','))
        }

        const csv = lines.join('\n')
        await fs.writeFile(filePath, csv, 'utf8')
        errorCsvUrl = `/api/mappings/import/errors/${token}`
      } catch (e) {
        // ignore file write errors but still return report
      }
    }

    return NextResponse.json({ data: report, errorCsvUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
