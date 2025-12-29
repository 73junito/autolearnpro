import React from 'react'
import { render } from '@testing-library/react'
import EnrollmentList from '../EnrollmentList'

const sample = [
  { id: '1', courseTitle: 'Course A', courseSlug: 'a', progress: 10 },
  { id: '2', courseTitle: 'Course B', courseSlug: 'b', progress: 20 }
]

describe('EnrollmentList snapshot', () => {
  it('matches snapshot with items', () => {
    const { container } = render(<EnrollmentList enrollments={sample} />)
    expect(container).toMatchSnapshot()
  })

  it('matches snapshot empty', () => {
    const { container } = render(<EnrollmentList enrollments={[]} />)
    expect(container).toMatchSnapshot()
  })
})
