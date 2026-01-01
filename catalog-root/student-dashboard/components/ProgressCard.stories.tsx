import React from 'react'
import ProgressCard from './ProgressCard'

export default { title: 'Student Dashboard/ProgressCard', component: ProgressCard }

export const Default = () => (
  <div style={{width:240}}>
    <ProgressCard label="Learning Progress" value={64} />
  </div>
)
