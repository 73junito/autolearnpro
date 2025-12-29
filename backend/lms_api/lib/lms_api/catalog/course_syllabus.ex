defmodule LmsApi.Catalog.CourseSyllabus do
  use Ecto.Schema
  import Ecto.Changeset

  schema "course_syllabus" do
    field :learning_outcomes, {:array, :string}
    field :assessment_methods, {:array, :string}
    field :grading_breakdown, :map
    field :prerequisites, {:array, :string}
    field :required_materials, :string
    field :course_policies, :string

    belongs_to :course, LmsApi.Catalog.Course

    timestamps()
  end

  def changeset(syllabus, attrs) do
    syllabus
    |> cast(attrs, [:learning_outcomes, :assessment_methods, :grading_breakdown,
                    :prerequisites, :required_materials, :course_policies, :course_id])
    |> validate_required([:course_id, :learning_outcomes])
    |> assoc_constraint(:course)
    |> unique_constraint(:course_id)
  end
end
