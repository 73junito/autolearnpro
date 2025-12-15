defmodule LmsApiWeb.ProgressView do
  def render("show.json", %{lesson_progress: lesson_progress}) do
    %{
      data: %{
        id: lesson_progress.id,
        user_id: lesson_progress.user_id,
        lesson_id: lesson_progress.lesson_id,
        status: lesson_progress.status,
        score: lesson_progress.score,
        quiz_answers: lesson_progress.quiz_answers,
        time_spent: lesson_progress.time_spent,
        attempts: lesson_progress.attempts,
        completed_at: lesson_progress.completed_at,
        inserted_at: lesson_progress.inserted_at,
        updated_at: lesson_progress.updated_at
      }
    }
  end

  def render("index.json", %{lesson_progresses: lesson_progresses}) do
    %{
      data: Enum.map(lesson_progresses, fn progress ->
        render("show.json", %{lesson_progress: progress})[:data]
      end)
    }
  end
end