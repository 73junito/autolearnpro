import React from 'react'

type Course = {
  id: string
  title: string
  modules: number
  progress: number
  hours?: number
}

export default function CourseCard({ course }: { course: Course }) {
  const initials = course.title.split(' ').slice(0,2).map(s=>s[0]).join('').toUpperCase()
  return (
    <article className="tile" role="article" tabIndex={0} aria-labelledby={`title-${course.id}`}>
      <div className="icon" aria-hidden>{initials}</div>
      <div className="title" id={`title-${course.id}`}>{course.title}</div>
      <div className="badges">
        <span className="chip">{course.modules} modules</span>
        {course.hours ? <span className="chip hours">{course.hours}h</span> : null}
      </div>
      <div style={{width:'100%',marginTop:12}}>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={course.progress} aria-label={`${course.title} progress`} style={{height:8,background:'#f3f4f6',borderRadius:6}}>
          <div style={{height:8,width:`${course.progress}%`,background:'#0b5cff',borderRadius:6}} />
        </div>
      </div>
      <div className="meta">{course.progress}% complete</div>
    </article>
  )
}
