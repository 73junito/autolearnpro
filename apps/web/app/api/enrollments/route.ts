import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const base = path.join(process.cwd(), '../../..') // apps/web -> repo root via ../../..
    const fixtures = path.join(base, 'data', 'fixtures')

    const enrollRaw = fs.readFileSync(path.join(fixtures, 'enrollments.json'), 'utf-8')
    const coursesRaw = fs.readFileSync(path.join(fixtures, 'courses.json'), 'utf-8')
    const usersRaw = fs.readFileSync(path.join(fixtures, 'users.json'), 'utf-8')

    const enrollments = JSON.parse(enrollRaw)
    const courses = JSON.parse(coursesRaw)
    const users = JSON.parse(usersRaw)

    // simple join - map course slug to title
    const courseBySlug = new Map(courses.map((c: any) => [c.slug, c]))
    const userByEmail = new Map(users.map((u: any) => [u.email, u]))

    const out = enrollments.map((e: any) => {
      const course = courseBySlug.get(e.courseSlug) || { title: e.courseSlug }
      const user = userByEmail.get(e.userEmail) || null
      // random-ish progress placeholder (or use provided progress)
      const progress = e.progress ?? Math.floor(Math.random() * 80) + 10
      return {
        id: e.id || `${e.userEmail}-${e.courseSlug}`,
        userEmail: e.userEmail,
        userName: user?.name || null,
        courseSlug: e.courseSlug,
        courseTitle: course.title,
        progress
      }
    })

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to read fixtures' }), { status: 500 })
  }
}
