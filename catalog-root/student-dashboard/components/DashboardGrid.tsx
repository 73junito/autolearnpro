import React from 'react'
import ProgressCard from './ProgressCard'
import CourseCard from './CourseCard'

type Course = { id: string; title: string; modules: number; progress: number; hours?: number }

export default function DashboardGrid({ courses, completedPercent }: { courses: Course[]; completedPercent: number }) {
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'240px 1fr',gap:18,alignItems:'start'}}>
        <div>
          <ProgressCard label="Learning Progress" value={completedPercent} />
        </div>
        <div>
          <div className="tiles">
            {courses.map(c => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
