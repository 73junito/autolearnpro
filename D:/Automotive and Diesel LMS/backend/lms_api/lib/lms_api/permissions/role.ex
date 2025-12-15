defmodule LmsApi.Permissions.Role do
  use Ecto.Schema
  import Ecto.Changeset

  schema "roles" do
    field :name, :string
    field :description, :string
    field :is_system_role, :boolean, default: false

    has_many :user_roles, LmsApi.Permissions.UserRole
    has_many :role_permissions, LmsApi.Permissions.RolePermission

    timestamps()
  end

  @doc false
  def changeset(role, attrs) do
    role
    |> cast(attrs, [:name, :description, :is_system_role])
    |> validate_required([:name])
    |> validate_length(:name, min: 2, max: 50)
    |> unique_constraint(:name)
  end
end