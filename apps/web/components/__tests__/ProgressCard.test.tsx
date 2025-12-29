import React from 'react'
import { render, screen } from '@testing-library/react'
import ProgressCard from '../ProgressCard'

describe('ProgressCard', () => {
  it('renders title and percent', () => {
    render(<ProgressCard courseTitle="Test Course" progressPercent={55} />)
    expect(screen.getByText('Test Course')).toBeInTheDocument()
    expect(screen.getByText('55%')).toBeInTheDocument()
  })
})
