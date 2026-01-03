import './globals.css'

export const metadata = {
  title: 'AutoLearnPro',
  description: 'Competency-based automotive and diesel training',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
