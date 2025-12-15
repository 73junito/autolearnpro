defmodule LmsApiWeb.CourseController do
  use LmsApiWeb, :controller

  alias LmsApi.Catalog
  alias LmsApi.Catalog.Course

  action_fallback LmsApiWeb.FallbackController

  def index(conn, _params) do
    courses = Catalog.list_courses()
    render(conn, :index, courses: courses)
  end

  def create(conn, %{"course" => course_params}) do
    with {:ok, %Course{} = course} <- Catalog.create_course(course_params) do
      conn
      |> put_status(:created)
      |> put_resp_header("location", Routes.course_path(conn, :show, course))
      |> render(:show, course: course)
    end
  end

  def show(conn, %{"id" => id}) do
    course = Catalog.get_course_with_structure!(id)
    render(conn, :show, course: course)
  end

  def update(conn, %{"id" => id, "course" => course_params}) do
    course = Catalog.get_course!(id)

    with {:ok, %Course{} = course} <- Catalog.update_course(course, course_params) do
      render(conn, :show, course: course)
    end
  end

  def delete(conn, %{"id" => id}) do
    course = Catalog.get_course!(id)

    with {:ok, %Course{}} <- Catalog.delete_course(course) do
      send_resp(conn, :no_content, "")
    end
  end
end
