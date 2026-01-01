import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import getActor from '@/lib/getActor'

type StandardPayload = {
  source: string
  code: string
  title: string
  description?: string
  notes?: string
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const page = Number(url.searchParams.get('page') || '1')
    const limit = Math.min(Number(url.searchParams.get('limit') || '25'), 200)
    const source = url.searchParams.get('source') || undefined
    const code = url.searchParams.get('code') || undefined
    const search = url.searchParams.get('search') || undefined

    const where: any = {}
    if (source) where.source = source
    if (code) where.code = code
    if (search) where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ]

    const [data, total] = await Promise.all([
      prisma.standard.findMany({
        where,
        orderBy: { source: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.standard.count({ where })
    ])

    return NextResponse.json({ data, meta: { page, limit, total } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StandardPayload
    if (!body || !body.source || !body.code || !body.title) {
      return NextResponse.json({ error: 'source, code and title are required' }, { status: 400 })
    }

    const actor = getActor(req)

    // idempotent: update if exists, otherwise create
    const existing = await prisma.standard.findFirst({ where: { source: body.source, code: body.code } })
    let rec
    if (existing) {
      rec = await prisma.standard.update({ where: { id: existing.id }, data: { title: body.title, description: body.description || null, notes: body.notes || null, updatedBy: actor } })
    } else {
      rec = await prisma.standard.create({ data: { source: body.source, code: body.code, title: body.title, description: body.description || null, notes: body.notes || null, createdBy: actor, updatedBy: actor } })
    }

    return NextResponse.json({ data: rec })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
