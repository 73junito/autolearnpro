import React from 'react'
import CourseCard from './CourseCard'

export default { title: 'Student Dashboard/CourseCard', component: CourseCard }

export const Default = () => (
  <div style={{width:240}}>
    <CourseCard course={{ id: 'c1', title: 'Intro to Diesel Engines', modules: 8, progress: 72, hours: 5 }} />
  </div>
)
