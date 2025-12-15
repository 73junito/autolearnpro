defmodule LmsApi.Organizations.OrganizationMember do
  use Ecto.Schema
  import Ecto.Changeset

  schema "organization_members" do
    field :role, :string, default: "member"  # owner, admin, instructor, member
    field :joined_at, :utc_datetime

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :organization, LmsApi.Organizations.Organization

    timestamps()
  end

  @doc false
  def changeset(organization_member, attrs) do
    organization_member
    |> cast(attrs, [:user_id, :organization_id, :role])
    |> validate_required([:user_id, :organization_id])
    |> validate_inclusion(:role, ["owner", "admin", "instructor", "member"])
    |> put_joined_at()
    |> assoc_constraint(:user)
    |> assoc_constraint(:organization)
    |> unique_constraint([:user_id, :organization_id], name: :organization_members_user_id_organization_id_unique)
  end

  defp put_joined_at(changeset) do
    if get_field(changeset, :joined_at) == nil do
      put_change(changeset, :joined_at, DateTime.utc_now())
    else
      changeset
    end
  end
end