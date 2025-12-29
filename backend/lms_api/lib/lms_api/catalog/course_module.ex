defmodule LmsApi.Catalog.CourseModule do
  use Ecto.Schema
  import Ecto.Changeset

  schema "course_modules" do
    field :title, :string
    field :description, :string
    field :sequence_number, :integer
    field :duration_weeks, :integer
    field :objectives, {:array, :string}
    field :active, :boolean, default: true

    belongs_to :course, LmsApi.Catalog.Course
    has_many :lessons, LmsApi.Catalog.ModuleLesson

    timestamps()
  end

  def changeset(module, attrs) do
    module
    |> cast(attrs, [:title, :description, :sequence_number, :duration_weeks,
                    :objectives, :active, :course_id])
    |> validate_required([:title, :sequence_number, :course_id])
    |> assoc_constraint(:course)
  end
end
