defmodule LmsApi.LiveSessions do
  @moduledoc """
  The Live Sessions context for video conferencing and virtual classrooms.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.LiveSessions.{LiveSession, SessionParticipant, SessionRecording}

  @doc """
  Returns the list of live sessions.

  ## Examples

      iex> list_live_sessions()
      [%LiveSession{}, ...]

  """
  def list_live_sessions do
    Repo.all(LiveSession)
  end

  @doc """
  Gets a single live session.

  Raises `Ecto.NoResultsError` if the LiveSession does not exist.

  ## Examples

      iex> get_live_session!(123)
      %LiveSession{}

      iex> get_live_session!(456)
      ** (Ecto.NoResultsError)

  """
  def get_live_session!(id), do: Repo.get!(LiveSession, id)

  @doc """
  Creates a live session.

  ## Examples

      iex> create_live_session(%{field: value})
      {:ok, %LiveSession{}}

      iex> create_live_session(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_live_session(attrs \\ %{}) do
    %LiveSession{}
    |> LiveSession.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a live session.

  ## Examples

      iex> update_live_session(live_session, %{field: new_value})
      {:ok, %LiveSession{}}

      iex> update_live_session(live_session, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_live_session(%LiveSession{} = live_session, attrs) do
    live_session
    |> LiveSession.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a live session.

  ## Examples

      iex> delete_live_session(live_session)
      {:ok, %LiveSession{}}

      iex> delete_live_session(live_session)
      {:error, %Ecto.Changeset{}}

  """
  def delete_live_session(%LiveSession{} = live_session) do
    Repo.delete(live_session)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking live session changes.

  ## Examples

      iex> change_live_session(live_session)
      %Ecto.Changeset{data: %LiveSession{}}

  """
  def change_live_session(%LiveSession{} = live_session, attrs \\ %{}) do
    LiveSession.changeset(live_session, attrs)
  end

  @doc """
  Lists live sessions for a course.

  ## Examples

      iex> list_course_sessions(123)
      [%LiveSession{}, ...]

  """
  def list_course_sessions(course_id) do
    LiveSession
    |> where([ls], ls.course_id == ^course_id)
    |> order_by([ls], desc: ls.scheduled_at)
    |> Repo.all()
  end

  @doc """
  Lists upcoming live sessions for a course.

  ## Examples

      iex> list_upcoming_sessions(123)
      [%LiveSession{}, ...]

  """
  def list_upcoming_sessions(course_id) do
    now = DateTime.utc_now()

    LiveSession
    |> where([ls], ls.course_id == ^course_id and ls.scheduled_at > ^now)
    |> where([ls], ls.status in ["scheduled", "active"])
    |> order_by([ls], asc: ls.scheduled_at)
    |> Repo.all()
  end

  @doc """
  Starts a live session.

  ## Examples

      iex> start_session(123)
      {:ok, %LiveSession{}}

  """
  def start_session(session_id) do
    session = get_live_session!(session_id)

    update_live_session(session, %{
      status: "active",
      started_at: DateTime.utc_now()
    })
  end

  @doc """
  Ends a live session.

  ## Examples

      iex> end_session(123)
      {:ok, %LiveSession{}}

  """
  def end_session(session_id) do
    session = get_live_session!(session_id)

    update_live_session(session, %{
      status: "ended",
      ended_at: DateTime.utc_now()
    })
  end

  @doc """
  Adds a participant to a live session.

  ## Examples

      iex> add_participant(123, 456)
      {:ok, %SessionParticipant{}}

  """
  def add_participant(session_id, user_id) do
    # Check if already participating
    existing = Repo.get_by(SessionParticipant, session_id: session_id, user_id: user_id)

    if existing do
      {:ok, existing}
    else
      %SessionParticipant{}
      |> SessionParticipant.changeset(%{session_id: session_id, user_id: user_id})
      |> Repo.insert()
    end
  end

  @doc """
  Removes a participant from a live session.

  ## Examples

      iex> remove_participant(123, 456)
      {:ok, %SessionParticipant{}}

  """
  def remove_participant(session_id, user_id) do
    participant = Repo.get_by!(SessionParticipant, session_id: session_id, user_id: user_id)
    Repo.delete(participant)
  end

  @doc """
  Gets session participants.

  ## Examples

      iex> get_session_participants(123)
      [%SessionParticipant{}, ...]

  """
  def get_session_participants(session_id) do
    SessionParticipant
    |> where([sp], sp.session_id == ^session_id)
    |> join(:inner, [sp], u in LmsApi.Accounts.User, on: sp.user_id == u.id)
    |> select([sp, u], %{participant: sp, user: u})
    |> Repo.all()
  end

  @doc """
  Creates a session recording.

  ## Examples

      iex> create_recording(%{session_id: 123, recording_url: "url"})
      {:ok, %SessionRecording{}}

  """
  def create_recording(attrs \\ %{}) do
    %SessionRecording{}
    |> SessionRecording.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Gets recordings for a session.

  ## Examples

      iex> get_session_recordings(123)
      [%SessionRecording{}, ...]

  """
  def get_session_recordings(session_id) do
    SessionRecording
    |> where([sr], sr.session_id == ^session_id)
    |> order_by([sr], desc: sr.created_at)
    |> Repo.all()
  end

  @doc """
  Generates a unique meeting URL for a session.

  ## Examples

      iex> generate_meeting_url(123)
      "https://meet.jit.si/lms-session-123-abc123"

  """
  def generate_meeting_url(session_id) do
    # For Jitsi Meet integration
    room_id = "lms-session-#{session_id}-#{:crypto.strong_rand_bytes(4) |> Base.encode16() |> String.downcase()}"
    "https://meet.jit.si/#{room_id}"
  end

  @doc """
  Gets session analytics.

  ## Examples

      iex> get_session_analytics(123)
      %{participants: 15, duration: 3600, engagement_score: 8.5}

  """
  def get_session_analytics(session_id) do
    session = get_live_session!(session_id)
    participants = get_session_participants(session_id)

    # Calculate basic analytics
    participant_count = length(participants)
    duration = if session.started_at && session.ended_at do
      DateTime.diff(session.ended_at, session.started_at)
    else
      0
    end

    # Mock engagement score (would be calculated from actual participation data)
    engagement_score = if participant_count > 0 do
      min(10.0, participant_count * 0.5 + :rand.uniform(5))
    else
      0.0
    end

    %{
      participants: participant_count,
      duration: duration,
      engagement_score: Float.round(engagement_score, 1),
      recordings: length(get_session_recordings(session_id))
    }
  end
end