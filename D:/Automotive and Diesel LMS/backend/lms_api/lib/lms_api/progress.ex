defmodule LmsApi.Progress do
  @moduledoc """
  The Progress context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo

  alias LmsApi.Progress.LessonProgress

  @doc """
  Returns the list of lesson_progresses.

  ## Examples

      iex> list_lesson_progresses()
      [%LessonProgress{}, ...]

  """
  def list_lesson_progresses do
    Repo.all(LessonProgress)
  end

  @doc """
  Gets a single lesson_progress.

  Raises `Ecto.NoResultsError` if the Lesson progress does not exist.

  ## Examples

      iex> get_lesson_progress!(123)
      %LessonProgress{}

      iex> get_lesson_progress!(456)
      ** (Ecto.NoResultsError)

  """
  def get_lesson_progress!(id), do: Repo.get!(LessonProgress, id)

  @doc """
  Creates a lesson_progress.

  ## Examples

      iex> create_lesson_progress(%{field: value})
      {:ok, %LessonProgress{}}

      iex> create_lesson_progress(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_lesson_progress(attrs \\ %{}) do
    %LessonProgress{}
    |> LessonProgress.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a lesson_progress.

  ## Examples

      iex> update_lesson_progress(lesson_progress, %{field: new_value})
      {:ok, %LessonProgress{}}

      iex> update_lesson_progress(lesson_progress, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_lesson_progress(%LessonProgress{} = lesson_progress, attrs) do
    lesson_progress
    |> LessonProgress.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a lesson_progress.

  ## Examples

      iex> delete_lesson_progress(lesson_progress)
      {:ok, %LessonProgress{}}

      iex> delete_lesson_progress(lesson_progress)
      {:error, %Ecto.Changeset{}}

  """
  def delete_lesson_progress(%LessonProgress{} = lesson_progress) do
    Repo.delete(lesson_progress)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking lesson_progress changes.

  ## Examples

      iex> change_lesson_progress(lesson_progress)
      %Ecto.Changeset{data: %LessonProgress{}}

  """
  def change_lesson_progress(%LessonProgress{} = lesson_progress, attrs \\ %{}) do
    LessonProgress.changeset(lesson_progress, attrs)
  end

  @doc """
  Starts or gets existing lesson progress for a user.

  ## Examples

      iex> start_lesson_progress(user_id, lesson_id)
      {:ok, %LessonProgress{}}

  """
  def start_lesson_progress(user_id, lesson_id) do
    case get_lesson_progress_by_user_and_lesson(user_id, lesson_id) do
      nil ->
        create_lesson_progress(%{
          user_id: user_id,
          lesson_id: lesson_id,
          status: "in_progress",
          attempts: 1
        })
      %LessonProgress{} = progress ->
        {:ok, progress}
    end
  end

  @doc """
  Gets lesson progress by user and lesson.

  ## Examples

      iex> get_lesson_progress_by_user_and_lesson(user_id, lesson_id)
      %LessonProgress{}

      iex> get_lesson_progress_by_user_and_lesson(user_id, lesson_id)
      nil

  """
  def get_lesson_progress_by_user_and_lesson(user_id, lesson_id) do
    Repo.get_by(LessonProgress, user_id: user_id, lesson_id: lesson_id)
  end

  @doc """
  Completes a lesson for a user.

  ## Examples

      iex> complete_lesson(user_id, lesson_id, time_spent)
      {:ok, %LessonProgress{}}

  """
  def complete_lesson(user_id, lesson_id, time_spent \\ nil) do
    case get_lesson_progress_by_user_and_lesson(user_id, lesson_id) do
      nil ->
        create_lesson_progress(%{
          user_id: user_id,
          lesson_id: lesson_id,
          status: "completed",
          time_spent: time_spent
        })
      %LessonProgress{} = progress ->
        update_lesson_progress(progress, %{
          status: "completed",
          time_spent: time_spent || progress.time_spent
        })
    end
  end

  @doc """
  Submits quiz answers for a lesson.

  ## Examples

      iex> submit_quiz(user_id, lesson_id, answers, time_spent)
      {:ok, %LessonProgress{}}

  """
  def submit_quiz(user_id, lesson_id, answers, time_spent \\ nil) do
    # Calculate score (simplified - in real implementation, you'd compare with correct answers)
    score = calculate_quiz_score(answers)

    status = if score >= 70, do: "passed", else: "failed"

    case get_lesson_progress_by_user_and_lesson(user_id, lesson_id) do
      nil ->
        create_lesson_progress(%{
          user_id: user_id,
          lesson_id: lesson_id,
          status: status,
          score: score,
          quiz_answers: answers,
          time_spent: time_spent,
          attempts: 1
        })
      %LessonProgress{} = progress ->
        update_lesson_progress(progress, %{
          status: status,
          score: score,
          quiz_answers: answers,
          time_spent: time_spent || progress.time_spent,
          attempts: progress.attempts + 1
        })
    end
  end

  @doc """
  Lists lesson progress for a user.

  ## Examples

      iex> list_user_lesson_progress(user_id)
      [%LessonProgress{}, ...]

  """
  def list_user_lesson_progress(user_id) do
    LessonProgress
    |> where([lp], lp.user_id == ^user_id)
    |> preload([:lesson])
    |> Repo.all()
  end

  @doc """
  Lists lesson progress for a course enrollment.

  ## Examples

      iex> list_course_lesson_progress(user_id, course_id)
      [%LessonProgress{}, ...]

  """
  def list_course_lesson_progress(user_id, course_id) do
    LessonProgress
    |> join(:inner, [lp], lesson in assoc(lp, :lesson))
    |> join(:inner, [lp, lesson], module in assoc(lesson, :module))
    |> where([lp, lesson, module], lp.user_id == ^user_id and module.course_id == ^course_id)
    |> preload([lesson: [:module]])
    |> Repo.all()
  end

  @doc """
  Calculates course progress percentage based on completed lessons.

  ## Examples

      iex> calculate_course_progress(user_id, course_id)
      75

  """
  def calculate_course_progress(user_id, course_id) do
    # Get total lessons in course
    total_lessons = get_course_lesson_count(course_id)

    if total_lessons == 0 do
      0
    else
      # Get completed/passed lessons for user in this course
      completed_lessons = get_completed_lesson_count(user_id, course_id)
      round((completed_lessons / total_lessons) * 100)
    end
  end

  @doc """
  Updates enrollment progress based on lesson completions.

  ## Examples

      iex> update_enrollment_progress_from_lessons(user_id, course_id)
      {:ok, %Enrollment{}}

  """
  def update_enrollment_progress_from_lessons(user_id, course_id) do
    progress_percentage = calculate_course_progress(user_id, course_id)

    # Check if course is completed
    status = if progress_percentage >= 100, do: "completed", else: "enrolled"

    LmsApi.Enrollments.update_enrollment_progress(user_id, course_id, progress_percentage)
  end

  # Helper functions

  defp calculate_quiz_score(_answers) do
    # Simplified scoring - in real implementation, compare with correct answers
    # For now, return a random score between 60-100
    :rand.uniform(40) + 60
  end

  defp get_course_lesson_count(course_id) do
    # This would need to be implemented based on your course structure
    # For now, return a mock count
    10
  end

  defp get_completed_lesson_count(user_id, course_id) do
    # Count completed/passed lessons for user in course
    LessonProgress
    |> join(:inner, [lp], lesson in assoc(lp, :lesson))
    |> join(:inner, [lp, lesson], module in assoc(lesson, :module))
    |> where([lp, lesson, module],
             lp.user_id == ^user_id and
             module.course_id == ^course_id and
             lp.status in ["completed", "passed"])
    |> Repo.aggregate(:count, :id)
  end
end
