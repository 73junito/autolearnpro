defmodule LmsApiWeb.GradebookController do
  use LmsApiWeb, :controller

  alias LmsApi.Gradebook
  alias LmsApi.Catalog

  @doc """
  Get gradebook for a specific course.
  GET /api/instructor/courses/:course_id/gradebook
  """
  def course_gradebook(conn, %{"course_id" => course_id} = params) do
    course_id = String.to_integer(course_id)
    include_dropped = Map.get(params, "include_dropped", "false") == "true"

    gradebook = Gradebook.get_course_gradebook(course_id, include_dropped: include_dropped)

    json(conn, %{
      course_id: course_id,
      gradebook: gradebook,
      student_count: length(gradebook)
    })
  end

  @doc """
  Get manual grading queue for a course.
  GET /api/instructor/courses/:course_id/grading-queue
  """
  def grading_queue(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    queue = Gradebook.get_manual_grading_queue(course_id)

    json(conn, %{
      course_id: course_id,
      queue: queue,
      count: length(queue)
    })
  end

  @doc """
  Get grading queue for a specific assessment.
  GET /api/instructor/assessments/:assessment_id/grading-queue
  """
  def assessment_grading_queue(conn, %{"assessment_id" => assessment_id} = params) do
    assessment_id = String.to_integer(assessment_id)
    status = Map.get(params, "status", "submitted")

    queue = Gradebook.get_assessment_grading_queue(assessment_id, status)

    json(conn, %{
      assessment_id: assessment_id,
      queue: queue,
      count: length(queue)
    })
  end

  @doc """
  Update grade for a specific assessment attempt.
  PUT /api/instructor/assessment-attempts/:attempt_id/grade
  """
  def update_grade(conn, %{"attempt_id" => attempt_id, "grade" => grade_data}) do
    attempt_id = String.to_integer(attempt_id)

    case Gradebook.update_grade(attempt_id, grade_data) do
      {:ok, attempt} ->
        json(conn, %{
          success: true,
          attempt: %{
            id: attempt.id,
            score: attempt.score,
            percentage: attempt.percentage,
            status: attempt.status,
            feedback: attempt.feedback
          }
        })
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Failed to update grade", details: changeset.errors})
    end
  end

  @doc """
  Bulk update grades.
  POST /api/instructor/grades/bulk-update
  Body: { "updates": [{ "attempt_id": 123, "updates": {...} }, ...] }
  """
  def bulk_update(conn, %{"updates" => updates}) do
    result = Gradebook.bulk_update_grades(updates)

    json(conn, %{
      success_count: result.success_count,
      failure_count: result.failure_count,
      failures: result.failures
    })
  end

  @doc """
  Export gradebook to CSV.
  GET /api/instructor/courses/:course_id/gradebook/export
  """
  def export_csv(conn, %{"course_id" => course_id}) do
    course_id = String.to_integer(course_id)

    case Gradebook.export_gradebook_csv(course_id) do
      {:ok, csv_content} ->
        course = Catalog.get_course(course_id)
        filename = "gradebook_#{course.code}_#{Date.utc_today()}.csv"

        conn
        |> put_resp_content_type("text/csv")
        |> put_resp_header("content-disposition", "attachment; filename=\"#{filename}\"")
        |> send_resp(200, csv_content)

      {:error, reason} ->
        conn
        |> put_status(:internal_server_error)
        |> json(%{error: "Failed to export gradebook", reason: reason})
    end
  end

  @doc """
  Calculate final grade for a student.
  GET /api/instructor/students/:user_id/courses/:course_id/final-grade
  """
  def final_grade(conn, %{"user_id" => user_id, "course_id" => course_id}) do
    user_id = String.to_integer(user_id)
    course_id = String.to_integer(course_id)

    final_grade = Gradebook.calculate_final_grade(user_id, course_id)

    json(conn, %{
      user_id: user_id,
      course_id: course_id,
      final_grade: final_grade
    })
  end

  @doc """
  Get grade statistics for an assessment.
  GET /api/instructor/assessments/:assessment_id/grade-stats
  """
  def grade_stats(conn, %{"assessment_id" => assessment_id}) do
    assessment_id = String.to_integer(assessment_id)

    stats = Gradebook.get_assessment_grade_stats(assessment_id)

    json(conn, %{
      assessment_id: assessment_id,
      stats: stats
    })
  end
end
