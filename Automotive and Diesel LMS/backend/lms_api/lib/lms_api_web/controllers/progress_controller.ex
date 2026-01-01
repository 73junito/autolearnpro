defmodule LmsApiWeb.ProgressController do
  use LmsApiWeb, :controller

  alias LmsApi.Progress
  alias LmsApi.Enrollments

  action_fallback LmsApiWeb.FallbackController

  def start_lesson(conn, %{"lesson_id" => lesson_id}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user is enrolled in the course containing this lesson
    with {:ok, _enrollment} <- check_lesson_access(user.id, lesson_id),
         {:ok, progress} <- Progress.start_lesson_progress(user.id, lesson_id) do
      conn
      |> put_status(:ok)
      |> render(:show, lesson_progress: progress)
    end
  end

  def complete_lesson(conn, %{"lesson_id" => lesson_id, "time_spent" => time_spent}) do
    user = Guardian.Plug.current_resource(conn)

    with {:ok, _enrollment} <- check_lesson_access(user.id, lesson_id),
         {:ok, progress} <- Progress.complete_lesson(user.id, lesson_id, time_spent) do
      # Update enrollment progress
      update_course_progress(user.id, lesson_id)

      conn
      |> put_status(:ok)
      |> render(:show, lesson_progress: progress)
    end
  end

  def submit_quiz(conn, %{"lesson_id" => lesson_id, "answers" => answers} = params) do
    user = Guardian.Plug.current_resource(conn)
    time_spent = params["time_spent"]

    with {:ok, _enrollment} <- check_lesson_access(user.id, lesson_id),
         {:ok, progress} <- Progress.submit_quiz(user.id, lesson_id, answers, time_spent) do
      # Update enrollment progress
      update_course_progress(user.id, lesson_id)

      conn
      |> put_status(:ok)
      |> render(:show, lesson_progress: progress)
    end
  end

  def lesson_progress(conn, %{"lesson_id" => lesson_id}) do
    user = Guardian.Plug.current_resource(conn)

    case Progress.get_lesson_progress_by_user_and_lesson(user.id, lesson_id) do
      nil ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "Lesson progress not found"})
      progress ->
        conn
        |> put_status(:ok)
        |> render(:show, lesson_progress: progress)
    end
  end

  def course_progress(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user is enrolled
    case Enrollments.user_enrolled_in_course?(user.id, course_id) do
      true ->
        progress_percentage = Progress.calculate_course_progress(user.id, course_id)
        lesson_progress = Progress.list_course_lesson_progress(user.id, course_id)

        conn
        |> put_status(:ok)
        |> json(%{
          data: %{
            course_id: course_id,
            progress_percentage: progress_percentage,
            lessons: lesson_progress
          }
        })
      false ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Not enrolled in this course"})
    end
  end

  # Helper functions

  defp check_lesson_access(user_id, lesson_id) do
    # Get the course_id for this lesson
    case get_course_id_for_lesson(lesson_id) do
      {:ok, course_id} ->
        case Enrollments.user_enrolled_in_course?(user_id, course_id) do
          true -> {:ok, course_id}
          false -> {:error, :not_enrolled}
        end
      {:error, :lesson_not_found} ->
        {:error, :lesson_not_found}
    end
  end

  defp get_course_id_for_lesson(lesson_id) do
    # This would need to be implemented based on your lesson structure
    # For now, return a mock course_id
    {:ok, 1}
  end

  defp update_course_progress(user_id, lesson_id) do
    case get_course_id_for_lesson(lesson_id) do
      {:ok, course_id} ->
        Progress.update_enrollment_progress_from_lessons(user_id, course_id)
      _ ->
        :ok
    end
  end
end