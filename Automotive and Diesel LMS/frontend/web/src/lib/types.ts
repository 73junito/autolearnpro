export interface User {
  id: string
  email: string
  full_name: string
  role: 'student' | 'instructor' | 'admin'
  inserted_at?: string
  updated_at?: string
}

export interface Course {
  id: string
  title: string
  code: string
  description: string
  duration_hours?: number
  difficulty_level?: string
  prerequisites?: string
  learning_objectives?: string
  instructor_id?: string
  status?: string
  inserted_at?: string
  updated_at?: string
}

export interface Enrollment {
  id: string
  user_id: string
  course_id: string
  status: string
  progress_percentage?: number
  enrolled_at?: string
  completed_at?: string
  course?: Course
}

export interface Module {
  id: string
  course_id: string
  title: string
  description?: string
  order_index: number
  duration_minutes?: number
}

export interface Lesson {
  id: string
  module_id: string
  title: string
  content?: string
  lesson_type: string
  order_index: number
  duration_minutes?: number
}

export interface Assessment {
  id: string
  course_id: string
  title: string
  description?: string
  assessment_type: string
  passing_score: number
  max_attempts: number
  time_limit_minutes?: number
}

export interface Progress {
  id: string
  user_id: string
  lesson_id: string
  status: string
  completion_percentage: number
  last_accessed_at?: string
}

// Analytics Types
export interface EnrollmentStats {
  total_enrollments: number
  active_enrollments: number
  completed_enrollments: number
  dropped_enrollments: number
  avg_progress_percentage: number
  enrollments_last_30_days: number
  enrollments_last_7_days: number
  completion_rate: number
}

export interface ModuleCompletion {
  module_id: number
  module_title: string
  order_index: number
  enrolled_students: number
  students_completed: number
  completion_percentage: number
}

export interface AssessmentPerformance {
  assessment_id: number
  assessment_title: string
  assessment_type: string
  students_attempted: number
  total_attempts: number
  avg_score: number
  avg_time_minutes: number
  passed_count: number
  failed_count: number
  pass_rate: number
}

export interface EngagementMetrics {
  total_students: number
  active_students: number
  active_last_7_days: number
  active_last_30_days: number
  avg_lessons_per_student: number
  avg_assessments_per_student: number
  avg_hours_per_student: number
  engagement_rate: number
}

export interface ModuleProgress {
  module_id: number
  module_title: string
  total_lessons: number
  lessons_completed: number
  students_started: number
  avg_score: number
  avg_time_minutes: number
}

export interface TimeMetrics {
  hourly_distribution: Record<string, number>
  daily_distribution: Record<string, number>
}

export interface CourseAnalytics {
  enrollment_stats: EnrollmentStats
  completion_rates: ModuleCompletion[]
  assessment_performance: AssessmentPerformance[]
  engagement_metrics: EngagementMetrics
  module_progress: ModuleProgress[]
  time_metrics: TimeMetrics
}

export interface StudentProgress {
  user_id: number
  email: string
  full_name: string
  enrolled_at: string
  status: string
  progress_percentage: number
  completed_at: string | null
  lessons_completed: number
  assessments_taken: number
  avg_assessment_score: number
  total_time_hours: number
  last_activity: string
}

export interface GradeDistribution {
  grade: string
  count: number
  percentage: number
}

export interface TrendMetric {
  current: number
  previous: number
  trend: number
}

export interface TrendingMetrics {
  enrollments: TrendMetric
  completions: TrendMetric
  drops: TrendMetric
}
