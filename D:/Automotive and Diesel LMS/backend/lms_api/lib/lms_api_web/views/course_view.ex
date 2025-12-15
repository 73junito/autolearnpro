defmodule LmsApiWeb.CourseView do
  alias LmsApi.Catalog.{Course, CourseModule, ModuleLesson, CourseSyllabus}

  def index(%{courses: courses}) do
    %{data: for(course <- courses, do: course_summary(course))}
  end

  def show(%{course: %Course{} = course}) do
    %{data: course_detail(course)}
  end

  # lightweight for catalog list
  defp course_summary(%Course{} = course) do
    %{
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.description,
      credits: course.credits,
      delivery_mode: course.delivery_mode,
      active: course.active
    }
  end

  # full detail for course page
  defp course_detail(%Course{} = course) do
    %{
      id: course.id,
      code: course.code,
      title: course.title,
      description: course.description,
      credits: course.credits,
      delivery_mode: course.delivery_mode,
      active: course.active,
      syllabus: syllabus_json(course.syllabus),
      modules: Enum.map(course.modules || [], &module_json/1)
    }
  end

  defp syllabus_json(nil), do: nil

  defp syllabus_json(%CourseSyllabus{} = s) do
    %{
      overview: s.overview,
      learning_outcomes: s.learning_outcomes,
      required_materials: s.required_materials,
      grading_policy: s.grading_policy,
      attendance_policy: s.attendance_policy,
      schedule_notes: s.schedule_notes
    }
  end

  defp module_json(%CourseModule{} = m) do
    %{
      id: m.id,
      position: m.position,
      title: m.title,
      summary: m.summary,
      start_date: m.start_date,
      end_date: m.end_date,
      published: m.published,
      lessons: Enum.map(m.lessons || [], &lesson_json/1)
    }
  end

  defp lesson_json(%ModuleLesson{} = l) do
    %{
      id: l.id,
      position: l.position,
      title: l.title,
      lesson_type: l.lesson_type,
      duration_minutes: l.duration_minutes,
      is_published: l.is_published,
      # omit content here if you want a separate "view lesson" endpoint later
    }
  end
end
