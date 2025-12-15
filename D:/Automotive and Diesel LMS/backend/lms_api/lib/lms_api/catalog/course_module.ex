defmodule LmsApi.Catalog.CourseModule do
  use Ecto.Schema
  import Ecto.Changeset

  schema "course_modules" do
    field :position, :integer
    field :title, :string
    field :summary, :string
    field :start_date, :date
    field :end_date, :date
    field :published, :boolean, default: true

    belongs_to :course, LmsApi.Catalog.Course
    has_many :lessons, LmsApi.Catalog.ModuleLesson

    timestamps()
  end

  def changeset(module, attrs) do
    module
    |> cast(attrs, [:position, :title, :summary, :start_date, :end_date, :published, :course_id])
    |> validate_required([:position, :title, :course_id])
    |> assoc_constraint(:course)
  end
end