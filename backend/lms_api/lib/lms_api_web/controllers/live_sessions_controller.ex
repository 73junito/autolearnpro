defmodule LmsApiWeb.LiveSessionsController do
  use LmsApiWeb, :controller

  alias LmsApi.LiveSessions
  alias LmsApi.InstructorDashboard

  action_fallback LmsApiWeb.FallbackController

  def index(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user can view sessions for this course
    if InstructorDashboard.can_view_analytics?(user, course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, course_id) do
      sessions = LiveSessions.list_course_sessions(course_id)
      render(conn, "index.json", sessions: sessions)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def create(conn, %{"course_id" => course_id, "live_session" => session_params}) do
    user = Guardian.Plug.current_resource(conn)

    if InstructorDashboard.can_manage_course?(user, course_id) do
      # Generate meeting URL
      meeting_url = LiveSessions.generate_meeting_url("temp")

      session_attrs = Map.merge(session_params, %{
        "course_id" => course_id,
        "host_id" => user.id,
        "meeting_url" => meeting_url
      })

      with {:ok, session} <- LiveSessions.create_live_session(session_attrs) do
        # Update meeting URL with actual session ID
        final_meeting_url = LiveSessions.generate_meeting_url(session.id)
        {:ok, updated_session} = LiveSessions.update_live_session(session, %{meeting_url: final_meeting_url})

        conn
        |> put_status(:created)
        |> render("show.json", live_session: updated_session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def show(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check access
    if session.host_id == user.id ||
       InstructorDashboard.can_manage_course?(user, session.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, session.course_id) do
      render(conn, "show.json", live_session: session)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update(conn, %{"id" => id, "live_session" => session_params}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    if session.host_id == user.id || InstructorDashboard.can_manage_course?(user, session.course_id) do
      with {:ok, session} <- LiveSessions.update_live_session(session, session_params) do
        render(conn, "show.json", live_session: session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    if session.host_id == user.id || InstructorDashboard.can_manage_course?(user, session.course_id) do
      with {:ok, session} <- LiveSessions.delete_live_session(session) do
        render(conn, "show.json", live_session: session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def start_session(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    if session.host_id == user.id || InstructorDashboard.can_manage_course?(user, session.course_id) do
      with {:ok, session} <- LiveSessions.start_session(id) do
        # Add host as participant
        LiveSessions.add_participant(id, user.id)
        render(conn, "show.json", live_session: session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def end_session(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    if session.host_id == user.id || InstructorDashboard.can_manage_course?(user, session.course_id) do
      with {:ok, session} <- LiveSessions.end_session(id) do
        render(conn, "show.json", live_session: session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def join_session(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check access - user must be host, course manager, or enrolled in the course
    if session.host_id == user.id ||
       InstructorDashboard.can_manage_course?(user, session.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, session.course_id) do
      with {:ok, _participant} <- LiveSessions.add_participant(id, user.id) do
        render(conn, "show.json", live_session: session)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def leave_session(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check access - user must be host, course manager, or enrolled in the course
    if session.host_id == user.id ||
       InstructorDashboard.can_manage_course?(user, session.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, session.course_id) do
      with {:ok, _participant} <- LiveSessions.remove_participant(id, user.id) do
        json(conn, %{message: "Left session successfully"})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def participants(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check access
    if session.host_id == user.id ||
       InstructorDashboard.can_manage_course?(user, session.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, session.course_id) do
      participants = LiveSessions.get_session_participants(id)
      render(conn, "participants.json", participants: participants)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def recordings(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    # Check access
    if session.host_id == user.id ||
       InstructorDashboard.can_manage_course?(user, session.course_id) ||
       LmsApi.Enrollments.user_enrolled_in_course?(user.id, session.course_id) do
      recordings = LiveSessions.get_session_recordings(id)
      render(conn, "recordings.json", recordings: recordings)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def analytics(conn, %{"id" => id}) do
    session = LiveSessions.get_live_session!(id)
    user = Guardian.Plug.current_resource(conn)

    if session.host_id == user.id || InstructorDashboard.can_manage_course?(user, session.course_id) do
      analytics = LiveSessions.get_session_analytics(id)
      json(conn, %{data: analytics})
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end