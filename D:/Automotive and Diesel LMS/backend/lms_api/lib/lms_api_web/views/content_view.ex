defmodule LmsApiWeb.ContentView do
  use LmsApiWeb, :view

  def render("course_structure.json", %{course: course}) do
    %{
      data: %{
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        credits: course.credits,
        delivery_mode: course.delivery_mode,
        active: course.active,
        modules: render_many(course.modules, __MODULE__, "module.json", as: :module)
      }
    }
  end

  def render("module.json", %{module: module}) do
    %{
      id: module.id,
      title: module.title,
      summary: module.summary,
      position: module.position,
      start_date: module.start_date,
      end_date: module.end_date,
      published: module.published,
      course_id: module.course_id,
      lessons: render_many(module.lessons, __MODULE__, "lesson.json", as: :lesson),
      inserted_at: module.inserted_at,
      updated_at: module.updated_at
    }
  end

  def render("lesson.json", %{lesson: lesson}) do
    %{
      id: lesson.id,
      title: lesson.title,
      position: lesson.position,
      lesson_type: lesson.lesson_type,
      duration_minutes: lesson.duration_minutes,
      is_published: lesson.is_published,
      content: lesson.content,
      course_module_id: lesson.course_module_id,
      inserted_at: lesson.inserted_at,
      updated_at: lesson.updated_at
    }
  end
end