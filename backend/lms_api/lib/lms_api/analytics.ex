defmodule LmsApi.Analytics do
  @moduledoc """
  The Analytics context for instructor dashboard metrics and reporting.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo

  @doc """
  Get comprehensive analytics for a specific course.
  Returns enrollment stats, completion rates, assessment performance, and engagement metrics.
  """
  def get_course_analytics(course_id) do
    %{
      enrollment_stats: get_enrollment_stats(course_id),
      completion_rates: get_completion_rates(course_id),
      assessment_performance: get_assessment_performance(course_id),
      engagement_metrics: get_engagement_metrics(course_id),
      module_progress: get_module_progress(course_id),
      time_metrics: get_time_metrics(course_id)
    }
  end

  @doc """
  Get enrollment statistics for a course.
  """
  def get_enrollment_stats(course_id) do
    query = """
    SELECT
      COUNT(*) as total_enrollments,
      COUNT(*) FILTER (WHERE status = 'enrolled') as active_enrollments,
      COUNT(*) FILTER (WHERE status = 'completed') as completed_enrollments,
      COUNT(*) FILTER (WHERE status = 'dropped') as dropped_enrollments,
      ROUND(AVG(progress_percentage), 2) as avg_progress_percentage,
      COUNT(*) FILTER (WHERE enrolled_at >= CURRENT_DATE - INTERVAL '30 days') as enrollments_last_30_days,
      COUNT(*) FILTER (WHERE enrolled_at >= CURRENT_DATE - INTERVAL '7 days') as enrollments_last_7_days
    FROM enrollments
    WHERE course_id = $1
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: [[total, active, completed, dropped, avg_progress, last_30, last_7]]}} ->
        %{
          total_enrollments: total || 0,
          active_enrollments: active || 0,
          completed_enrollments: completed || 0,
          dropped_enrollments: dropped || 0,
          avg_progress_percentage: avg_progress || 0.0,
          enrollments_last_30_days: last_30 || 0,
          enrollments_last_7_days: last_7 || 0,
          completion_rate: calculate_percentage(completed, total)
        }
      _ ->
        %{
          total_enrollments: 0,
          active_enrollments: 0,
          completed_enrollments: 0,
          dropped_enrollments: 0,
          avg_progress_percentage: 0.0,
          enrollments_last_30_days: 0,
          enrollments_last_7_days: 0,
          completion_rate: 0.0
        }
    end
  end

  @doc """
  Get completion rates by module for a course.
  """
  def get_completion_rates(course_id) do
    query = """
    SELECT
      cm.id as module_id,
      cm.title as module_title,
      cm.order_index,
      COUNT(DISTINCT e.user_id) as enrolled_students,
      COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.status = 'completed') as students_completed,
      ROUND(
        COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.status = 'completed')::numeric /
        NULLIF(COUNT(DISTINCT e.user_id), 0) * 100,
        2
      ) as completion_percentage
    FROM course_modules cm
    JOIN enrollments e ON e.course_id = cm.course_id
    LEFT JOIN module_lessons ml ON ml.module_id = cm.id
    LEFT JOIN student_progress sp ON sp.lesson_id = ml.id AND sp.user_id = e.user_id
    WHERE cm.course_id = $1
    GROUP BY cm.id, cm.title, cm.order_index
    ORDER BY cm.order_index
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [module_id, title, order_index, enrolled, completed, percentage] ->
          %{
            module_id: module_id,
            module_title: title,
            order_index: order_index,
            enrolled_students: enrolled || 0,
            students_completed: completed || 0,
            completion_percentage: percentage || 0.0
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get assessment performance metrics for a course.
  """
  def get_assessment_performance(course_id) do
    query = """
    SELECT
      a.id as assessment_id,
      a.title as assessment_title,
      a.assessment_type,
      COUNT(DISTINCT aa.user_id) as students_attempted,
      COUNT(aa.id) as total_attempts,
      ROUND(AVG(aa.percentage), 2) as avg_score,
      ROUND(AVG(aa.time_spent_minutes), 2) as avg_time_minutes,
      COUNT(*) FILTER (WHERE aa.status = 'passed') as passed_count,
      COUNT(*) FILTER (WHERE aa.status = 'failed') as failed_count,
      ROUND(
        COUNT(*) FILTER (WHERE aa.status = 'passed')::numeric /
        NULLIF(COUNT(aa.id), 0) * 100,
        2
      ) as pass_rate
    FROM assessments a
    LEFT JOIN assessment_attempts aa ON aa.assessment_id = a.id AND aa.status IN ('passed', 'failed', 'graded')
    WHERE a.course_id = $1
    GROUP BY a.id, a.title, a.assessment_type
    ORDER BY a.id
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, title, type, students, attempts, avg_score, avg_time, passed, failed, pass_rate] ->
          %{
            assessment_id: id,
            assessment_title: title,
            assessment_type: type,
            students_attempted: students || 0,
            total_attempts: attempts || 0,
            avg_score: avg_score || 0.0,
            avg_time_minutes: avg_time || 0.0,
            passed_count: passed || 0,
            failed_count: failed || 0,
            pass_rate: pass_rate || 0.0
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get engagement metrics showing student activity patterns.
  """
  def get_engagement_metrics(course_id) do
    query = """
    WITH activity_data AS (
      SELECT
        e.user_id,
        COUNT(DISTINCT sp.id) as lessons_completed,
        COUNT(DISTINCT aa.id) as assessments_taken,
        COALESCE(SUM(sp.time_spent_seconds), 0) as total_time_seconds,
        MAX(GREATEST(sp.updated_at, aa.updated_at)) as last_activity
      FROM enrollments e
      LEFT JOIN student_progress sp ON sp.user_id = e.user_id
        AND sp.lesson_id IN (
          SELECT ml.id FROM module_lessons ml
          JOIN course_modules cm ON cm.id = ml.module_id
          WHERE cm.course_id = $1
        )
      LEFT JOIN assessment_attempts aa ON aa.user_id = e.user_id
        AND aa.assessment_id IN (
          SELECT a.id FROM assessments a WHERE a.course_id = $1
        )
      WHERE e.course_id = $1
      GROUP BY e.user_id
    )
    SELECT
      COUNT(*) as total_students,
      COUNT(*) FILTER (WHERE lessons_completed > 0 OR assessments_taken > 0) as active_students,
      COUNT(*) FILTER (WHERE last_activity >= CURRENT_DATE - INTERVAL '7 days') as active_last_7_days,
      COUNT(*) FILTER (WHERE last_activity >= CURRENT_DATE - INTERVAL '30 days') as active_last_30_days,
      ROUND(AVG(lessons_completed), 2) as avg_lessons_per_student,
      ROUND(AVG(assessments_taken), 2) as avg_assessments_per_student,
      ROUND(AVG(total_time_seconds) / 3600.0, 2) as avg_hours_per_student
    FROM activity_data
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: [[total, active, active_7, active_30, avg_lessons, avg_assessments, avg_hours]]}} ->
        %{
          total_students: total || 0,
          active_students: active || 0,
          active_last_7_days: active_7 || 0,
          active_last_30_days: active_30 || 0,
          avg_lessons_per_student: avg_lessons || 0.0,
          avg_assessments_per_student: avg_assessments || 0.0,
          avg_hours_per_student: avg_hours || 0.0,
          engagement_rate: calculate_percentage(active, total)
        }
      _ ->
        %{
          total_students: 0,
          active_students: 0,
          active_last_7_days: 0,
          active_last_30_days: 0,
          avg_lessons_per_student: 0.0,
          avg_assessments_per_student: 0.0,
          avg_hours_per_student: 0.0,
          engagement_rate: 0.0
        }
    end
  end

  @doc """
  Get detailed progress breakdown by module.
  """
  def get_module_progress(course_id) do
    query = """
    SELECT
      cm.id as module_id,
      cm.title as module_title,
      COUNT(DISTINCT ml.id) as total_lessons,
      COUNT(DISTINCT sp.lesson_id) FILTER (WHERE sp.status = 'completed') as lessons_completed,
      COUNT(DISTINCT sp.user_id) as students_started,
      ROUND(AVG(CAST(sp.completion_percentage AS numeric)), 2) as avg_score,
      ROUND(AVG(sp.time_spent_seconds) / 60.0, 2) as avg_time_minutes
    FROM course_modules cm
    LEFT JOIN module_lessons ml ON ml.module_id = cm.id
    LEFT JOIN student_progress sp ON sp.lesson_id = ml.id
    WHERE cm.course_id = $1
    GROUP BY cm.id, cm.title
    ORDER BY cm.order_index
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [id, title, total_lessons, completed, started, avg_score, avg_time] ->
          %{
            module_id: id,
            module_title: title,
            total_lessons: total_lessons || 0,
            lessons_completed: completed || 0,
            students_started: started || 0,
            avg_score: avg_score || 0.0,
            avg_time_minutes: avg_time || 0.0
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get time-based metrics showing when students are most active.
  """
  def get_time_metrics(course_id) do
    query = """
    WITH activity_times AS (
      SELECT
        EXTRACT(HOUR FROM sp.updated_at) as hour_of_day,
        EXTRACT(DOW FROM sp.updated_at) as day_of_week,
        sp.time_spent_seconds
      FROM student_progress sp
      JOIN module_lessons ml ON ml.id = sp.lesson_id
      JOIN course_modules cm ON cm.id = ml.module_id
      WHERE cm.course_id = $1 AND sp.updated_at IS NOT NULL
    )
    SELECT
      json_object_agg(hour_of_day, activity_count ORDER BY hour_of_day) as hourly_distribution,
      json_object_agg(day_of_week, day_count ORDER BY day_of_week) as daily_distribution
    FROM (
      SELECT hour_of_day, COUNT(*) as activity_count FROM activity_times GROUP BY hour_of_day
    ) hourly
    FULL OUTER JOIN (
      SELECT day_of_week, COUNT(*) as day_count FROM activity_times GROUP BY day_of_week
    ) daily ON true
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: [[hourly, daily]]}} ->
        %{
          hourly_distribution: hourly || %{},
          daily_distribution: daily || %{}
        }
      _ ->
        %{
          hourly_distribution: %{},
          daily_distribution: %{}
        }
    end
  end

  @doc """
  Get detailed student list with progress for a course.
  """
  def get_student_list(course_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)
    sort_by = Keyword.get(opts, :sort_by, "enrolled_at")
    sort_order = Keyword.get(opts, :sort_order, "DESC")

    query = """
    SELECT
      u.id as user_id,
      u.email,
      u.full_name,
      e.enrolled_at,
      e.status,
      e.progress_percentage,
      e.completed_at,
      COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'completed') as lessons_completed,
      COUNT(DISTINCT aa.id) as assessments_taken,
      COALESCE(AVG(aa.percentage), 0) as avg_assessment_score,
      COALESCE(SUM(sp.time_spent_seconds), 0) as total_time_seconds,
      MAX(GREATEST(sp.updated_at, aa.updated_at, e.updated_at)) as last_activity
    FROM enrollments e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN student_progress sp ON sp.user_id = e.user_id
      AND sp.lesson_id IN (
        SELECT ml.id FROM module_lessons ml
        JOIN course_modules cm ON cm.id = ml.module_id
        WHERE cm.course_id = $1
      )
    LEFT JOIN assessment_attempts aa ON aa.user_id = e.user_id
      AND aa.assessment_id IN (
        SELECT a.id FROM assessments a WHERE a.course_id = $1
      )
    WHERE e.course_id = $1
    GROUP BY u.id, u.email, u.full_name, e.enrolled_at, e.status, e.progress_percentage, e.completed_at
    ORDER BY #{sort_by} #{sort_order}
    LIMIT $2 OFFSET $3
    """

    case Repo.query(query, [course_id, limit, offset]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [user_id, email, name, enrolled_at, status, progress, completed_at,
                           lessons, assessments, avg_score, time_seconds, last_activity] ->
          %{
            user_id: user_id,
            email: email,
            full_name: name,
            enrolled_at: enrolled_at,
            status: status,
            progress_percentage: progress || 0,
            completed_at: completed_at,
            lessons_completed: lessons || 0,
            assessments_taken: assessments || 0,
            avg_assessment_score: Float.round(avg_score || 0.0, 2),
            total_time_hours: Float.round((time_seconds || 0) / 3600.0, 2),
            last_activity: last_activity
          }
        end)
      _ -> []
    end
  end

  @doc """
  Get grade distribution for a specific assessment.
  """
  def get_grade_distribution(assessment_id) do
    query = """
    SELECT
      CASE
        WHEN percentage >= 90 THEN 'A'
        WHEN percentage >= 80 THEN 'B'
        WHEN percentage >= 70 THEN 'C'
        WHEN percentage >= 60 THEN 'D'
        ELSE 'F'
      END as grade,
      COUNT(*) as count,
      ROUND(COUNT(*)::numeric / SUM(COUNT(*)) OVER () * 100, 2) as percentage
    FROM assessment_attempts
    WHERE assessment_id = $1 AND status IN ('passed', 'failed', 'graded')
    GROUP BY grade
    ORDER BY grade
    """

    case Repo.query(query, [assessment_id]) do
      {:ok, %{rows: rows}} ->
        Enum.map(rows, fn [grade, count, percentage] ->
          %{grade: grade, count: count, percentage: percentage}
        end)
      _ -> []
    end
  end

  @doc """
  Get trending metrics comparing current period to previous period.
  """
  def get_trending_metrics(course_id) do
    query = """
    WITH current_period AS (
      SELECT
        COUNT(*) FILTER (WHERE enrolled_at >= CURRENT_DATE - INTERVAL '7 days') as new_enrollments,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '7 days') as completions,
        COUNT(*) FILTER (WHERE status = 'dropped' AND updated_at >= CURRENT_DATE - INTERVAL '7 days') as drops
      FROM enrollments
      WHERE course_id = $1
    ),
    previous_period AS (
      SELECT
        COUNT(*) FILTER (WHERE enrolled_at >= CURRENT_DATE - INTERVAL '14 days'
                         AND enrolled_at < CURRENT_DATE - INTERVAL '7 days') as new_enrollments,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= CURRENT_DATE - INTERVAL '14 days'
                         AND completed_at < CURRENT_DATE - INTERVAL '7 days') as completions,
        COUNT(*) FILTER (WHERE status = 'dropped' AND updated_at >= CURRENT_DATE - INTERVAL '14 days'
                         AND updated_at < CURRENT_DATE - INTERVAL '7 days') as drops
      FROM enrollments
      WHERE course_id = $1
    )
    SELECT
      c.new_enrollments as current_enrollments,
      p.new_enrollments as previous_enrollments,
      c.completions as current_completions,
      p.completions as previous_completions,
      c.drops as current_drops,
      p.drops as previous_drops
    FROM current_period c, previous_period p
    """

    case Repo.query(query, [course_id]) do
      {:ok, %{rows: [[curr_enroll, prev_enroll, curr_comp, prev_comp, curr_drops, prev_drops]]}} ->
        %{
          enrollments: %{
            current: curr_enroll || 0,
            previous: prev_enroll || 0,
            trend: calculate_trend(curr_enroll, prev_enroll)
          },
          completions: %{
            current: curr_comp || 0,
            previous: prev_comp || 0,
            trend: calculate_trend(curr_comp, prev_comp)
          },
          drops: %{
            current: curr_drops || 0,
            previous: prev_drops || 0,
            trend: calculate_trend(curr_drops, prev_drops)
          }
        }
      _ ->
        %{
          enrollments: %{current: 0, previous: 0, trend: 0.0},
          completions: %{current: 0, previous: 0, trend: 0.0},
          drops: %{current: 0, previous: 0, trend: 0.0}
        }
    end
  end

  # Helper functions

  defp calculate_percentage(numerator, denominator) when is_nil(numerator) or is_nil(denominator) or denominator == 0 do
    0.0
  end

  defp calculate_percentage(numerator, denominator) do
    Float.round(numerator / denominator * 100, 2)
  end

  defp calculate_trend(current, previous) when is_nil(current) or is_nil(previous) or previous == 0 do
    0.0
  end

  defp calculate_trend(current, previous) do
    Float.round((current - previous) / previous * 100, 2)
  end
end
