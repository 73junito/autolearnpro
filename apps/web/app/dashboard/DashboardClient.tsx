"use client"
import { useEffect, useState } from 'react'
import Dashboard, { EnrollmentData } from '../../components/Dashboard'

export default function DashboardClient() {
  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch('/api/enrollments')
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        setEnrollments(data)
      })
      .catch(() => setEnrollments([]))
      .finally(() => setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  if (loading) return <div className="p-6">Loading...</div>

  return <Dashboard enrollments={enrollments} />
}
