import React from 'react'
import { render } from '@testing-library/react'
import ProgressCard from '../ProgressCard'

describe('ProgressCard snapshot', () => {
  it('matches snapshot', () => {
    const { container } = render(<ProgressCard courseTitle="Snapshot Course" progressPercent={33} />)
    expect(container).toMatchSnapshot()
  })
})
