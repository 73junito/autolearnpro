defmodule LmsApiWeb.GamificationController do
  use LmsApiWeb, :controller

  alias LmsApi.Gamification

  action_fallback LmsApiWeb.FallbackController

  def user_badges(conn, _params) do
    user = Guardian.Plug.current_resource(conn)
    badges = Gamification.get_user_badges(user.id)
    render(conn, "badges.json", badges: badges)
  end

  def course_leaderboard(conn, %{"course_id" => course_id}) do
    user = Guardian.Plug.current_resource(conn)

    # Check if user can view this leaderboard
    if LmsApi.Enrollments.user_enrolled_in_course?(user.id, course_id) ||
       LmsApi.InstructorDashboard.can_view_analytics?(user, course_id) do
      leaderboard = Gamification.get_course_leaderboard(course_id)
      json(conn, %{data: leaderboard})
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def award_badge(conn, %{"user_id" => user_id, "badge_id" => badge_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    # Only instructors can award badges
    if current_user.role == "instructor" do
      case Gamification.award_badge(String.to_integer(user_id), String.to_integer(badge_id)) do
        {:ok, user_badge} ->
          render(conn, "user_badge.json", user_badge: user_badge)
        {:error, :already_awarded} ->
          conn
          |> put_status(:conflict)
          |> json(%{error: "Badge already awarded"})
        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> render("error.json", changeset: changeset)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def check_achievements(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    Gamification.check_achievements(user.id)
    json(conn, %{message: "Achievements checked"})
  end

  def badges(conn, _params) do
    badges = Gamification.list_badges()
    render(conn, "badges.json", badges: badges)
  end
end