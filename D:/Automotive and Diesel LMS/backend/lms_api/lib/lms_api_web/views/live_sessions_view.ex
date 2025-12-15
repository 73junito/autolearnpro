defmodule LmsApiWeb.LiveSessionsView do
  use LmsApiWeb, :view

  def render("index.json", %{sessions: sessions}) do
    %{
      data: render_many(sessions, __MODULE__, "live_session.json", as: :live_session)
    }
  end

  def render("show.json", %{live_session: live_session}) do
    %{
      data: render_one(live_session, __MODULE__, "live_session.json", as: :live_session)
    }
  end

  def render("live_session.json", %{live_session: live_session}) do
    %{
      id: live_session.id,
      title: live_session.title,
      description: live_session.description,
      scheduled_at: live_session.scheduled_at,
      duration_minutes: live_session.duration_minutes,
      meeting_url: live_session.meeting_url,
      meeting_id: live_session.meeting_id,
      status: live_session.status,
      started_at: live_session.started_at,
      ended_at: live_session.ended_at,
      max_participants: live_session.max_participants,
      is_recording_enabled: live_session.is_recording_enabled,
      settings: live_session.settings,
      course_id: live_session.course_id,
      host_id: live_session.host_id,
      host: render_user(live_session.host),
      created_at: live_session.inserted_at,
      updated_at: live_session.updated_at
    }
  end

  def render("participants.json", %{participants: participants}) do
    %{
      data: Enum.map(participants, fn %{participant: participant, user: user} ->
        %{
          id: participant.id,
          joined_at: participant.joined_at,
          left_at: participant.left_at,
          is_moderator: participant.is_moderator,
          participation_score: participant.participation_score,
          user: render_user(user)
        }
      end)
    }
  end

  def render("recordings.json", %{recordings: recordings}) do
    %{
      data: render_many(recordings, __MODULE__, "recording.json", as: :recording)
    }
  end

  def render("recording.json", %{recording: recording}) do
    %{
      id: recording.id,
      recording_url: recording.recording_url,
      recording_id: recording.recording_id,
      duration_seconds: recording.duration_seconds,
      file_size_bytes: recording.file_size_bytes,
      format: recording.format,
      status: recording.status,
      session_id: recording.session_id,
      created_at: recording.inserted_at
    }
  end

  defp render_user(user) do
    %{
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    }
  end
end