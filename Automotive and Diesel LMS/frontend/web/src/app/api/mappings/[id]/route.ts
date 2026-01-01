import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import getActor from '@/lib/getActor'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await req.json()
    const actor = getActor(req)

    // allow updating standard by id or by source+code
    let standardId = body.standardId
    if (!standardId && body.standardSource && body.standardCode) {
      let std = await prisma.standard.findFirst({ where: { source: body.standardSource, code: body.standardCode } })
      if (!std) {
        std = await prisma.standard.create({ data: { source: body.standardSource, code: body.standardCode, title: `${body.standardSource}-${body.standardCode}` } })
      }
      standardId = std.id
    }

    if (!standardId) return NextResponse.json({ error: 'standardId or standardSource+standardCode required' }, { status: 400 })

    const existing = await prisma.competencyStandardMap.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'mapping not found' }, { status: 404 })

    // prevent creating duplicate mapping (competencyId + standardId unique)
    const duplicate = await prisma.competencyStandardMap.findFirst({ where: { competencyId: existing.competencyId, standardId } })
    if (duplicate && duplicate.id !== id) return NextResponse.json({ error: 'duplicate mapping exists' }, { status: 409 })

    const updated = await prisma.competencyStandardMap.update({ where: { id }, data: { standardId, strength: body.strength ?? existing.strength, updatedBy: actor }, include: { competency: true, standard: true } })
    return NextResponse.json({ data: updated })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const existing = await prisma.competencyStandardMap.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'mapping not found' }, { status: 404 })
    await prisma.competencyStandardMap.delete({ where: { id } })
    return NextResponse.json({ data: { id } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
