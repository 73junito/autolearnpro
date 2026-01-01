const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function main() {
  const fixturesDir = path.join(__dirname, '../../../data/fixtures')

  const users = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'users.json')))
  const courses = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'courses.json')))
  const modules = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'modules.json')))
  const enrollments = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'enrollments.json')))

  console.log('Seeding users...')
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role },
      create: { email: u.email, name: u.name, role: u.role }
    })
  }

  console.log('Seeding courses...')
  for (const c of courses) {
    await prisma.course.upsert({
      where: { slug: c.slug },
      update: { title: c.title, description: c.description },
      create: { slug: c.slug, title: c.title, description: c.description }
    })
  }

  console.log('Seeding modules...')
  for (const m of modules) {
    const course = await prisma.course.findUnique({ where: { slug: m.courseSlug } })
    if (!course) continue
    await prisma.module.create({ data: { courseId: course.id, title: m.title, order: m.order } })
  }

  console.log('Seeding enrollments...')
  for (const e of enrollments) {
    const user = await prisma.user.findUnique({ where: { email: e.userEmail } })
    const course = await prisma.course.findUnique({ where: { slug: e.courseSlug } })
    if (!user || !course) continue
    await prisma.enrollment.createMany({ data: [{ userId: user.id, courseId: course.id }], skipDuplicates: true })
  }

  console.log('Seeding complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
