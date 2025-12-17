defmodule LmsApi.Gradebook do
  @moduledoc """
  The Gradebook context for managing grades, grading workflows, and grade exports.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Assessments.AssessmentAttempt
  alias LmsApi.Catalog.Course

  @doc """
  Get gradebook data for a specific course.
  Returns all students with their assessment attempts and grades.
  """
  def get_course_gradebook(course_id, opts \\ []) do
    include_dropped = Keyword.get(opts, :include_dropped, false)

    status_filter = if include_dropped do
      "WHERE e.course_id = $1"
    else
      "WHERE e.course_id = $1 AND e.status != 'dropped'"
    end

    query = """
    SELECT
      u.id as user_id,
      u.email,
      u.full_name,
      e.status,
      e.progress_percentage,
      json_agg(
        json_build_object(
          'assessment_id', a.id,
          'assessment_title', a.title,
          'attempt_id', aa.id,
          'score', aa.score,
          'percentage', aa.percentage,
          'status', aa.status,
          'submitted_at', aa.submitted_at,
          'attempt_number', aa.attempt_number,
          'feedback', aa.feedback,
          'time_spent_minutes', aa.time_spent_minutes
        ) ORDER BY a.id, aa.attempt_number DESC
      ) FILTER (WHERE aa.id IS NOT NULL) as assessment_attempts
    FROM enrollments e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN assessments a ON a.course_id = e.course_id
    LEFT JOIN assessment_attempts aa ON aa.assessment_id = a.id AND aa.user_id = u.id
    #{status_filter}
    GROUP BY u.id, u.email, u.full_name, e.status, e.progress_percentage
    ORDER BY u.full_name
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [user_id, email, name, status, progress, attempts] ->
          %{
            user_id: user_id,
            email: email,
            full_name: name,
            status: status,
            progress_percentage: progress || 0,
            assessment_attempts: attempts || []
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get detailed grading information for a specific assessment.
  Useful for manual grading workflows.
  """
  def get_assessment_grading_queue(assessment_id, status \\ "submitted") do
    query = """
    SELECT
      aa.id as attempt_id,
      aa.user_id,
      u.full_name,
      u.email,
      aa.attempt_number,
      aa.submitted_at,
      aa.status,
      aa.answers,
      aa.score,
      aa.percentage,
      aa.feedback,
      a.total_points,
      a.title as assessment_title
    FROM assessment_attempts aa
    JOIN users u ON u.id = aa.user_id
    JOIN assessments a ON a.id = aa.assessment_id
    WHERE aa.assessment_id = $1 AND aa.status = $2
    ORDER BY aa.submitted_at ASC
    """

    case Repo.query(query, [assessment_id, status]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [attempt_id, user_id, name, email, attempt_num, submitted_at,
                           status, answers, score, percentage, feedback, total_points, title] ->
          %{
            attempt_id: attempt_id,
            user_id: user_id,
            full_name: name,
            email: email,
            attempt_number: attempt_num,
            submitted_at: submitted_at,
            status: status,
            answers: answers,
            score: score,
            percentage: percentage,
            feedback: feedback,
            total_points: total_points,
            assessment_title: title
          }
        end)
      _ -> []
    end
  end

  @doc """
  Update grade for a specific assessment attempt.
  """
  def update_grade(attempt_id, attrs) do
    attempt = Repo.get!(AssessmentAttempt, attempt_id)

    changeset = AssessmentAttempt.changeset(attempt, attrs)

    case Repo.update(changeset) do
      {:ok, updated_attempt} ->
        # Optionally trigger notifications or grade calculations
        {:ok, updated_attempt}
      error ->
        error
    end
  end

  @doc """
  Bulk update grades for multiple assessment attempts.
  """
  def bulk_update_grades(grade_updates) do
    results = Enum.map(grade_updates, fn %{"attempt_id" => attempt_id, "updates" => updates} ->
      case update_grade(attempt_id, updates) do
        {:ok, attempt} -> {:ok, attempt}
        {:error, changeset} -> {:error, attempt_id, changeset}
      end
    end)

    successes = Enum.filter(results, fn
      {:ok, _} -> true
      _ -> false
    end)

    failures = Enum.filter(results, fn
      {:error, _, _} -> true
      _ -> false
    end)

    %{
      success_count: length(successes),
      failure_count: length(failures),
      failures: failures
    }
  end

  @doc """
  Export gradebook data to CSV format.
  """
  def export_gradebook_csv(course_id) do
    gradebook = get_course_gradebook(course_id)

    # Get list of all assessments for the course
    assessments_query = """
    SELECT id, title
    FROM assessments
    WHERE course_id = $1
    ORDER BY id
    """

    {:ok, %{rows: assessment_rows}} = Repo.query(assessments_query, [course_id])
    assessments = Enum.map(assessment_rows, fn [id, title] -> %{id: id, title: title} end)

    # Build CSV header
    header = ["Student Name", "Email", "Status", "Progress %"] ++
             Enum.flat_map(assessments, fn a -> ["#{a.title} Score", "#{a.title} %"] end)

    # Build CSV rows
    rows = Enum.map(gradebook, fn student ->
      base_data = [
        student.full_name,
        student.email,
        student.status,
        student.progress_percentage
      ]

      assessment_data = Enum.flat_map(assessments, fn assessment ->
        # Find the latest attempt for this assessment
        attempt = Enum.find(student.assessment_attempts, fn a ->
          a["assessment_id"] == assessment.id
        end)

        if attempt do
          [attempt["score"] || "", attempt["percentage"] || ""]
        else
          ["", ""]
        end
      end)

      base_data ++ assessment_data
    end)

    # Convert to CSV string
    csv_content = [header | rows]
    |> Enum.map(fn row -> Enum.join(row, ",") end)
    |> Enum.join("\n")

    {:ok, csv_content}
  end

  @doc """
  Calculate final grade for a student in a course.
  Uses weighted average based on assessment types.
  """
  def calculate_final_grade(user_id, course_id) do
    query = """
    SELECT
      a.assessment_type,
      AVG(aa.percentage) as avg_percentage,
      COUNT(aa.id) as attempt_count
    FROM assessments a
    LEFT JOIN assessment_attempts aa ON aa.assessment_id = a.id
      AND aa.user_id = $1
      AND aa.status IN ('passed', 'failed', 'graded')
    WHERE a.course_id = $2
    GROUP BY a.assessment_type
    """

    case Repo.query(query, [user_id, course_id]) do
      {:ok, %{rows: rows}} ->
        # Default weights (can be customized per course)
        weights = %{
          "quiz" => 0.2,
          "exam" => 0.5,
          "assignment" => 0.3
        }

        weighted_scores = Enum.reduce(rows, {0.0, 0.0}, fn [type, avg_pct, _count], {sum, weight_sum} ->
          if avg_pct do
            weight = Map.get(weights, type, 0.1)
            {sum + (avg_pct * weight), weight_sum + weight}
          else
            {sum, weight_sum}
          end
        end)

        case weighted_scores do
          {_, 0.0} -> 0.0
          {score_sum, weight_sum} -> Float.round(score_sum / weight_sum, 2)
        end
      _ -> 0.0
    end
  end

  @doc """
  Get students who need manual grading (short answer, essay questions).
  """
  def get_manual_grading_queue(course_id) do
    query = """
    SELECT DISTINCT
      aa.id as attempt_id,
      u.full_name,
      u.email,
      a.title as assessment_title,
      aa.submitted_at,
      aa.attempt_number,
      EXTRACT(EPOCH FROM (NOW() - aa.submitted_at))/3600 as hours_waiting
    FROM assessment_attempts aa
    JOIN assessments a ON a.id = aa.assessment_id
    JOIN users u ON u.id = aa.user_id
    WHERE a.course_id = $1
      AND aa.status = 'submitted'
      AND aa.answers::text LIKE '%"type":"short_answer"%'
    ORDER BY aa.submitted_at ASC
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [attempt_id, name, email, title, submitted_at, attempt_num, hours_waiting] ->
          %{
            attempt_id: attempt_id,
            full_name: name,
            email: email,
            assessment_title: title,
            submitted_at: submitted_at,
            attempt_number: attempt_num,
            hours_waiting: Float.round(hours_waiting || 0, 1)
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get grade statistics for an assessment.
  """
  def get_assessment_grade_stats(assessment_id) do
    query = """
    SELECT
      COUNT(*) as total_attempts,
      ROUND(AVG(percentage), 2) as avg_percentage,
      ROUND(STDDEV(percentage), 2) as std_dev,
      MIN(percentage) as min_percentage,
      MAX(percentage) as max_percentage,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY percentage) as median_percentage,
      COUNT(*) FILTER (WHERE percentage >= 90) as grade_a_count,
      COUNT(*) FILTER (WHERE percentage >= 80 AND percentage < 90) as grade_b_count,
      COUNT(*) FILTER (WHERE percentage >= 70 AND percentage < 80) as grade_c_count,
      COUNT(*) FILTER (WHERE percentage >= 60 AND percentage < 70) as grade_d_count,
      COUNT(*) FILTER (WHERE percentage < 60) as grade_f_count
    FROM assessment_attempts
    WHERE assessment_id = $1 AND status IN ('passed', 'failed', 'graded')
    """

    case Repo.query(query, [assessment_id]) do
      {:ok, %{rows: [[total, avg, std_dev, min, max, median, a_count, b_count, c_count, d_count, f_count]]}} ->
        %{
          total_attempts: total || 0,
          avg_percentage: avg || 0.0,
          std_dev: std_dev || 0.0,
          min_percentage: min || 0.0,
          max_percentage: max || 0.0,
          median_percentage: median || 0.0,
          grade_distribution: %{
            "A" => a_count || 0,
            "B" => b_count || 0,
            "C" => c_count || 0,
            "D" => d_count || 0,
            "F" => f_count || 0
          }
        }
      _ ->
        %{
          total_attempts: 0,
          avg_percentage: 0.0,
          std_dev: 0.0,
          min_percentage: 0.0,
          max_percentage: 0.0,
          median_percentage: 0.0,
          grade_distribution: %{"A" => 0, "B" => 0, "C" => 0, "D" => 0, "F" => 0}
        }
    end
  end
end
