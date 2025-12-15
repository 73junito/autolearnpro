defmodule LmsApi.Catalog.ModuleLesson do
  use Ecto.Schema
  import Ecto.Changeset

  schema "module_lessons" do
    field :position, :integer
    field :title, :string
    field :lesson_type, :string, default: "page"
    field :duration_minutes, :integer
    field :is_published, :boolean, default: true
    field :content, :string

    belongs_to :course_module, LmsApi.Catalog.CourseModule

    timestamps()
  end

  def changeset(lesson, attrs) do
    lesson
    |> cast(attrs, [:position, :title, :lesson_type, :duration_minutes,
                    :is_published, :content, :course_module_id])
    |> validate_required([:position, :title, :course_module_id])
    |> assoc_constraint(:course_module)
  end
end