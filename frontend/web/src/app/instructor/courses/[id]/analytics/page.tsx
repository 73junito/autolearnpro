'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { CourseAnalytics, StudentProgress, TrendingMetrics } from '@/lib/types'

export default function CourseAnalyticsPage() {
  const params = useParams()
  const courseId = params.id as string

  const [analytics, setAnalytics] = useState<CourseAnalytics | null>(null)
  const [students, setStudents] = useState<StudentProgress[]>([])
  const [trends, setTrends] = useState<TrendingMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'assessments' | 'engagement'>('overview')

  useEffect(() => {
    loadData()
  }, [courseId])

  const loadData = async () => {
    try {
      setLoading(true)
      const [analyticsData, studentsData, trendsData] = await Promise.all([
        api.getCourseAnalytics(courseId),
        api.getStudentList(courseId, { limit: 100 }),
        api.getTrendingMetrics(courseId)
      ])
      setAnalytics(analyticsData)
      setStudents(studentsData)
      setTrends(trendsData)
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">No analytics data available</p>
        </div>
      </div>
    )
  }

  const { enrollment_stats, completion_rates, assessment_performance, engagement_metrics, module_progress } = analytics

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Course Analytics Dashboard</h1>
          <p className="mt-2 text-gray-600">Comprehensive insights into student performance and engagement</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'students', label: 'Students' },
              { id: 'assessments', label: 'Assessments' },
              { id: 'engagement', label: 'Engagement' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Total Enrollments"
                value={enrollment_stats.total_enrollments}
                trend={trends?.enrollments.trend}
                subtitle={`${enrollment_stats.enrollments_last_7_days} this week`}
                icon="👥"
              />
              <MetricCard
                title="Completion Rate"
                value={`${enrollment_stats.completion_rate}%`}
                trend={trends?.completions.trend}
                subtitle={`${enrollment_stats.completed_enrollments} completed`}
                icon="✅"
              />
              <MetricCard
                title="Active Students"
                value={engagement_metrics.active_students}
                subtitle={`${engagement_metrics.engagement_rate}% engagement`}
                icon="🔥"
              />
              <MetricCard
                title="Avg Progress"
                value={`${enrollment_stats.avg_progress_percentage.toFixed(1)}%`}
                subtitle="Across all students"
                icon="📊"
              />
            </div>

            {/* Module Completion Rates */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Module Completion Rates</h2>
              <div className="space-y-4">
                {completion_rates.map((module) => (
                  <div key={module.module_id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">{module.module_title}</span>
                      <span className="text-sm text-gray-500">
                        {module.students_completed} / {module.enrolled_students} students
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${module.completion_percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500">{module.completion_percentage.toFixed(1)}% complete</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Enrollment Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Enrollment Status</h2>
                <div className="space-y-3">
                  <StatusBar label="Active" count={enrollment_stats.active_enrollments} total={enrollment_stats.total_enrollments} color="green" />
                  <StatusBar label="Completed" count={enrollment_stats.completed_enrollments} total={enrollment_stats.total_enrollments} color="blue" />
                  <StatusBar label="Dropped" count={enrollment_stats.dropped_enrollments} total={enrollment_stats.total_enrollments} color="red" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Engagement Metrics</h2>
                <div className="space-y-4">
                  <MetricRow label="Avg Lessons/Student" value={engagement_metrics.avg_lessons_per_student.toFixed(1)} />
                  <MetricRow label="Avg Assessments/Student" value={engagement_metrics.avg_assessments_per_student.toFixed(1)} />
                  <MetricRow label="Avg Hours/Student" value={engagement_metrics.avg_hours_per_student.toFixed(1)} />
                  <MetricRow label="Active Last 7 Days" value={engagement_metrics.active_last_7_days.toString()} />
                  <MetricRow label="Active Last 30 Days" value={engagement_metrics.active_last_30_days.toString()} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Student Progress</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lessons</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Activity</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr key={student.user_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{student.full_name}</div>
                        <div className="text-sm text-gray-500">{student.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={student.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${student.progress_percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-700">{student.progress_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{student.lessons_completed}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{student.avg_assessment_score.toFixed(1)}%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{student.total_time_hours}h</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {student.last_activity ? new Date(student.last_activity).toLocaleDateString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Assessments Tab */}
        {activeTab === 'assessments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MetricCard
                title="Total Assessments"
                value={assessment_performance.length}
                subtitle="Available assessments"
                icon="📝"
              />
              <MetricCard
                title="Avg Pass Rate"
                value={`${(assessment_performance.reduce((sum, a) => sum + a.pass_rate, 0) / assessment_performance.length || 0).toFixed(1)}%`}
                subtitle="Across all assessments"
                icon="✨"
              />
              <MetricCard
                title="Total Attempts"
                value={assessment_performance.reduce((sum, a) => sum + a.total_attempts, 0)}
                subtitle="By all students"
                icon="🎯"
              />
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold">Assessment Performance</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assessment</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Students</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Attempts</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pass Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {assessment_performance.map((assessment) => (
                      <tr key={assessment.assessment_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{assessment.assessment_title}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">{assessment.assessment_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{assessment.students_attempted}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{assessment.total_attempts}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{assessment.avg_score.toFixed(1)}%</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                            assessment.pass_rate >= 80 ? 'bg-green-100 text-green-800' :
                            assessment.pass_rate >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {assessment.pass_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{assessment.avg_time_minutes.toFixed(0)} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Engagement Tab */}
        {activeTab === 'engagement' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Module Activity</h2>
                <div className="space-y-4">
                  {module_progress.map((module) => (
                    <div key={module.module_id} className="border-b border-gray-200 pb-4 last:border-0">
                      <h3 className="font-medium text-gray-900 mb-2">{module.module_title}</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Students Started:</span>
                          <span className="ml-2 font-medium">{module.students_started}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Avg Score:</span>
                          <span className="ml-2 font-medium">{module.avg_score.toFixed(1)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Lessons Completed:</span>
                          <span className="ml-2 font-medium">{module.lessons_completed} / {module.total_lessons}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Avg Time:</span>
                          <span className="ml-2 font-medium">{module.avg_time_minutes.toFixed(0)} min</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Activity Trends</h2>
                <div className="space-y-4">
                  {trends && (
                    <>
                      <TrendCard
                        label="New Enrollments (7 days)"
                        current={trends.enrollments.current}
                        previous={trends.enrollments.previous}
                        trend={trends.enrollments.trend}
                      />
                      <TrendCard
                        label="Completions (7 days)"
                        current={trends.completions.current}
                        previous={trends.completions.previous}
                        trend={trends.completions.trend}
                      />
                      <TrendCard
                        label="Drops (7 days)"
                        current={trends.drops.current}
                        previous={trends.drops.previous}
                        trend={trends.drops.trend}
                        inverse
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper Components
function MetricCard({ title, value, trend, subtitle, icon }: { title: string; value: string | number; trend?: number; subtitle?: string; icon: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-sm font-semibold ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  const colorClasses = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    red: 'bg-red-500'
  }
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-500">{count} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${colorClasses[color as keyof typeof colorClasses]} h-2 rounded-full`} style={{ width: `${percentage}%` }}></div>
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600 text-sm">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    enrolled: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    dropped: 'bg-red-100 text-red-800'
  }
  
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

function TrendCard({ label, current, previous, trend, inverse = false }: { label: string; current: number; previous: number; trend: number; inverse?: boolean }) {
  const isPositive = inverse ? trend < 0 : trend >= 0
  
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-500 mb-2">{label}</h4>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-gray-900">{current}</p>
          <p className="text-xs text-gray-500 mt-1">Previous: {previous}</p>
        </div>
        <span className={`text-lg font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
