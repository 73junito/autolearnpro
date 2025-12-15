defmodule LmsApi.InstructorDashboard do
  @moduledoc """
  The Instructor Dashboard context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Accounts
  alias LmsApi.Catalog
  alias LmsApi.Enrollments
  alias LmsApi.Progress

  @doc """
  Gets dashboard overview for an instructor.

  ## Examples

      iex> get_dashboard_overview(user_id)
      %{courses_count: 5, total_students: 150, completion_rate: 75.5}

  """
  def get_dashboard_overview(user_id) do
    user = Accounts.get_user!(user_id)

    if Accounts.is_instructor?(user) do
      courses = get_instructor_courses(user_id)
      courses_count = length(courses)
      course_ids = Enum.map(courses, & &1.id)

      total_students = get_total_students(course_ids)
      completion_rate = get_average_completion_rate(course_ids)

      %{
        courses_count: courses_count,
        total_students: total_students,
        completion_rate: completion_rate,
        recent_activity: get_recent_activity(course_ids)
      }
    else
      {:error, :unauthorized}
    end
  end

  @doc """
  Gets courses managed by an instructor.

  ## Examples

      iex> get_instructor_courses(user_id)
      [%Course{}, ...]

  """
  def get_instructor_courses(user_id) do
    user = Accounts.get_user!(user_id)

    if Accounts.is_admin?(user) do
      # Admins can see all courses
      Catalog.list_courses()
    else
      # For now, instructors can see all courses
      # In the future, this could filter by assigned courses
      Catalog.list_courses()
    end
  end

  @doc """
  Gets detailed course analytics.

  ## Examples

      iex> get_course_analytics(user_id, course_id)
      %{enrollments: 25, completion_rate: 80.0, average_progress: 75.2}

  """
  def get_course_analytics(user_id, course_id) do
    user = Accounts.get_user!(user_id)

    if Accounts.can_view_analytics?(user, course_id) do
      enrollments = Enrollments.list_course_enrollments(course_id)
      enrollments_count = length(enrollments)

      if enrollments_count > 0 do
        completed_count = Enum.count(enrollments, &(&1.status == "completed"))
        completion_rate = (completed_count / enrollments_count) * 100

        average_progress = Enum.reduce(enrollments, 0, &(&1.progress_percentage + &2)) / enrollments_count

        %{
          enrollments_count: enrollments_count,
          completion_rate: Float.round(completion_rate, 1),
          average_progress: Float.round(average_progress, 1),
          enrollments: enrollments
        }
      else
        %{
          enrollments_count: 0,
          completion_rate: 0.0,
          average_progress: 0.0,
          enrollments: []
        }
      end
    else
      {:error, :unauthorized}
    end
  end

  @doc """
  Gets student progress details for a course.

  ## Examples

      iex> get_student_progress(user_id, course_id)
      [%{student: %User{}, progress: 85.5, status: "enrolled"}, ...]

  """
  def get_student_progress(user_id, course_id) do
    user = Accounts.get_user!(user_id)

    if Accounts.can_view_analytics?(user, course_id) do
      enrollments = Enrollments.list_course_enrollments(course_id)

      Enum.map(enrollments, fn enrollment ->
        student = Accounts.get_user!(enrollment.user_id)
        progress = Progress.calculate_course_progress(enrollment.user_id, course_id)

        %{
          student: student,
          enrollment: enrollment,
          progress_percentage: progress,
          lessons_completed: get_completed_lessons_count(enrollment.user_id, course_id)
        }
      end)
    else
      {:error, :unauthorized}
    end
  end

  @doc """
  Creates a new course (instructor/admin only).

  ## Examples

      iex> create_course(user_id, course_attrs)
      {:ok, %Course{}}

  """
  def create_course(user_id, course_attrs) do
    user = Accounts.get_user!(user_id)

    if Accounts.is_instructor?(user) do
      Catalog.create_course(course_attrs)
    else
      {:error, :unauthorized}
    end
  end

  @doc """
  Updates a course (instructor/admin only).

  ## Examples

      iex> update_course(user_id, course_id, course_attrs)
      {:ok, %Course{}}

  """
  def update_course(user_id, course_id, course_attrs) do
    user = Accounts.get_user!(user_id)

    if Accounts.can_manage_course?(user, course_id) do
      course = Catalog.get_course!(course_id)
      Catalog.update_course(course, course_attrs)
    else
      {:error, :unauthorized}
    end
  end

  @doc """
  Deletes a course (admin only).

  ## Examples

      iex> delete_course(user_id, course_id)
      {:ok, %Course{}}

  """
  def delete_course(user_id, course_id) do
    user = Accounts.get_user!(user_id)

    if Accounts.is_admin?(user) do
      course = Catalog.get_course!(course_id)
      Catalog.delete_course(course)
    else
      {:error, :unauthorized}
    end
  end

  # Helper functions

  defp get_total_students(course_ids) do
    Enrollments
    |> where([e], e.course_id in ^course_ids and e.status == "enrolled")
    |> Repo.aggregate(:count, :id)
  end

  defp get_average_completion_rate(course_ids) do
    # Simplified - calculate average completion across all courses
    total_completion = Enum.reduce(course_ids, 0, fn course_id, acc ->
      enrollments = Enrollments.list_course_enrollments(course_id)
      if Enum.empty?(enrollments) do
        acc
      else
        completed = Enum.count(enrollments, &(&1.status == "completed"))
        rate = (completed / length(enrollments)) * 100
        acc + rate
      end
    end)

    if length(course_ids) > 0 do
      Float.round(total_completion / length(course_ids), 1)
    else
      0.0
    end
  end

  defp get_recent_activity(course_ids) do
    # Get recent enrollments and completions
    recent_enrollments = Enrollments
    |> where([e], e.course_id in ^course_ids)
    |> order_by([e], desc: e.inserted_at)
    |> limit(5)
    |> preload([:user, :course])
    |> Repo.all()

    Enum.map(recent_enrollments, fn enrollment ->
      %{
        type: "enrollment",
        user: enrollment.user.full_name,
        course: enrollment.course.title,
        date: enrollment.inserted_at
      }
    end)
  end

  defp get_completed_lessons_count(user_id, course_id) do
    Progress
    |> where([p], p.user_id == ^user_id)
    |> join(:inner, [p], lesson in assoc(p, :lesson))
    |> join(:inner, [p, lesson], module in assoc(lesson, :module))
    |> where([p, lesson, module], module.course_id == ^course_id and p.status in ["completed", "passed"])
    |> Repo.aggregate(:count, :id)
  end
end