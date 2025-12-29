import React from 'react'
import { render, screen } from '@testing-library/react'
import Dashboard from '../Dashboard'

const enrollments = [
  { id: '1', courseTitle: 'Course A', courseSlug: 'a', progress: 33 },
  { id: '2', courseTitle: 'Course B', courseSlug: 'b', progress: 66 }
]

describe('Dashboard', () => {
  it('renders header and enrollments', () => {
    render(<Dashboard enrollments={enrollments} />)
    expect(screen.getByText(/student dashboard/i)).toBeInTheDocument()
    expect(screen.getByText('Course A')).toBeInTheDocument()
    expect(screen.getByText('Course B')).toBeInTheDocument()
  })
})
