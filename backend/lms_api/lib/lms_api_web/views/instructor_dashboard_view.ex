defmodule LmsApiWeb.InstructorDashboardView do
  use LmsApiWeb, :view

  def render("courses.json", %{courses: courses}) do
    %{
      data: render_many(courses, LmsApiWeb.CourseView, "course.json", as: :course)
    }
  end

  def render("course.json", %{course: course}) do
    %{
      data: %{
        id: course.id,
        code: course.code,
        title: course.title,
        description: course.description,
        credits: course.credits,
        delivery_mode: course.delivery_mode,
        active: course.active
      }
    }
  end

  def render("student_progress.json", %{students: students}) do
    %{
      data: Enum.map(students, fn student_data ->
        %{
          student: %{
            id: student_data.student.id,
            email: student_data.student.email,
            full_name: student_data.student.full_name,
            role: student_data.student.role
          },
          enrollment: %{
            id: student_data.enrollment.id,
            status: student_data.enrollment.status,
            progress_percentage: student_data.enrollment.progress_percentage,
            enrolled_at: student_data.enrollment.enrolled_at
          },
          progress_percentage: student_data.progress_percentage,
          lessons_completed: student_data.lessons_completed
        }
      end)
    }
  end
end