import { PrismaClient } from '@prisma/client'

declare global {
  // allow global variable in dev to avoid multiple instances with HMR
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

let prisma: PrismaClient | undefined = global.prisma

function initPrisma() {
  if (!prisma) {
    prisma = new PrismaClient()
    if (process.env.NODE_ENV !== 'production') global.prisma = prisma
  }
  return prisma
}

// Export a proxy that lazily initializes PrismaClient on first use.
// This avoids instantiating Prisma during Next.js build/generation when
// modules are imported but DB access isn't needed.
const lazyProxy = new Proxy(
  {},
  {
    get(_, prop) {
      const client = initPrisma()
      // @ts-ignore
      return (client as any)[prop]
    },
    apply(_, __, args) {
      const client = initPrisma()
      // @ts-ignore
      return (client as any).apply(undefined, args)
    },
  }
) as unknown as PrismaClient

export default lazyProxy
