defmodule LmsApi.Catalog.Course do
  use Ecto.Schema
  import Ecto.Changeset

  schema "courses" do
    field :code, :string
    field :title, :string
    field :description, :string
    field :credits, :integer
    field :delivery_mode, :string
    field :active, :boolean, default: true

    has_one :syllabus, LmsApi.Catalog.CourseSyllabus
    has_many :modules, LmsApi.Catalog.CourseModule

    timestamps()
  end

  @doc false
  def changeset(course, attrs) do
    course
    |> cast(attrs, [:code, :title, :description, :credits, :delivery_mode, :active])
    |> validate_required([:code, :title, :credits, :delivery_mode, :active])
    |> unique_constraint(:code)
  end
end