defmodule LmsApiWeb.AnalyticsController do
  use LmsApiWeb, :controller

  alias LmsApi.Analytics
  alias LmsApi.Catalog

  @doc """
  Get comprehensive analytics for a specific course.
  GET /api/instructor/courses/:course_id/analytics
  """
  def course_analytics(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    # Verify course exists
    case Catalog.get_course(course_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "Course not found"})

      course ->
        analytics = Analytics.get_course_analytics(course_id)

        json(conn, %{
          course_id: course_id,
          course_title: course.title,
          analytics: analytics
        })
    end
  end

  @doc """
  Get student list with progress for a course.
  GET /api/instructor/courses/:course_id/students
  Query params: limit, offset, sort_by, sort_order
  """
  def student_list(conn, %{"course_id" => course_id} = params) do
    course_id = String.to_integer(course_id)

    opts = [
      limit: Map.get(params, "limit", "100") |> String.to_integer(),
      offset: Map.get(params, "offset", "0") |> String.to_integer(),
      sort_by: Map.get(params, "sort_by", "enrolled_at"),
      sort_order: Map.get(params, "sort_order", "DESC")
    ]

    students = Analytics.get_student_list(course_id, opts)

    json(conn, %{
      course_id: course_id,
      students: students,
      count: length(students)
    })
  end

  @doc """
  Get grade distribution for an assessment.
  GET /api/instructor/assessments/:assessment_id/grade-distribution
  """
  def grade_distribution(conn, %{"assessment_id" => assessment_id}) do
    assessment_id = String.to_integer(assessment_id)

    distribution = Analytics.get_grade_distribution(assessment_id)

    json(conn, %{
      assessment_id: assessment_id,
      distribution: distribution
    })
  end

  @doc """
  Get trending metrics for a course.
  GET /api/instructor/courses/:course_id/trends
  """
  def trending_metrics(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    trends = Analytics.get_trending_metrics(course_id)

    json(conn, %{
      course_id: course_id,
      trends: trends
    })
  end

  @doc """
  Get enrollment statistics for a course.
  GET /api/instructor/courses/:course_id/enrollment-stats
  """
  def enrollment_stats(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    stats = Analytics.get_enrollment_stats(course_id)

    json(conn, %{
      course_id: course_id,
      enrollment_stats: stats
    })
  end

  @doc """
  Get assessment performance for a course.
  GET /api/instructor/courses/:course_id/assessment-performance
  """
  def assessment_performance(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    performance = Analytics.get_assessment_performance(course_id)

    json(conn, %{
      course_id: course_id,
      assessment_performance: performance
    })
  end
end
