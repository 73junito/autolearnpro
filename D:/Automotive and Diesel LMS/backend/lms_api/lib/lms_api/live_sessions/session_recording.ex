defmodule LmsApi.LiveSessions.SessionRecording do
  use Ecto.Schema
  import Ecto.Changeset

  schema "session_recordings" do
    field :recording_url, :string
    field :recording_id, :string
    field :duration_seconds, :integer
    field :file_size_bytes, :integer
    field :format, :string, default: "mp4"
    field :status, :string, default: "processing"  # processing, completed, failed

    belongs_to :session, LmsApi.LiveSessions.LiveSession

    timestamps()
  end

  @doc false
  def changeset(session_recording, attrs) do
    session_recording
    |> cast(attrs, [:recording_url, :recording_id, :duration_seconds,
                    :file_size_bytes, :format, :status, :session_id])
    |> validate_required([:recording_url, :session_id])
    |> validate_inclusion(:status, ["processing", "completed", "failed"])
    |> assoc_constraint(:session)
  end
end