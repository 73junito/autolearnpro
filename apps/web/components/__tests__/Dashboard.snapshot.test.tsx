import React from 'react'
import { render } from '@testing-library/react'
import Dashboard from '../Dashboard'

const enrollments = [
  { id: '1', courseTitle: 'Course A', courseSlug: 'a', progress: 33 },
  { id: '2', courseTitle: 'Course B', courseSlug: 'b', progress: 66 }
]

describe('Dashboard snapshot', () => {
  it('matches snapshot', () => {
    const { container } = render(<Dashboard enrollments={enrollments} />)
    expect(container).toMatchSnapshot()
  })
})
