defmodule LmsApi.LiveSessions.SessionParticipant do
  use Ecto.Schema
  import Ecto.Changeset

  schema "session_participants" do
    field :joined_at, :utc_datetime
    field :left_at, :utc_datetime
    field :is_moderator, :boolean, default: false
    field :participation_score, :float, default: 0.0

    belongs_to :session, LmsApi.LiveSessions.LiveSession
    belongs_to :user, LmsApi.Accounts.User

    timestamps()
  end

  @doc false
  def changeset(session_participant, attrs) do
    session_participant
    |> cast(attrs, [:joined_at, :left_at, :is_moderator, :participation_score,
                    :session_id, :user_id])
    |> validate_required([:session_id, :user_id])
    |> put_joined_at()
    |> assoc_constraint(:session)
    |> assoc_constraint(:user)
  end

  defp put_joined_at(changeset) do
    if get_field(changeset, :joined_at) == nil do
      put_change(changeset, :joined_at, DateTime.utc_now())
    else
      changeset
    end
  end
end