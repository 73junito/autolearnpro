import React from 'react'

export default function DashboardHeader({ userName }: { userName: string }) {
  return (
    <header className="sd-header">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',maxWidth:1000,margin:'0 auto'}}>
        <div>
          <h1>Student Dashboard</h1>
          <div className="muted">Good to see you, {userName}.</div>
        </div>
        <nav aria-label="main">
          <a style={{color:'white', marginRight:12}} href="#">Home</a>
          <a style={{color:'white'}} href="#">Profile</a>
        </nav>
      </div>
    </header>
  )
}
