defmodule LmsApi.Permissions.RolePermission do
  use Ecto.Schema
  import Ecto.Changeset

  schema "role_permissions" do
    belongs_to :role, LmsApi.Permissions.Role
    belongs_to :permission, LmsApi.Permissions.Permission

    timestamps()
  end

  @doc false
  def changeset(role_permission, attrs) do
    role_permission
    |> cast(attrs, [:role_id, :permission_id])
    |> validate_required([:role_id, :permission_id])
    |> assoc_constraint(:role)
    |> assoc_constraint(:permission)
    |> unique_constraint([:role_id, :permission_id], name: :role_permissions_role_id_permission_id_unique)
  end
end