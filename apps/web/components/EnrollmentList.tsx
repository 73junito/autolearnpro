type Enrollment = {
  id: string
  courseTitle: string
  courseSlug?: string
  progress: number
}

export default function EnrollmentList({ enrollments }: { enrollments: Enrollment[] }) {
  if (!enrollments || enrollments.length === 0) {
    return <p className="text-sm text-slate-600">You are not enrolled in any courses yet.</p>
  }

  return (
    <ul className="space-y-3">
      {enrollments.map((e) => (
        <li key={e.id} className="bg-white p-4 rounded-md shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{e.courseTitle}</div>
              {e.courseSlug && <div className="text-xs text-slate-500">{e.courseSlug}</div>}
            </div>
            <div className="text-sm text-slate-700">{Math.round(e.progress)}%</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
