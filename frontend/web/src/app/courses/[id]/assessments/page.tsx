'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Assessment {
  id: number
  title: string
  description: string
  assessment_type: string
  total_points: number
  passing_score: number
  time_limit_minutes: number | null
  max_attempts: number
  is_published: boolean
  due_date: string | null
}

export default function CourseAssessmentsPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAssessments()
  }, [courseId])

  const loadAssessments = async () => {
    try {
      setLoading(true)
      const data = await api.request<any>(`/courses/${courseId}/assessments`)
      setAssessments(data.data || data)
    } catch (error) {
      console.error('Error loading assessments:', error)
    } finally {
      setLoading(false)
    }
  }

  const getAssessmentIcon = (type: string) => {
    switch (type) {
      case 'quiz': return '📝'
      case 'exam': return '📋'
      case 'assignment': return '📄'
      default: return '📚'
    }
  }

  const getDueStatus = (dueDate: string | null) => {
    if (!dueDate) return null
    
    const due = new Date(dueDate)
    const now = new Date()
    const hoursRemaining = (due.getTime() - now.getTime()) / (1000 * 60 * 60)

    if (hoursRemaining < 0) return { text: 'Overdue', color: 'bg-red-100 text-red-800' }
    if (hoursRemaining < 24) return { text: `Due in ${Math.floor(hoursRemaining)}h`, color: 'bg-red-100 text-red-800' }
    if (hoursRemaining < 72) return { text: 'Due soon', color: 'bg-yellow-100 text-yellow-800' }
    return { text: 'Upcoming', color: 'bg-green-100 text-green-800' }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading assessments...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800 mb-3 font-medium"
          >
            ← Back to Course
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Assessments & Quizzes</h1>
          <p className="mt-2 text-gray-600">Test your knowledge and track your progress</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {assessments.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Assessments Available</h2>
            <p className="text-gray-600">Check back later for quizzes and exams</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {assessments
              .filter(a => a.is_published)
              .map((assessment) => {
                const dueStatus = getDueStatus(assessment.due_date)
                
                return (
                  <div
                    key={assessment.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => router.push(`/assessments/${assessment.id}/take`)}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start gap-3">
                          <span className="text-4xl flex-shrink-0">{getAssessmentIcon(assessment.assessment_type)}</span>
                          <div>
                            <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-1">
                              {assessment.title}
                            </h3>
                            <p className="text-sm text-gray-600 capitalize">{assessment.assessment_type}</p>
                          </div>
                        </div>
                        {dueStatus && (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${dueStatus.color}`}>
                            {dueStatus.text}
                          </span>
                        )}
                      </div>

                      {assessment.description && (
                        <p className="text-gray-700 mb-4 line-clamp-2">{assessment.description}</p>
                      )}

                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div className="flex flex-col">
                          <span className="text-gray-500">Total Points</span>
                          <span className="font-semibold text-gray-900">{assessment.total_points}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500">Passing Score</span>
                          <span className="font-semibold text-gray-900">{assessment.passing_score}%</span>
                        </div>
                        {assessment.time_limit_minutes && (
                          <div className="flex flex-col">
                            <span className="text-gray-500">Time Limit</span>
                            <span className="font-semibold text-gray-900">{assessment.time_limit_minutes} min</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-gray-500">Max Attempts</span>
                          <span className="font-semibold text-gray-900">
                            {assessment.max_attempts === 999 ? 'Unlimited' : assessment.max_attempts}
                          </span>
                        </div>
                      </div>

                      {assessment.due_date && (
                        <div className="text-sm text-gray-600 mb-4">
                          Due: {new Date(assessment.due_date).toLocaleDateString(undefined, { 
                            weekday: 'short', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/assessments/${assessment.id}/take`)
                        }}
                        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors touch-manipulation"
                      >
                        Start Assessment
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
