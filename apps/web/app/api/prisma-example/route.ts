import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const users = await prisma.user.findMany({ take: 5 })
    return new Response(JSON.stringify(users), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Prisma query failed' }), { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
