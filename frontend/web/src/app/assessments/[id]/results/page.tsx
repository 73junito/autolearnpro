'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface AttemptResult {
  id: number
  assessment_id: number
  attempt_number: number
  score: number
  percentage: number
  status: string
  submitted_at: string
  time_spent_minutes: number
  feedback: string | null
}

export default function AssessmentResultsPage() {
  const params = useParams()
  const router = useRouter()
  const assessmentId = params.id as string

  const [attempts, setAttempts] = useState<AttemptResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAttempts()
  }, [assessmentId])

  const loadAttempts = async () => {
    try {
      setLoading(true)
      const data = await api.getMyAssessmentAttempts(assessmentId)
      setAttempts(data)
    } catch (error) {
      console.error('Error loading attempts:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string, percentage: number) => {
    if (status === 'passed' || percentage >= 70) {
      return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">✓ Passed</span>
    } else if (status === 'failed' || (status === 'graded' && percentage < 70)) {
      return <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">✗ Failed</span>
    } else if (status === 'submitted') {
      return <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">⏳ Pending Review</span>
    } else {
      return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-semibold">{status}</span>
    }
  }

  const getScoreColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600'
    if (percentage >= 80) return 'text-blue-600'
    if (percentage >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading results...</p>
        </div>
      </div>
    )
  }

  const latestAttempt = attempts[0]
  const bestAttempt = attempts.reduce((best, current) => 
    current.percentage > best.percentage ? current : best, attempts[0]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800 mb-3 font-medium"
          >
            ← Back
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Assessment Results</h1>
          <p className="mt-2 text-gray-600">View your performance and attempt history</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Latest Attempt - Highlighted */}
        {latestAttempt && (
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-lg p-6 sm:p-8 border-2 border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Latest Attempt</h2>
              {getStatusBadge(latestAttempt.status, latestAttempt.percentage)}
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Score</p>
                <p className={`text-5xl font-bold ${getScoreColor(latestAttempt.percentage)}`}>
                  {latestAttempt.percentage.toFixed(1)}%
                </p>
                <p className="text-sm text-gray-600 mt-1">{latestAttempt.score} points</p>
              </div>

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Attempt</p>
                <p className="text-5xl font-bold text-gray-900">#{latestAttempt.attempt_number}</p>
                <p className="text-sm text-gray-600 mt-1">{latestAttempt.time_spent_minutes} minutes</p>
              </div>
            </div>

            {latestAttempt.feedback && (
              <div className="bg-white rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Instructor Feedback</h3>
                <p className="text-gray-700">{latestAttempt.feedback}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => router.push(`/courses/${latestAttempt.assessment_id}`)}
                className="flex-1 px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 font-medium transition-colors"
              >
                Back to Course
              </button>
              <button
                onClick={() => router.push(`/assessments/${assessmentId}/take`)}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* Statistics */}
        {attempts.length > 1 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Statistics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Total Attempts</p>
                <p className="text-2xl font-bold text-gray-900">{attempts.length}</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Best Score</p>
                <p className={`text-2xl font-bold ${getScoreColor(bestAttempt.percentage)}`}>
                  {bestAttempt.percentage.toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Avg Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length).toFixed(1)}%
                </p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Avg Time</p>
                <p className="text-2xl font-bold text-gray-900">
                  {Math.round(attempts.reduce((sum, a) => sum + a.time_spent_minutes, 0) / attempts.length)} min
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Attempt History */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Attempt History</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {attempts.map((attempt) => (
              <div key={attempt.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-gray-900">Attempt #{attempt.attempt_number}</span>
                      {getStatusBadge(attempt.status, attempt.percentage)}
                    </div>
                    <p className="text-sm text-gray-600">
                      Submitted: {new Date(attempt.submitted_at).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600">
                      Time spent: {attempt.time_spent_minutes} minutes
                    </p>
                  </div>
                  <div className="text-center sm:text-right">
                    <p className={`text-3xl font-bold ${getScoreColor(attempt.percentage)}`}>
                      {attempt.percentage.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600">{attempt.score} points</p>
                  </div>
                </div>
                {attempt.feedback && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-semibold text-blue-900 mb-1">Instructor Feedback:</p>
                    <p className="text-sm text-blue-800">{attempt.feedback}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
