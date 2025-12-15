defmodule LmsApi.Security.LoginAttempt do
  use Ecto.Schema
  import Ecto.Changeset

  schema "login_attempts" do
    field :email, :string
    field :success, :boolean, default: false
    field :ip_address, :string
    field :user_agent, :string
    field :attempted_at, :utc_datetime

    timestamps()
  end

  @doc false
  def changeset(login_attempt, attrs) do
    login_attempt
    |> cast(attrs, [:email, :success, :ip_address, :user_agent])
    |> validate_required([:email, :success])
    |> put_attempted_at()
  end

  defp put_attempted_at(changeset) do
    if get_field(changeset, :attempted_at) == nil do
      put_change(changeset, :attempted_at, DateTime.utc_now())
    else
      changeset
    end
  end
end