defmodule LmsApi.Catalog.Course do
  use Ecto.Schema
  import Ecto.Changeset

  schema "courses" do
    field :code, :string
    field :title, :string
    field :description, :string
    field :credits, :float
    field :delivery_mode, :string
    field :level, :string
    field :duration_hours, :integer
    field :active, :boolean, default: true

    has_one :syllabus, LmsApi.Catalog.CourseSyllabus
    has_many :modules, LmsApi.Catalog.CourseModule

    timestamps()
  end

  @doc false
  def changeset(course, attrs) do
    course
    |> cast(attrs, [:code, :title, :description, :credits, :delivery_mode,
                    :level, :duration_hours, :active])
    |> validate_required([:code, :title, :credits, :delivery_mode, :active])
    |> validate_inclusion(:delivery_mode, ["online", "in_person", "hybrid"])
    |> validate_inclusion(:level, ["lower_division", "upper_division", "graduate"])
    |> unique_constraint(:code)
  end
end
