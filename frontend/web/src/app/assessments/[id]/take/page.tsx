'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Question {
  id: number
  question_text: string
  question_type: string
  options: string[]
  points: number
  position: number
}

interface Assessment {
  id: number
  title: string
  description: string
  assessment_type: string
  total_points: number
  passing_score: number
  time_limit_minutes: number | null
  instructions: string
  max_attempts: number
  questions: Question[]
}

interface AssessmentAttempt {
  id: number
  assessment_id: number
  attempt_number: number
  started_at: string
  status: string
}

export default function TakeAssessmentPage() {
  const params = useParams()
  const router = useRouter()
  const assessmentId = params.id as string

  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null)
  const [answers, setAnswers] = useState<Record<number, any>>({})
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    loadAssessment()
  }, [assessmentId])

  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 1) {
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeRemaining])

  const loadAssessment = async () => {
    try {
      setLoading(true)
      // Fetch assessment details
      const assessmentData = await api.request<any>(`/assessments/${assessmentId}`)
      setAssessment(assessmentData.data)

      // Start a new attempt
      const attemptData = await api.request<any>(`/assessments/${assessmentId}/start`, {
        method: 'POST'
      })
      setAttempt(attemptData.data)

      // Set timer if there's a time limit
      if (assessmentData.data.time_limit_minutes) {
        setTimeRemaining(assessmentData.data.time_limit_minutes * 60)
      }
    } catch (error) {
      console.error('Error loading assessment:', error)
      alert('Failed to start assessment. You may have exceeded the maximum attempts.')
      router.back()
    } finally {
      setLoading(false)
    }
  }

  const handleAnswerChange = (questionId: number, answer: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }))
  }

  const handleAutoSubmit = async () => {
    if (!submitting) {
      alert('Time is up! Submitting your assessment automatically.')
      await handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (submitting) return

    const unanswered = assessment?.questions.filter(q => !answers[q.id])
    if (unanswered && unanswered.length > 0 && !showReview) {
      if (!confirm(`You have ${unanswered.length} unanswered questions. Submit anyway?`)) {
        return
      }
    }

    try {
      setSubmitting(true)
      await api.request(`/assessment-attempts/${attempt?.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers })
      })
      router.push(`/assessments/${assessmentId}/results`)
    } catch (error) {
      console.error('Error submitting assessment:', error)
      alert('Failed to submit assessment')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgress = () => {
    if (!assessment) return 0
    const answered = Object.keys(answers).length
    return (answered / assessment.questions.length) * 100
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading assessment...</p>
        </div>
      </div>
    )
  }

  if (!assessment || !attempt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Assessment not found</p>
      </div>
    )
  }

  const currentQuestion = assessment.questions[currentQuestionIndex]
  const isLastQuestion = currentQuestionIndex === assessment.questions.length - 1
  const isFirstQuestion = currentQuestionIndex === 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Fixed on mobile */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1">
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{assessment.title}</h1>
              <p className="text-sm text-gray-500">
                Question {currentQuestionIndex + 1} of {assessment.questions.length}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {timeRemaining !== null && (
                <div className={`px-3 py-2 rounded-md font-semibold text-sm ${
                  timeRemaining < 300 ? 'bg-red-100 text-red-800' :
                  timeRemaining < 600 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  ⏱️ {formatTime(timeRemaining)}
                </div>
              )}
              <button
                onClick={() => setShowReview(!showReview)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium whitespace-nowrap"
              >
                {showReview ? 'Hide' : 'Review'} ({Object.keys(answers).length}/{assessment.questions.length})
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgress()}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {!showReview ? (
          <div className="bg-white rounded-lg shadow-md p-6 sm:p-8">
            {/* Question */}
            <div className="mb-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-sm">
                  {currentQuestionIndex + 1}
                </span>
                <div className="flex-1">
                  <h2 className="text-lg sm:text-xl font-medium text-gray-900 leading-relaxed">
                    {currentQuestion.question_text}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{currentQuestion.points} points</p>
                </div>
              </div>
            </div>

            {/* Answer Options */}
            <div className="mb-8">
              {currentQuestion.question_type === 'multiple_choice' && (
                <div className="space-y-3">
                  {currentQuestion.options.map((option, idx) => (
                    <label
                      key={idx}
                      className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-all touch-manipulation
                        ${answers[currentQuestion.id] === option 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={option}
                        checked={answers[currentQuestion.id] === option}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        className="mt-1 flex-shrink-0 w-5 h-5"
                      />
                      <span className="ml-3 text-base sm:text-lg text-gray-800 flex-1">{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {currentQuestion.question_type === 'true_false' && (
                <div className="space-y-3">
                  {['True', 'False'].map((option) => (
                    <label
                      key={option}
                      className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all touch-manipulation
                        ${answers[currentQuestion.id] === option 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentQuestion.id}`}
                        value={option}
                        checked={answers[currentQuestion.id] === option}
                        onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                        className="w-5 h-5"
                      />
                      <span className="ml-3 text-lg font-medium text-gray-800">{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {currentQuestion.question_type === 'short_answer' && (
                <textarea
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-base sm:text-lg resize-none touch-manipulation"
                  rows={6}
                  placeholder="Enter your answer here..."
                />
              )}

              {currentQuestion.question_type === 'essay' && (
                <textarea
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-base sm:text-lg resize-none touch-manipulation"
                  rows={10}
                  placeholder="Write your essay here..."
                />
              )}
            </div>

            {/* Navigation - Touch-friendly */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                disabled={isFirstQuestion}
                className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base sm:text-lg transition-colors touch-manipulation"
              >
                ← Previous
              </button>
              
              {!isLastQuestion ? (
                <button
                  onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                  className="flex-1 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-base sm:text-lg transition-colors touch-manipulation"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-base sm:text-lg transition-colors touch-manipulation"
                >
                  {submitting ? 'Submitting...' : 'Submit Assessment'}
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Review Mode */
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Review Your Answers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
              {assessment.questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentQuestionIndex(idx)
                    setShowReview(false)
                  }}
                  className={`p-4 rounded-lg font-medium transition-all touch-manipulation
                    ${answers[q.id] 
                      ? 'bg-green-100 text-green-800 border-2 border-green-500' 
                      : 'bg-gray-100 text-gray-600 border-2 border-gray-300'
                    } hover:scale-105`}
                >
                  {idx + 1}
                  <div className="text-xs mt-1">
                    {answers[q.id] ? '✓ Answered' : '○ Unanswered'}
                  </div>
                </button>
              ))}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowReview(false)}
                className="flex-1 px-6 py-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium touch-manipulation"
              >
                Continue Answering
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium touch-manipulation"
              >
                {submitting ? 'Submitting...' : 'Submit Assessment'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructions Modal - Show on Load */}
      {assessment.instructions && (
        <div className="fixed bottom-4 right-4 z-20">
          <button
            onClick={() => alert(assessment.instructions)}
            className="px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 font-medium touch-manipulation"
          >
            📋 Instructions
          </button>
        </div>
      )}
    </div>
  )
}
