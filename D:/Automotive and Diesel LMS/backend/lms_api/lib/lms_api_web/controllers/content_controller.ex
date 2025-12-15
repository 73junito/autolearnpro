defmodule LmsApiWeb.ContentController do
  use LmsApiWeb, :controller

  alias LmsApi.Catalog
  alias LmsApi.InstructorDashboard

  action_fallback LmsApiWeb.FallbackController

  def course_structure(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      course = Catalog.get_course_with_structure!(course_id)
      render(conn, "course_structure.json", course: course)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def create_module(conn, %{"course_id" => course_id, "module" => module_params}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      module_attrs = Map.put(module_params, "course_id", course_id)
      with {:ok, module} <- Catalog.create_course_module(module_attrs) do
        conn
        |> put_status(:created)
        |> render("module.json", module: module)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update_module(conn, %{"id" => module_id, "module" => module_params}) do
    user = Guardian.Plug.current_resource(conn)
    module = Catalog.get_course_module!(module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, module} <- Catalog.update_course_module(module, module_params) do
        conn
        |> put_status(:ok)
        |> render("module.json", module: module)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete_module(conn, %{"id" => module_id}) do
    user = Guardian.Plug.current_resource(conn)
    module = Catalog.get_course_module!(module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, module} <- Catalog.delete_course_module(module) do
        conn
        |> put_status(:ok)
        |> render("module.json", module: module)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def reorder_modules(conn, %{"course_id" => course_id, "module_ids" => module_ids}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      Catalog.reorder_course_modules(course_id, module_ids)
      conn
      |> put_status(:ok)
      |> json(%{message: "Modules reordered successfully"})
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def create_lesson(conn, %{"module_id" => module_id, "lesson" => lesson_params}) do
    user = Guardian.Plug.current_resource(conn)
    module = Catalog.get_course_module!(module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      lesson_attrs = Map.put(lesson_params, "course_module_id", module_id)
      with {:ok, lesson} <- Catalog.create_module_lesson(lesson_attrs) do
        conn
        |> put_status(:created)
        |> render("lesson.json", lesson: lesson)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update_lesson(conn, %{"id" => lesson_id, "lesson" => lesson_params}) do
    user = Guardian.Plug.current_resource(conn)
    lesson = Catalog.get_module_lesson!(lesson_id)
    module = Catalog.get_course_module!(lesson.course_module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, lesson} <- Catalog.update_module_lesson(lesson, lesson_params) do
        conn
        |> put_status(:ok)
        |> render("lesson.json", lesson: lesson)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete_lesson(conn, %{"id" => lesson_id}) do
    user = Guardian.Plug.current_resource(conn)
    lesson = Catalog.get_module_lesson!(lesson_id)
    module = Catalog.get_course_module!(lesson.course_module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, lesson} <- Catalog.delete_module_lesson(lesson) do
        conn
        |> put_status(:ok)
        |> render("lesson.json", lesson: lesson)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def reorder_lessons(conn, %{"module_id" => module_id, "lesson_ids" => lesson_ids}) do
    user = Guardian.Plug.current_resource(conn)
    module = Catalog.get_course_module!(module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      Catalog.reorder_module_lessons(module_id, lesson_ids)
      conn
      |> put_status(:ok)
      |> json(%{message: "Lessons reordered successfully"})
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def duplicate_lesson(conn, %{"lesson_id" => lesson_id}) do
    user = Guardian.Plug.current_resource(conn)
    lesson = Catalog.get_module_lesson!(lesson_id)
    module = Catalog.get_course_module!(lesson.course_module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, new_lesson} <- Catalog.duplicate_lesson(lesson_id) do
        conn
        |> put_status(:created)
        |> render("lesson.json", lesson: new_lesson)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def duplicate_module(conn, %{"module_id" => module_id}) do
    user = Guardian.Plug.current_resource(conn)
    module = Catalog.get_course_module!(module_id)

    if InstructorDashboard.can_manage_course?(user, module.course_id) do
      with {:ok, new_module} <- Catalog.duplicate_module(module_id) do
        conn
        |> put_status(:created)
        |> render("module.json", module: new_module)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end