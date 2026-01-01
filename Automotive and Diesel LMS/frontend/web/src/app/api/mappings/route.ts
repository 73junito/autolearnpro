import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import getActor from '@/lib/getActor'

type MappingPayload = {
  competencyCode?: string
  competencyId?: string
  standardSource?: string
  standardCode?: string
  standardId?: string
  strength?: number
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const page = Number(url.searchParams.get('page') || '1')
    const limit = Math.min(Number(url.searchParams.get('limit') || '25'), 200)
    const competencyCode = url.searchParams.get('competencyCode') || undefined
    const standardCode = url.searchParams.get('standardCode') || undefined

    const where: any = {}
    if (competencyCode) where.competency = { code: competencyCode }
    if (standardCode) where.standard = { code: standardCode }

    const [data, total] = await Promise.all([
      prisma.competencyStandardMap.findMany({
        where,
        include: { competency: true, standard: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'asc' }
      }),
      prisma.competencyStandardMap.count({ where })
    ])

    return NextResponse.json({ data, meta: { page, limit, total } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = getActor(req)
    const body = (await req.json()) as MappingPayload
    // resolve competency
    let competencyId = body.competencyId
    if (!competencyId && body.competencyCode) {
      const comp = await prisma.competency.findFirst({ where: { code: body.competencyCode } })
      if (!comp) return NextResponse.json({ error: 'competency not found; create competency first' }, { status: 400 })
      competencyId = comp.id
    }

    // resolve standard (idempotent upsert by source+code)
    let standardId = body.standardId
    if (!standardId && body.standardSource && body.standardCode) {
      let std = await prisma.standard.findFirst({ where: { source: body.standardSource, code: body.standardCode } })
      if (!std) {
        std = await prisma.standard.create({ data: { source: body.standardSource, code: body.standardCode, title: `${body.standardSource}-${body.standardCode}`, createdBy: actor, updatedBy: actor } })
      }
      standardId = std.id
    }

    if (!competencyId || !standardId) return NextResponse.json({ error: 'competencyId and standardId (or codes) required' }, { status: 400 })

    // prevent duplicates
    const exists = await prisma.competencyStandardMap.findFirst({ where: { competencyId, standardId } })
    if (exists) return NextResponse.json({ data: exists })

    const mapping = await prisma.competencyStandardMap.create({ data: { competencyId, standardId, strength: body.strength ?? 3, createdBy: actor, updatedBy: actor }, include: { competency: true, standard: true } })
    return NextResponse.json({ data: mapping })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
