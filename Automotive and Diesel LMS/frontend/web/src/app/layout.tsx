import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/contexts/AuthContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'AutoLearnPro LMS',
    template: '%s | AutoLearnPro',
  },
  description: 'Professional Automotive and Diesel Learning Management System',
  openGraph: {
    title: 'AutoLearnPro LMS',
    description: 'Professional Automotive and Diesel Learning Management System',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
    siteName: 'AutoLearnPro',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'AutoLearnPro LMS',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AutoLearnPro LMS',
    description: 'Professional Automotive and Diesel Learning Management System',
    images: ['/og-image.svg'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/apple-touch-icon.svg',
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/styles/globals.css" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
