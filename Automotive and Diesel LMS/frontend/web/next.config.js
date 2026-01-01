/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api',
  },
  output: 'standalone',
  // Add baseline security headers via the `headers` export.
  // Headers are applied only in production by default to avoid interfering with local dev.
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    // Basic, non-breaking CSP that allows inline styles (for legacy) and images/data URIs.
    const csp = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self';"
    return [
      {
        source: '/:path*',
        headers: [
          // Content Security Policy (basic)
          { key: 'Content-Security-Policy', value: csp },
          // Strict Transport Security — only meaningful on HTTPS; applied in prod
          { key: 'Strict-Transport-Security', value: isProd ? 'max-age=63072000; includeSubDomains; preload' : 'max-age=0' },
          // Cross-Origin-Opener-Policy for basic origin isolation
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Clickjacking mitigation
          { key: 'X-Frame-Options', value: 'DENY' },
          // Minimal Referrer Policy
          { key: 'Referrer-Policy', value: 'no-referrer-when-downgrade' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
