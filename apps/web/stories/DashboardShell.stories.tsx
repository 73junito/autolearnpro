import type { Meta, StoryObj } from '@storybook/react'
import DashboardShell from '../components/DashboardShell'

const meta: Meta<typeof DashboardShell> = {
  title: 'App/DashboardShell',
  component: DashboardShell
}

export default meta
type Story = StoryObj<typeof DashboardShell>

export const Default: Story = {
  args: { children: <div className="p-4">Dashboard content</div> }
}
