defmodule LmsApi.LiveSessions.LiveSession do
  use Ecto.Schema
  import Ecto.Changeset

  schema "live_sessions" do
    field :title, :string
    field :description, :string
    field :scheduled_at, :utc_datetime
    field :duration_minutes, :integer
    field :meeting_url, :string
    field :meeting_id, :string
    field :status, :string, default: "scheduled"  # scheduled, active, ended, cancelled
    field :started_at, :utc_datetime
    field :ended_at, :utc_datetime
    field :max_participants, :integer
    field :is_recording_enabled, :boolean, default: true
    field :settings, :map, default: %{}

    belongs_to :course, LmsApi.Catalog.Course
    belongs_to :host, LmsApi.Accounts.User

    has_many :participants, LmsApi.LiveSessions.SessionParticipant
    has_many :recordings, LmsApi.LiveSessions.SessionRecording

    timestamps()
  end

  @doc false
  def changeset(live_session, attrs) do
    live_session
    |> cast(attrs, [:title, :description, :scheduled_at, :duration_minutes,
                    :meeting_url, :meeting_id, :status, :started_at, :ended_at,
                    :max_participants, :is_recording_enabled, :settings,
                    :course_id, :host_id])
    |> validate_required([:title, :scheduled_at, :course_id, :host_id])
    |> validate_inclusion(:status, ["scheduled", "active", "ended", "cancelled"])
    |> validate_number(:duration_minutes, greater_than: 0)
    |> validate_number(:max_participants, greater_than: 0)
    |> assoc_constraint(:course)
    |> assoc_constraint(:host)
  end
end