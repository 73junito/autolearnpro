defmodule LmsApi.Media.FileUpload do
  use Ecto.Schema
  import Ecto.Changeset

  schema "file_uploads" do
    field :file_name, :string
    field :file_path, :string
    field :file_size, :integer
    field :content_type, :string
    field :description, :string
    field :is_public, :boolean, default: false

    belongs_to :uploaded_by, LmsApi.Accounts.User
    belongs_to :course, LmsApi.Catalog.Course

    timestamps()
  end

  @doc false
  def changeset(file_upload, attrs) do
    file_upload
    |> cast(attrs, [:file_name, :file_path, :file_size, :content_type,
                    :description, :is_public, :uploaded_by, :course_id])
    |> validate_required([:file_name, :file_path, :file_size, :content_type, :uploaded_by])
    |> validate_number(:file_size, greater_than: 0)
    |> assoc_constraint(:uploaded_by)
    |> assoc_constraint(:course)
  end
end