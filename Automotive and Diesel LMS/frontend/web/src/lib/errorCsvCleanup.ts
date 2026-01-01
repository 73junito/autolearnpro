import fs from 'fs/promises'
import path from 'path'

let started = false

const DIR = path.join(process.cwd(), 'frontend', 'web', 'tmp', 'import_errors')

export async function runErrorCsvCleanupOnce() {
  const dir = DIR
  const ttlHours = Number(process.env.ERROR_CSV_TTL_HOURS) || 168 // 7 days
  const intervalHours = Number(process.env.ERROR_CSV_CLEANUP_INTERVAL_HOURS) || 12

  let deleted = 0
  let kept = 0
  let errors = 0

  try {
    await fs.mkdir(dir, { recursive: true })
    const files = await fs.readdir(dir)
    const now = Date.now()
    const ttlMs = ttlHours * 3600 * 1000

    for (const fname of files) {
      try {
        // Guardrail: only delete canonical UUID.csv files
        if (!/^[0-9a-fA-F-]{36}\.csv$/.test(fname)) {
          kept++
          continue
        }
        const filePath = path.join(dir, fname)
        const st = await fs.lstat(filePath)
        if (st.isSymbolicLink()) { kept++; continue }
        if (!st.isFile()) { kept++; continue }
        const mtimeMs = st.mtimeMs || st.mtime.getTime()
        if (now - mtimeMs > ttlMs) {
          await fs.unlink(filePath).catch((e) => {
            console.error('Failed to delete error CSV', filePath, e)
            errors++
          })
          deleted++
        } else {
          kept++
        }
      } catch (e) {
        console.error('Error while evaluating file for cleanup', fname, e)
        errors++
      }
    }
  } catch (e) {
    console.error('Error running error CSV cleanup', e)
    errors++
  }

  return { deleted, kept, errors, ttlHours, intervalHours, dir }
}

export function startErrorCsvCleanup() {
  if (started) return
  started = true

  // run once now and schedule periodic runs
  runErrorCsvCleanupOnce().catch(() => {})
  const intervalHours = Number(process.env.ERROR_CSV_CLEANUP_INTERVAL_HOURS) || 12
  setInterval(() => runErrorCsvCleanupOnce().catch(() => {}), intervalHours * 3600 * 1000)
}

export default startErrorCsvCleanup
