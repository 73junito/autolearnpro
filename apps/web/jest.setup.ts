import '@testing-library/jest-dom/extend-expect'
import 'whatwg-fetch'

// Silence Jest console noise for act() warnings in some React versions
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (/(Warning: An update to .* inside a test was not wrapped in act\(\))/i.test(String(args[0]))) {
      return
    }
    originalError(...args)
  }
})
afterAll(() => {
  console.error = originalError
})
