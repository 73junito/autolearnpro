defmodule LmsApi.Gamification.UserBadge do
  use Ecto.Schema
  import Ecto.Changeset

  schema "user_badges" do
    field :awarded_at, :naive_datetime

    belongs_to :user, LmsApi.Accounts.User
    belongs_to :badge, LmsApi.Gamification.Badge

    timestamps()
  end

  @doc false
  def changeset(user_badge, attrs) do
    user_badge
    |> cast(attrs, [:user_id, :badge_id, :awarded_at])
    |> validate_required([:user_id, :badge_id])
    |> put_awarded_at()
    |> unique_constraint([:user_id, :badge_id])
    |> assoc_constraint(:user)
    |> assoc_constraint(:badge)
  end

  defp put_awarded_at(changeset) do
    if get_field(changeset, :awarded_at) == nil do
      put_change(changeset, :awarded_at, NaiveDateTime.utc_now())
    else
      changeset
    end
  end
end