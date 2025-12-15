defmodule LmsApiWeb.AssessmentController do
  use LmsApiWeb, :controller

  alias LmsApi.Assessments
  alias LmsApi.InstructorDashboard

  action_fallback LmsApiWeb.FallbackController

  def index(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_view_analytics?(user, course_id) do
      assessments = Assessments.list_course_assessments(course_id)
      render(conn, "index.json", assessments: assessments)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def show(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    assessment = Assessments.get_assessment!(id)

    if InstructorDashboard.can_view_analytics?(user, assessment.course_id) do
      assessment = Assessments.get_assessment_with_questions!(id)
      render(conn, "show.json", assessment: assessment)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def create(conn, %{"course_id" => course_id, "assessment" => assessment_params}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      assessment_attrs = Map.put(assessment_params, "course_id", course_id)
      with {:ok, assessment} <- Assessments.create_assessment(assessment_attrs) do
        conn
        |> put_status(:created)
        |> render("show.json", assessment: assessment)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update(conn, %{"id" => id, "assessment" => assessment_params}) do
    user = Guardian.Plug.current_resource(conn)
    assessment = Assessments.get_assessment!(id)

    if InstructorDashboard.can_manage_course?(user, assessment.course_id) do
      with {:ok, assessment} <- Assessments.update_assessment(assessment, assessment_params) do
        render(conn, "show.json", assessment: assessment)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    assessment = Assessments.get_assessment!(id)

    if InstructorDashboard.can_manage_course?(user, assessment.course_id) do
      with {:ok, assessment} <- Assessments.delete_assessment(assessment) do
        render(conn, "show.json", assessment: assessment)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def analytics(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    assessment = Assessments.get_assessment!(id)

    if InstructorDashboard.can_view_analytics?(user, assessment.course_id) do
      analytics = Assessments.get_assessment_analytics(id)
      json(conn, %{data: analytics})
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def start_attempt(conn, %{"assessment_id" => assessment_id}) do
    user = Guardian.Plug.current_resource(conn)
    assessment = Assessments.get_assessment!(assessment_id)

    # Check if user can access this assessment
    if LmsApi.Enrollments.user_enrolled_in_course?(user.id, assessment.course_id) do
      # Check attempt limits
      existing_attempts = Assessments.list_user_assessment_attempts(user.id, assessment_id)
      attempt_number = length(existing_attempts) + 1

      if attempt_number <= assessment.max_attempts do
        with {:ok, attempt} <- Assessments.create_attempt(%{
          user_id: user.id,
          assessment_id: assessment_id,
          attempt_number: attempt_number
        }) do
          conn
          |> put_status(:created)
          |> render("attempt.json", attempt: attempt)
        end
      else
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Maximum attempts reached"})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Not enrolled in this course"})
    end
  end

  def submit_attempt(conn, %{"attempt_id" => attempt_id, "answers" => answers}) do
    user = Guardian.Plug.current_resource(conn)
    attempt = Assessments.get_attempt_with_answers!(attempt_id)

    # Verify ownership
    if attempt.user_id == user.id do
      with {:ok, updated_attempt} <- Assessments.submit_assessment_answers(attempt_id, answers) do
        render(conn, "attempt.json", attempt: updated_attempt)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def user_attempts(conn, %{"assessment_id" => assessment_id}) do
    user = Guardian.Plug.current_resource(conn)
    attempts = Assessments.list_user_assessment_attempts(user.id, assessment_id)
    render(conn, "attempts.json", attempts: attempts)
  end
end
