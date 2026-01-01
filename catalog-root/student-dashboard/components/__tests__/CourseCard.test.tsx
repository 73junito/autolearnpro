import React from 'react'
import { render, screen } from '@testing-library/react'
import CourseCard from '../CourseCard'

const sample = { id: 't1', title: 'Test Course', modules: 3, progress: 45, hours: 2 }

test('renders course card with title and progress', () => {
  render(<CourseCard course={sample} />)
  expect(screen.getByText(/Test Course/i)).toBeInTheDocument()
  expect(screen.getByText(/45% complete/i)).toBeInTheDocument()
  const progress = screen.getByRole('progressbar')
  expect(progress).toHaveAttribute('aria-valuenow', '45')
})
