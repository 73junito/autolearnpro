defmodule LmsApi.Catalog do
  @moduledoc """
  The Catalog context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Catalog.{Course, CourseModule, ModuleLesson}

  @doc """
  Returns the list of courses.

  ## Examples

      iex> list_courses()
      [%Course{}, ...]

  """
  def list_courses do
    Repo.all(Course)
  end

  @doc """
  Gets a single course.

  Raises `Ecto.NoResultsError` if the Course does not exist.

  ## Examples

      iex> get_course!(123)
      %Course{}

      iex> get_course!(456)
      ** (Ecto.NoResultsError)

  """
  def get_course!(id), do: Repo.get!(Course, id)

  @doc """
  Creates a course.

  ## Examples

      iex> create_course(%{field: value})
      {:ok, %Course{}}

      iex> create_course(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_course(attrs \\ %{}) do
    %Course{}
    |> Course.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a course.

  ## Examples

      iex> update_course(course, %{field: new_value})
      {:ok, %Course{}}

      iex> update_course(course, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_course(%Course{} = course, attrs) do
    course
    |> Course.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a course.

  ## Examples

      iex> delete_course(course)
      {:ok, %Course{}}

      iex> delete_course(course)
      {:error, %Ecto.Changeset{}}

  """
  def delete_course(%Course{} = course) do
    Repo.delete(course)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking course changes.

  ## Examples

      iex> change_course(course)
      %Ecto.Changeset{data: %Course{}}

  """
  def change_course(%Course{} = course, attrs \\ %{}) do
    Course.changeset(course, attrs)
  end

  def get_course_with_structure!(id) do
    Course
    |> Repo.get!(id)
    |> Repo.preload([
      :syllabus,
      modules: from(m in CourseModule,
        order_by: m.position,
        preload: [lessons: ^from(l in ModuleLesson, order_by: l.position)]
      )
    ])
  end

  @doc """
  Creates a course module.

  ## Examples

      iex> create_course_module(%{field: value})
      {:ok, %CourseModule{}}}

  """
  def create_course_module(attrs \\ %{}) do
    %CourseModule{}
    |> CourseModule.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a course module.

  ## Examples

      iex> update_course_module(module, %{field: new_value})
      {:ok, %CourseModule{}}

      iex> update_course_module(module, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_course_module(%CourseModule{} = module, attrs) do
    module
    |> CourseModule.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a course module.

  ## Examples

      iex> delete_course_module(module)
      {:ok, %CourseModule{}}

  """
  def delete_course_module(%CourseModule{} = module) do
    Repo.delete(module)
  end

  @doc """
  Gets a single course module.

  ## Examples

      iex> get_course_module!(123)
      %CourseModule{}

  """
  def get_course_module!(id), do: Repo.get!(CourseModule, id)

  @doc """
  Lists modules for a course.

  ## Examples

      iex> list_course_modules(123)
      [%CourseModule{}, ...]

  """
  def list_course_modules(course_id) do
    CourseModule
    |> where([m], m.course_id == ^course_id)
    |> order_by([m], m.position)
    |> Repo.all()
  end

  @doc """
  Creates a module lesson.

  ## Examples

      iex> create_module_lesson(%{field: value})
      {:ok, %ModuleLesson{}}

  """
  def create_module_lesson(attrs \\ %{}) do
    %ModuleLesson{}
    |> ModuleLesson.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a module lesson.

  ## Examples

      iex> update_module_lesson(lesson, %{field: new_value})
      {:ok, %ModuleLesson{}}

      iex> update_module_lesson(lesson, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_module_lesson(%ModuleLesson{} = lesson, attrs) do
    lesson
    |> ModuleLesson.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a module lesson.

  ## Examples

      iex> delete_module_lesson(lesson)
      {:ok, %ModuleLesson{}}

  """
  def delete_module_lesson(%ModuleLesson{} = lesson) do
    Repo.delete(lesson)
  end

  @doc """
  Gets a single module lesson.

  ## Examples

      iex> get_module_lesson!(123)
      %ModuleLesson{}

  """
  def get_module_lesson!(id), do: Repo.get!(ModuleLesson, id)

  @doc """
  Lists lessons for a module.

  ## Examples

      iex> list_module_lessons(123)
      [%ModuleLesson{}, ...]

  """
  def list_module_lessons(module_id) do
    ModuleLesson
    |> where([l], l.course_module_id == ^module_id)
    |> order_by([l], l.position)
    |> Repo.all()
  end

  @doc """
  Gets a lesson with full content.

  ## Examples

      iex> get_lesson_with_content!(123)
      %ModuleLesson{}

  """
  def get_lesson_with_content!(id) do
    ModuleLesson
    |> Repo.get!(id)
    |> Repo.preload(:course_module)
  end

  @doc """
  Updates lesson positions in a module.

  ## Examples

      iex> reorder_module_lessons(123, [456, 789, 101])
      :ok

  """
  def reorder_module_lessons(_module_id, lesson_ids) do
    Enum.with_index(lesson_ids, 1)
    |> Enum.each(fn {lesson_id, position} ->
      ModuleLesson
      |> Repo.get!(lesson_id)
      |> update_module_lesson(%{position: position})
    end)
    :ok
  end

  @doc """
  Updates module positions in a course.

  ## Examples

      iex> reorder_course_modules(123, [456, 789, 101])
      :ok

  """
  def reorder_course_modules(_course_id, module_ids) do
    Enum.with_index(module_ids, 1)
    |> Enum.each(fn {module_id, position} ->
      CourseModule
      |> Repo.get!(module_id)
      |> update_course_module(%{position: position})
    end)
    :ok
  end

  @doc """
  Duplicates a lesson.

  ## Examples

      iex> duplicate_lesson(123)
      {:ok, %ModuleLesson{}}

  """
  def duplicate_lesson(lesson_id) do
    lesson = get_module_lesson!(lesson_id)

    attrs = %{
      course_module_id: lesson.course_module_id,
      position: lesson.position + 1,
      title: "#{lesson.title} (Copy)",
      lesson_type: lesson.lesson_type,
      duration_minutes: lesson.duration_minutes,
      is_published: false,
      content: lesson.content
    }

    create_module_lesson(attrs)
  end

  @doc """
  Duplicates a module with all its lessons.

  ## Examples

      iex> duplicate_module(123)
      {:ok, %CourseModule{}}

  """
  def duplicate_module(module_id) do
    module = get_course_module!(module_id)
    lessons = list_module_lessons(module_id)

    # Create new module
    module_attrs = %{
      course_id: module.course_id,
      position: module.position + 1,
      title: "#{module.title} (Copy)",
      summary: module.summary,
      published: false
    }

    with {:ok, new_module} <- create_course_module(module_attrs) do
      # Duplicate all lessons
      Enum.each(lessons, fn lesson ->
        lesson_attrs = %{
          course_module_id: new_module.id,
          position: lesson.position,
          title: lesson.title,
          lesson_type: lesson.lesson_type,
          duration_minutes: lesson.duration_minutes,
          is_published: false,
          content: lesson.content
        }
        create_module_lesson(lesson_attrs)
      end)

      {:ok, new_module}
    end
  end
end
