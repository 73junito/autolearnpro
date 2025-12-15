defmodule LmsApi.LabScene do
  @moduledoc """
  Ecto schema for ClassroomSceneDefinition storage.

  Fields:
  - `scene_id`: unique identifier (string)
  - `title`: human title
  - `course_ids`: array of course codes the scene belongs to
  - `discipline`: domain (e.g., diesel, auto, ev)
  - `difficulty`: e.g., beginner/intermediate/advanced
  - `version`: integer version
  - `payload`: full ClassroomSceneDefinition JSON stored as map
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @derive {Jason.Encoder, only: [:id, :scene_id, :title, :discipline, :difficulty, :version, :course_ids, :payload, :inserted_at, :updated_at]}
  schema "lab_scenes" do
    field :scene_id, :string
    field :title, :string
    field :course_ids, {:array, :string}, default: []
    field :discipline, :string
    field :difficulty, :string
    field :version, :integer, default: 1
    field :payload, :map

    timestamps()
  end

  @doc false
  def changeset(lab_scene, attrs) do
    lab_scene
    |> cast(attrs, [:scene_id, :title, :course_ids, :discipline, :difficulty, :version, :payload])
    |> validate_required([:scene_id, :payload])
    |> unique_constraint(:scene_id)
  end
end
