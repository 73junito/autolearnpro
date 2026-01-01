defmodule LmsApiWeb.InstructorDashboardController do
  use LmsApiWeb, :controller

  alias LmsApi.InstructorDashboard
  alias LmsApi.Accounts

  action_fallback LmsApiWeb.FallbackController

  def dashboard(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.get_dashboard_overview(user.id) do
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
      overview ->
        conn
        |> put_status(:ok)
        |> json(%{data: overview})
    end
  end

  def courses(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    courses = InstructorDashboard.get_instructor_courses(user.id)

    conn
    |> put_status(:ok)
    |> render("courses.json", courses: courses)
  end

  def course_analytics(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.get_course_analytics(user.id, course_id) do
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
      analytics ->
        conn
        |> put_status(:ok)
        |> json(%{data: analytics})
    end
  end

  def student_progress(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.get_student_progress(user.id, course_id) do
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
      progress ->
        conn
        |> put_status(:ok)
        |> render("student_progress.json", students: progress)
    end
  end

  def create_course(conn, %{"course" => course_params}) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.create_course(user.id, course_params) do
      {:ok, course} ->
        conn
        |> put_status(:created)
        |> render("course.json", course: course)
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  def update_course(conn, %{"id" => course_id, "course" => course_params}) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.update_course(user.id, course_id, course_params) do
      {:ok, course} ->
        conn
        |> put_status(:ok)
        |> render("course.json", course: course)
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> render("error.json", changeset: changeset)
    end
  end

  def delete_course(conn, %{"id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    case InstructorDashboard.delete_course(user.id, course_id) do
      {:ok, course} ->
        conn
        |> put_status(:ok)
        |> render("course.json", course: course)
      {:error, :unauthorized} ->
        conn
        |> put_status(:forbidden)
        |> json(%{error: "Access denied"})
    end
  end
end