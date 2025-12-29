defmodule LmsApi.Catalog.ModuleLesson do
  use Ecto.Schema
  import Ecto.Changeset

  schema "module_lessons" do
    field :title, :string
    field :description, :string
    field :content, :string
    field :sequence_number, :integer
    field :lesson_type, :string, default: "lecture"
    field :duration_minutes, :integer
    field :objectives, {:array, :string}
    field :media_url, :string
    field :active, :boolean, default: true

    belongs_to :module, LmsApi.Catalog.CourseModule

    timestamps()
  end

  def changeset(lesson, attrs) do
    lesson
    |> cast(attrs, [:title, :description, :content, :sequence_number, :lesson_type,
                    :duration_minutes, :objectives, :media_url, :active, :module_id])
    |> validate_required([:title, :sequence_number, :module_id])
    |> validate_inclusion(:lesson_type, ["lecture", "lab", "assessment", "video", "reading"])
    |> assoc_constraint(:module)
  end
end
