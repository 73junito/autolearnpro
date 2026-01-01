defmodule LmsApi.Gamification.Badge do
  use Ecto.Schema
  import Ecto.Changeset

  schema "badges" do
    field :name, :string
    field :title, :string
    field :description, :string
    field :icon, :string
    field :color, :string
    field :rarity, :string, default: "common"  # common, rare, epic, legendary
    field :criteria, :string  # Description of how to earn the badge

    timestamps()
  end

  @doc false
  def changeset(badge, attrs) do
    badge
    |> cast(attrs, [:name, :title, :description, :icon, :color, :rarity, :criteria])
    |> validate_required([:name, :title, :description])
    |> validate_inclusion(:rarity, ["common", "rare", "epic", "legendary"])
    |> unique_constraint(:name)
  end
end