defmodule LmsApi.Permissions.UserRole do
  use Ecto.Schema
  import Ecto.Changeset

  schema "user_roles" do
    field :assigned_at, :utc_datetime
    field :assigned_by, :integer

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :role, LmsApi.Permissions.Role

    timestamps()
  end

  @doc false
  def changeset(user_role, attrs) do
    user_role
    |> cast(attrs, [:user_id, :role_id, :assigned_by])
    |> validate_required([:user_id, :role_id])
    |> put_assigned_at()
    |> assoc_constraint(:user)
    |> assoc_constraint(:role)
    |> unique_constraint([:user_id], name: :user_roles_user_id_unique)
  end

  defp put_assigned_at(changeset) do
    if get_field(changeset, :assigned_at) == nil do
      put_change(changeset, :assigned_at, DateTime.utc_now())
    else
      changeset
    end
  end
end