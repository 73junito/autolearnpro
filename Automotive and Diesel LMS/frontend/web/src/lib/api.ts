const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

class ApiClient {
  private getAuthHeader(): HeadersInit {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    return token ? { 'Authorization': `Bearer ${token}` } : {}
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    const headers = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(error.error || error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // Auth endpoints
  async login(email: string, password: string) {
    const response = await this.request<any>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    return {
      token: response.token || response.data?.token,
      user: response.data || response.user,
    }
  }

  async register(userData: { email: string; password: string; full_name: string; role: string }) {
    const response = await this.request<any>('/register', {
      method: 'POST',
      body: JSON.stringify({ user: userData }),
    })
    return {
      token: response.token || response.data?.token,
      user: response.data || response.user,
    }
  }

  // Course endpoints
  async getCourses() {
    const response = await this.request<any>('/courses')
    return response.data || response
  }

  async getCourse(id: string) {
    const response = await this.request<any>(`/courses/${id}`)
    return response.data || response
  }

  // Enrollment endpoints
  async enrollInCourse(courseId: string) {
    const response = await this.request<any>(`/enroll/${courseId}`, {
      method: 'POST',
    })
    return response.data || response
  }

  async unenrollFromCourse(courseId: string) {
    await this.request(`/enroll/${courseId}`, {
      method: 'DELETE',
    })
  }

  async getMyEnrollments() {
    const response = await this.request<any>('/my-enrollments')
    return response.data || response
  }

  // Progress endpoints
  async updateProgress(lessonId: string, data: any) {
    const response = await this.request<any>(`/lessons/${lessonId}/progress`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    return response.data || response
  }

  // Analytics endpoints
  async getCourseAnalytics(courseId: string) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/analytics`)
    return response.analytics || response.data
  }

  async getStudentList(courseId: string, params?: { limit?: number; offset?: number; sort_by?: string; sort_order?: string }) {
    const queryParams = new URLSearchParams(params as any).toString()
    const endpoint = `/instructor/courses/${courseId}/students${queryParams ? `?${queryParams}` : ''}`
    const response = await this.request<any>(endpoint)
    return response.students || response.data
  }

  async getEnrollmentStats(courseId: string) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/enrollment-stats`)
    return response.enrollment_stats || response.data
  }

  async getAssessmentPerformance(courseId: string) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/assessment-performance`)
    return response.assessment_performance || response.data
  }

  async getTrendingMetrics(courseId: string) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/trends`)
    return response.trends || response.data
  }

  async getGradeDistribution(assessmentId: string) {
    const response = await this.request<any>(`/instructor/assessments/${assessmentId}/grade-distribution`)
    return response.distribution || response.data
  }

  // Gradebook endpoints
  async getCourseGradebook(courseId: string, includeDropped = false) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/gradebook?include_dropped=${includeDropped}`)
    return response.gradebook || response.data
  }

  async getGradingQueue(courseId: string) {
    const response = await this.request<any>(`/instructor/courses/${courseId}/grading-queue`)
    return response.queue || response.data
  }

  async getAssessmentGradingQueue(assessmentId: string, status = 'submitted') {
    const response = await this.request<any>(`/instructor/assessments/${assessmentId}/grading-queue?status=${status}`)
    return response.queue || response.data
  }

  async updateGrade(attemptId: string, gradeData: any) {
    const response = await this.request<any>(`/instructor/assessment-attempts/${attemptId}/grade`, {
      method: 'PUT',
      body: JSON.stringify({ grade: gradeData })
    })
    return response.attempt || response.data
  }

  async bulkUpdateGrades(updates: any[]) {
    const response = await this.request<any>('/instructor/grades/bulk-update', {
      method: 'POST',
      body: JSON.stringify({ updates })
    })
    return response
  }

  async exportGradebookCSV(courseId: string) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/instructor/courses/${courseId}/gradebook/export`
    
    const response = await fetch(url, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
    
    if (!response.ok) throw new Error('Export failed')
    
    const blob = await response.blob()
    return blob
  }

  async getFinalGrade(userId: string, courseId: string) {
    const response = await this.request<any>(`/instructor/students/${userId}/courses/${courseId}/final-grade`)
    return response.final_grade
  }

  async getGradeStats(assessmentId: string) {
    const response = await this.request<any>(`/instructor/assessments/${assessmentId}/grade-stats`)
    return response.stats || response.data
  }

  // Student assessment endpoints
  async getAssessment(assessmentId: string) {
    const response = await this.request<any>(`/assessments/${assessmentId}`)
    return response.data || response
  }

  async startAssessment(assessmentId: string) {
    const response = await this.request<any>(`/assessments/${assessmentId}/start`, {
      method: 'POST'
    })
    return response.data || response
  }

  async submitAssessment(attemptId: string, answers: Record<number, any>) {
    const response = await this.request<any>(`/assessment-attempts/${attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    })
    return response.data || response
  }

  async getMyAssessmentAttempts(assessmentId: string) {
    const response = await this.request<any>(`/assessments/${assessmentId}/my-attempts`)
    return response.data || response
  }
}

export const api = new ApiClient()

export default api
