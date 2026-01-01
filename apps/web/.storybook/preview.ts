import '../app/globals.css'
import { initialize, mswDecorator } from 'msw-storybook-addon'

initialize()

export const decorators = [mswDecorator]

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  a11y: { element: '#root' }
}
