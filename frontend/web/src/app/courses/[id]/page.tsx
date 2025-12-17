'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'
import { api } from '@/lib/api'
import type { Course } from '@/lib/types'

export default function CourseDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user, loading: authLoading } = useAuth()
  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
      return
    }

    if (user && params.id) {
      loadCourse(params.id as string)
    }
  }, [user, authLoading, params.id, router])

  const loadCourse = async (courseId: string) => {
    try {
      setLoading(true)
      const data = await api.getCourse(courseId)
      setCourse(data)
    } catch (err: any) {
      setError('Failed to load course details')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEnroll = async () => {
    if (!course) return
    
    try {
      await api.enrollInCourse(course.id)
      alert('Successfully enrolled!')
      router.push('/dashboard')
    } catch (err: any) {
      alert(err.message || 'Failed to enroll')
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{error || 'Course not found'}</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="p-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{course.title}</h1>
              
              <div className="flex gap-4 mb-6 text-sm text-gray-600">
                <span className="flex items-center">
                  📚 Code: {course.code}
                </span>
                <span className="flex items-center">
                  ⏱️ Duration: {course.duration_hours || 0} hours
                </span>
                <span className="flex items-center">
                  📈 Level: {course.difficulty_level || 'Beginner'}
                </span>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Description</h2>
                <p className="text-gray-700">{course.description}</p>
              </div>

              {course.prerequisites && (
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Prerequisites</h2>
                  <p className="text-gray-700">{course.prerequisites}</p>
                </div>
              )}

              {course.learning_objectives && (
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">Learning Objectives</h2>
                  <p className="text-gray-700">{course.learning_objectives}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={handleEnroll}
                  className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  Enroll in Course
                </button>
                <button
                  onClick={() => router.back()}
                  className="px-8 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
