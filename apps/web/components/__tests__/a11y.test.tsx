import React from 'react'
import { render } from '@testing-library/react'
import { toHaveNoViolations } from 'jest-axe'
import { axe } from 'jest-axe'
import ProgressCard from '../ProgressCard'

expect.extend(toHaveNoViolations)

describe('a11y checks (placeholders)', () => {
  it('ProgressCard has no obvious accessibility violations', async () => {
    const { container } = render(<ProgressCard courseTitle="A11y Course" progressPercent={50} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
