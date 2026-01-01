import React from 'react'
import './styles/style.css'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="student-dashboard-layout">
      {children}
    </div>
  )
}
