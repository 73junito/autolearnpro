import React from 'react'
import { render, screen } from '@testing-library/react'
import EnrollmentList from '../EnrollmentList'

const sample = [
  { id: '1', courseTitle: 'Course A', courseSlug: 'a', progress: 10 },
  { id: '2', courseTitle: 'Course B', courseSlug: 'b', progress: 20 }
]

describe('EnrollmentList', () => {
  it('renders items', () => {
    render(<EnrollmentList enrollments={sample} />)
    expect(screen.getByText('Course A')).toBeInTheDocument()
    expect(screen.getByText('Course B')).toBeInTheDocument()
  })

  it('renders empty message', () => {
    render(<EnrollmentList enrollments={[]} />)
    expect(screen.getByText(/not enrolled/i)).toBeInTheDocument()
  })
})
