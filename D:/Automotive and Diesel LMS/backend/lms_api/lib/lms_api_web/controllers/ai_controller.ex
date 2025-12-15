defmodule LmsApiWeb.AIController do
  use LmsApiWeb, :controller

  alias LmsApi.AI
  alias LmsApi.InstructorDashboard

  action_fallback LmsApiWeb.FallbackController

  def generate_quiz_questions(conn, %{"course_id" => course_id, "topic" => topic, "count" => count, "type" => type}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      case AI.generate_quiz_questions(topic, String.to_integer(count), type) do
        {:ok, questions} ->
          json(conn, %{data: questions})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def learning_recommendations(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user is enrolled in the course
    if LmsApi.Enrollments.user_enrolled_in_course?(user.id, course_id) do
      case AI.get_learning_recommendations(user.id, course_id) do
        {:ok, recommendations} ->
          json(conn, %{data: recommendations})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Not enrolled in this course"})
    end
  end

  def study_plan(conn, %{"course_id" => course_id, "weeks" => weeks}) do
    user = Guardian.Plug.current_resource(conn)

    if LmsApi.Enrollments.user_enrolled_in_course?(user.id, course_id) do
      case AI.generate_study_plan(user.id, course_id, String.to_integer(weeks)) do
        {:ok, plan} ->
          json(conn, %{data: plan})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Not enrolled in this course"})
    end
  end

  def grading_feedback(conn, %{"attempt_id" => attempt_id, "student_answer" => student_answer, "correct_answer" => correct_answer}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user is instructor for the course
    attempt = LmsApi.Assessments.get_attempt_with_answers!(attempt_id)
    assessment = LmsApi.Assessments.Assessment |> LmsApi.Repo.get!(attempt.assessment_id)

    if InstructorDashboard.can_manage_course?(user, assessment.course_id) do
      case AI.generate_grading_feedback(attempt_id, student_answer, correct_answer) do
        {:ok, feedback} ->
          json(conn, %{data: feedback})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def answer_question(conn, %{"course_id" => course_id, "question" => question}) do
    user = Guardian.Plug.current_resource(conn)

    if LmsApi.Enrollments.user_enrolled_in_course?(user.id, course_id) do
      case AI.answer_student_question(course_id, question) do
        {:ok, answer} ->
          json(conn, %{data: answer})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Not enrolled in this course"})
    end
  end

  def course_analytics(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_view_analytics?(user, course_id) do
      case AI.analyze_course_engagement(course_id) do
        {:ok, analytics} ->
          json(conn, %{data: analytics})
        {:error, reason} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{error: reason})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end