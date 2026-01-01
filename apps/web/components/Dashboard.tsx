import DashboardHeader from './DashboardHeader'
import EnrollmentList from './EnrollmentList'
import ProgressCard from './ProgressCard'

export type EnrollmentData = {
  id: string
  courseTitle: string
  courseSlug?: string
  progress: number
}

export default function Dashboard({ enrollments }: { enrollments: EnrollmentData[] }) {
  return (
    <div>
      <DashboardHeader title="Student dashboard" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-lg font-medium">Enrolled courses</h3>
          </div>
          <EnrollmentList enrollments={enrollments} />
        </div>
        <aside>
          <div className="space-y-3">
            {enrollments.slice(0, 3).map((e) => (
              <ProgressCard key={e.id} courseTitle={e.courseTitle} progressPercent={e.progress} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
