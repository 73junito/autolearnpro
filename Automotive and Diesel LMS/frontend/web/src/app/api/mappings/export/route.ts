import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

function toCsv(rows: any[]) {
  if (!rows || rows.length === 0) return ''
  const keys = Object.keys(rows[0])
  const header = keys.join(',')
  const lines = rows.map(r => keys.map(k => {
    const v = r[k]
    if (v === null || v === undefined) return ''
    return '"' + String(v).replace(/"/g, '""') + '"'
  }).join(','))
  return [header, ...lines].join('\n')
}

export async function GET(req: NextRequest) {
  try {
    // export mapping rows with fields compatible with CSV generator
    const maps = await prisma.competencyStandardMap.findMany({ include: { competency: true, standard: true } })
    const rows = maps.map(m => ({
      Program: '',
      Course: '',
      CompetencyCode: m.competency.code,
      CompetencyTitle: m.competency.title,
      StandardSource: m.standard.source,
      StandardCode: m.standard.code,
      StudentID: '',
      AssessmentDate: '',
      Score: '',
      EvidenceURL: '',
      CredentialIssued: '',
      CredentialCode: ''
    }))

    const csv = toCsv(rows)
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="mappings_export.csv"' } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
