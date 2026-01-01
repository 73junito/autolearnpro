import React from 'react'
import './styles/style.css'
import DashboardHeader from './components/DashboardHeader'
import DashboardGrid from './components/DashboardGrid'
import coursesData from './data/courses.json'

type Course = {
  id: string
  title: string
  modules: number
  progress: number
  hours?: number
}

export default function Page() {
  const courses: Course[] = coursesData as Course[]

  const summary = {
    completedPercent: Math.round(courses.reduce((s, c) => s + c.progress, 0) / courses.length)
  }

  return (
    <div className="student-dashboard-root">
      <DashboardHeader userName="Alex" />
      <main className="sd-main sd-content" role="main">
        <div className="sd-app">
          <aside className="sd-side" aria-label="sidebar">
            <div className="sd-side-inner">
              <input className="nav-search" placeholder="Search courses" aria-label="Search courses" />
              <div className="nav-group">
                <button className="nav-toggle" aria-expanded="true">My Learning</button>
                <ul className="nav-list expanded">
                  <li><a href="#">Enrolled</a></li>
                  <li><a href="#">Recommended</a></li>
                  <li><a href="#">Completed</a></li>
                </ul>
              </div>
            </div>
          </aside>

          <section className="sd-content">
            <div className="course-hero" role="region" aria-label="dashboard-hero">
              <div className="hero-body">
                <h2 className="hero-title">Welcome back, Alex</h2>
                <p className="hero-sub">Continue your learning — here are your current courses and progress.</p>
              </div>
              <a href="#" className="cta-btn">Resume course</a>
            </div>

            <div style={{display:'flex',gap:18,alignItems:'flex-start'}}>
              <div style={{flex:1}}>
                <DashboardGrid courses={courses} completedPercent={summary.completedPercent} />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
