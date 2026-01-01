import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import startErrorCsvCleanup from '@/lib/errorCsvCleanup'

// ensure cleanup runs when this route module loads (idempotent)
startErrorCsvCleanup()

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    const filePath = path.join(process.cwd(), 'frontend', 'web', 'tmp', 'import_errors', `${token}.csv`)
    const data = await fs.readFile(filePath, 'utf8')
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="import_errors_${token}.csv"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}

export const dynamic = 'force-dynamic'
