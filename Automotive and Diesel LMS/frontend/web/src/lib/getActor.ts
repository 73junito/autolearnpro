import { NextRequest } from 'next/server'

export function getActor(req?: Request | NextRequest | undefined) {
  // Dev override from env (useful in local dev)
  if (process.env.DEV_ACTOR) return process.env.DEV_ACTOR

  // If running in a server route and request is provided, check headers for dev override
  try {
    const h = (req as any)?.headers?.get?.('x-actor') || (req as any)?.headers?.get?.('x-user-id') || (req as any)?.headers?.get?.('x-user-email')
    if (h) return String(h)
  } catch (e) {
    // ignore
  }

  // Default system actor
  return 'system'
}

export default getActor
