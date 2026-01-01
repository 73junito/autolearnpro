import { NextResponse } from 'next/server'
import { runErrorCsvCleanupOnce } from '@/lib/errorCsvCleanup'

export async function POST(req: Request) {
  try {
    // Basic temporary auth: header x-maintenance-key must match env var
    const secret = process.env.MAINTENANCE_KEY
    const header = req.headers.get('x-maintenance-key')
    if (secret) {
      if (!header || header !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
      }
    } else {
      // No secret configured — reject by default to avoid accidental exposure
      return NextResponse.json({ error: 'maintenance key not configured' }, { status: 403 })
    }

    const report = await runErrorCsvCleanupOnce()
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export const runtime = 'nodejs'
