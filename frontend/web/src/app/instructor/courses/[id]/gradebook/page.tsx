'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'

interface GradebookEntry {
  user_id: number
  email: string
  full_name: string
  status: string
  progress_percentage: number
  assessment_attempts: Array<{
    assessment_id: number
    assessment_title: string
    attempt_id: number
    score: number
    percentage: number
    status: string
    submitted_at: string
    attempt_number: number
    feedback: string
    time_spent_minutes: number
  }>
}

interface GradingQueueItem {
  attempt_id: number
  full_name: string
  email: string
  assessment_title: string
  submitted_at: string
  attempt_number: number
  hours_waiting: number
}

export default function GradebookPage() {
  const params = useParams()
  const courseId = params.id as string

  const [gradebook, setGradebook] = useState<GradebookEntry[]>([])
  const [gradingQueue, setGradingQueue] = useState<GradingQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'gradebook' | 'grading-queue'>('gradebook')
  const [includeDropped, setIncludeDropped] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<GradebookEntry | null>(null)
  const [editingGrade, setEditingGrade] = useState<{ attemptId: number; score: number; feedback: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [courseId, includeDropped])

  const loadData = async () => {
    try {
      setLoading(true)
      const [gradebookData, queueData] = await Promise.all([
        api.getCourseGradebook(courseId, includeDropped),
        api.getGradingQueue(courseId)
      ])
      setGradebook(gradebookData)
      setGradingQueue(queueData)
    } catch (error) {
      console.error('Error loading gradebook:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleExportCSV = async () => {
    try {
      const blob = await api.exportGradebookCSV(courseId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gradebook_course_${courseId}_${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error exporting gradebook:', error)
      alert('Failed to export gradebook')
    }
  }

  const handleUpdateGrade = async () => {
    if (!editingGrade) return

    try {
      await api.updateGrade(editingGrade.attemptId.toString(), {
        score: editingGrade.score,
        feedback: editingGrade.feedback,
        status: 'graded'
      })
      setEditingGrade(null)
      loadData()
      alert('Grade updated successfully')
    } catch (error) {
      console.error('Error updating grade:', error)
      alert('Failed to update grade')
    }
  }

  const getAssessmentScore = (student: GradebookEntry, assessmentId: number) => {
    const attempts = student.assessment_attempts.filter(a => a.assessment_id === assessmentId)
    if (attempts.length === 0) return null
    
    // Return the latest attempt
    return attempts.sort((a, b) => b.attempt_number - a.attempt_number)[0]
  }

  const getAllAssessments = () => {
    const assessmentMap = new Map()
    gradebook.forEach(student => {
      student.assessment_attempts.forEach(attempt => {
        if (!assessmentMap.has(attempt.assessment_id)) {
          assessmentMap.set(attempt.assessment_id, {
            id: attempt.assessment_id,
            title: attempt.assessment_title
          })
        }
      })
    })
    return Array.from(assessmentMap.values()).sort((a, b) => a.id - b.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading gradebook...</p>
        </div>
      </div>
    )
  }

  const assessments = getAllAssessments()

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gradebook</h1>
            <p className="mt-2 text-gray-600">Manage student grades and assessments</p>
          </div>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            📊 Export CSV
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('gradebook')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'gradebook'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Gradebook ({gradebook.length} students)
            </button>
            <button
              onClick={() => setActiveTab('grading-queue')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'grading-queue'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Grading Queue
              {gradingQueue.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-800 rounded-full">
                  {gradingQueue.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Gradebook Tab */}
        {activeTab === 'gradebook' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Student Grades</h2>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeDropped}
                  onChange={(e) => setIncludeDropped(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-600">Include dropped students</span>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Progress
                    </th>
                    {assessments.map(assessment => (
                      <th key={assessment.id} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {assessment.title}
                      </th>
                    ))}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {gradebook.map((student) => (
                    <tr key={student.user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white">
                        <div className="text-sm font-medium text-gray-900">{student.full_name}</div>
                        <div className="text-sm text-gray-500">{student.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          student.status === 'enrolled' ? 'bg-blue-100 text-blue-800' :
                          student.status === 'completed' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {student.progress_percentage}%
                      </td>
                      {assessments.map(assessment => {
                        const attempt = getAssessmentScore(student, assessment.id)
                        return (
                          <td key={assessment.id} className="px-6 py-4 whitespace-nowrap text-sm">
                            {attempt ? (
                              <div className="flex flex-col">
                                <span className={`font-semibold ${
                                  attempt.percentage >= 70 ? 'text-green-600' : 'text-red-600'
                                }`}>
                                  {attempt.percentage.toFixed(1)}%
                                </span>
                                <span className="text-xs text-gray-500">
                                  {attempt.score} pts
                                </span>
                                {attempt.status === 'submitted' && (
                                  <span className="text-xs text-orange-600 font-semibold">Needs grading</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => setSelectedStudent(student)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Grading Queue Tab */}
        {activeTab === 'grading-queue' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Manual Grading Queue</h2>
              <p className="text-sm text-gray-600 mt-1">Assessments with short answer questions requiring manual review</p>
            </div>

            {gradingQueue.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500 text-lg">✅ All caught up! No submissions need grading.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assessment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waiting Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempt</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {gradingQueue.map((item) => (
                      <tr key={item.attempt_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{item.full_name}</div>
                          <div className="text-sm text-gray-500">{item.email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">{item.assessment_title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {new Date(item.submitted_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            item.hours_waiting > 48 ? 'bg-red-100 text-red-800' :
                            item.hours_waiting > 24 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {item.hours_waiting.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          #{item.attempt_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setEditingGrade({ attemptId: item.attempt_id, score: 0, feedback: '' })}
                            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-xs font-medium"
                          >
                            Grade Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Student Detail Modal */}
        {selectedStudent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h2 className="text-xl font-semibold">{selectedStudent.full_name} - Detailed Grades</h2>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4 pb-4 border-b">
                  <div>
                    <span className="text-sm text-gray-500">Email:</span>
                    <p className="font-medium">{selectedStudent.email}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Status:</span>
                    <p className="font-medium capitalize">{selectedStudent.status}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Progress:</span>
                    <p className="font-medium">{selectedStudent.progress_percentage}%</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Assessments Completed:</span>
                    <p className="font-medium">{selectedStudent.assessment_attempts.length}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Assessment History</h3>
                  <div className="space-y-3">
                    {selectedStudent.assessment_attempts.map((attempt, idx) => (
                      <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-gray-900">{attempt.assessment_title}</h4>
                            <p className="text-sm text-gray-500">Attempt #{attempt.attempt_number}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${attempt.percentage >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                              {attempt.percentage.toFixed(1)}%
                            </p>
                            <p className="text-sm text-gray-500">{attempt.score} points</p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">Status:</span>
                            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              attempt.status === 'passed' ? 'bg-green-100 text-green-800' :
                              attempt.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {attempt.status}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Time Spent:</span>
                            <span className="ml-2 font-medium">{attempt.time_spent_minutes} min</span>
                          </div>
                        </div>
                        {attempt.submitted_at && (
                          <p className="text-xs text-gray-500 mt-2">
                            Submitted: {new Date(attempt.submitted_at).toLocaleString()}
                          </p>
                        )}
                        {attempt.feedback && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                            <span className="font-medium text-blue-900">Feedback:</span>
                            <p className="text-blue-800 mt-1">{attempt.feedback}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Grade Editing Modal */}
        {editingGrade && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">Grade Assessment</h2>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Score</label>
                  <input
                    type="number"
                    value={editingGrade.score}
                    onChange={(e) => setEditingGrade({ ...editingGrade, score: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Enter score"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Feedback</label>
                  <textarea
                    value={editingGrade.feedback}
                    onChange={(e) => setEditingGrade({ ...editingGrade, feedback: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 h-32"
                    placeholder="Provide feedback to the student..."
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                <button
                  onClick={() => setEditingGrade(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateGrade}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Save Grade
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
