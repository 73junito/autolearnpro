defmodule LmsApi.Organizations.Organization do
  use Ecto.Schema
  import Ecto.Changeset

  schema "organizations" do
    field :name, :string
    field :description, :string
    field :domain, :string
    field :logo_url, :string
    field :settings, :map, default: %{}
    field :is_active, :boolean, default: true

    has_many :members, LmsApi.Organizations.OrganizationMember

    timestamps()
  end

  @doc false
  def changeset(organization, attrs) do
    organization
    |> cast(attrs, [:name, :description, :domain, :logo_url, :settings, :is_active])
    |> validate_required([:name])
    |> validate_length(:name, min: 2, max: 100)
    |> validate_length(:domain, min: 3, max: 100)
    |> unique_constraint(:domain)
  end
end