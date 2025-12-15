defmodule LmsApiWeb.EnrollmentController do
  use LmsApiWeb, :controller

  alias LmsApi.Enrollments
  alias LmsApi.Enrollments.Enrollment

  action_fallback LmsApiWeb.FallbackController

  def index(conn, _params) do
    enrollments = Enrollments.list_enrollments()
    render(conn, :index, enrollments: enrollments)
  end

  def create(conn, %{"enrollment" => enrollment_params}) do
    with {:ok, %Enrollment{} = enrollment} <- Enrollments.create_enrollment(enrollment_params) do
      conn
      |> put_status(:created)
      |> put_resp_header("location", "/api/enrollments/#{enrollment.id}")
      |> render(:show, enrollment: enrollment)
    end
  end

  def show(conn, %{"id" => id}) do
    enrollment = Enrollments.get_enrollment!(id)
    render(conn, :show, enrollment: enrollment)
  end

  def update(conn, %{"id" => id, "enrollment" => enrollment_params}) do
    enrollment = Enrollments.get_enrollment!(id)

    with {:ok, %Enrollment{} = enrollment} <- Enrollments.update_enrollment(enrollment, enrollment_params) do
      render(conn, :show, enrollment: enrollment)
    end
  end

  def delete(conn, %{"id" => id}) do
    enrollment = Enrollments.get_enrollment!(id)

    with {:ok, %Enrollment{}} <- Enrollments.delete_enrollment(enrollment) do
      send_resp(conn, :no_content, "")
    end
  end

  def enroll(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    case Enrollments.enroll_user_in_course(user.id, course_id) do
      {:ok, enrollment} ->
        conn
        |> put_status(:created)
        |> render(:show, enrollment: enrollment)
      {:error, :already_enrolled} ->
        conn
        |> put_status(:conflict)
        |> json(%{error: "Already enrolled in this course"})
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  def unenroll(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    case Enrollments.unenroll_user_from_course(user.id, course_id) do
      {:ok, enrollment} ->
        conn
        |> put_status(:ok)
        |> render(:show, enrollment: enrollment)
      {:error, :not_enrolled} ->
        conn
        |> put_status(:not_found)
        |> json(%{error: "Not enrolled in this course"})
    end
  end

  def my_enrollments(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    enrollments = Enrollments.list_user_enrollments(user.id)
    render(conn, :index, enrollments: enrollments)
  end

  def course_enrollments(conn, %{"course_id" => course_id}) do
    # Only instructors or admins should access this
    user = Guardian.Plug.current_resource(conn)

    if user.role in ["instructor", "admin"] do
      enrollments = Enrollments.list_course_enrollments(course_id)
      render(conn, :index, enrollments: enrollments)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end
