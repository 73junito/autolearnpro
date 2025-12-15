defmodule LmsApi.Catalog.CourseSyllabus do
  use Ecto.Schema
  import Ecto.Changeset

  schema "course_syllabi" do
    field :overview, :string
    field :learning_outcomes, :string
    field :required_materials, :string
    field :grading_policy, :string
    field :attendance_policy, :string
    field :schedule_notes, :string

    belongs_to :course, LmsApi.Catalog.Course

    timestamps()
  end

  def changeset(syllabus, attrs) do
    syllabus
    |> cast(attrs, [:overview, :learning_outcomes, :required_materials,
                    :grading_policy, :attendance_policy, :schedule_notes, :course_id])
    |> validate_required([:course_id])
    |> assoc_constraint(:course)
  end
end