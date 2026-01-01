import type { Meta, StoryObj } from '@storybook/react'
import Dashboard from '../../components/Dashboard'
import { rest } from 'msw'

const meta: Meta<typeof Dashboard> = {
  title: 'Dashboard/StudentDashboard',
  component: Dashboard
}

export default meta
type Story = StoryObj<typeof Dashboard>

const sampleEnrollments = [
  { id: '1', courseTitle: 'Brake Systems 101', courseSlug: 'brakes-101', progress: 42 },
  { id: '2', courseTitle: 'Engine Fundamentals', courseSlug: 'engine-fundamentals', progress: 76 },
  { id: '3', courseTitle: 'Electrical Systems', courseSlug: 'electrical-systems', progress: 18 }
]

export const Default: Story = {
  args: { enrollments: sampleEnrollments }
}

export const FromAPI: Story = {
  parameters: {
    msw: [
      rest.get('/api/enrollments', (_req, res, ctx) => {
        return res(ctx.status(200), ctx.json(sampleEnrollments))
      })
    ]
  }
}

export const Empty: Story = {
  args: { enrollments: [] }
}

export const Loading: Story = {
  parameters: {
    msw: [
      rest.get('/api/enrollments', (_req, res, ctx) => {
        return res(ctx.delay(2000), ctx.status(200), ctx.json(sampleEnrollments))
      })
    ]
  },
  render: () => <div style={{ width: 600 }}><Dashboard enrollments={[]} /></div>
}

export const Error: Story = {
  parameters: {
    msw: [
      rest.get('/api/enrollments', (_req, res, ctx) => {
        return res(ctx.status(500))
      })
    ]
  },
  render: () => <div style={{ width: 600 }}><Dashboard enrollments={[]} /></div>
}

const many = Array.from({ length: 20 }).map((_, i) => ({
  id: String(i + 1),
  courseTitle: `Course ${i + 1}`,
  courseSlug: `course-${i + 1}`,
  progress: Math.floor(Math.random() * 100)
}))

export const Many: Story = {
  args: { enrollments: many }
}

export const A11yChecklist: Story = {
  args: { enrollments: sampleEnrollments },
  parameters: {
    a11y: { config: { rules: [{ id: 'color-contrast', enabled: false }] } }
  }
}
