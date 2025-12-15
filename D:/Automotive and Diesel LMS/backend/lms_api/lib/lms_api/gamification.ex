defmodule LmsApi.Gamification do
  @moduledoc """
  The Gamification context for badges, achievements, and progress tracking.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Gamification.{Badge, Achievement, UserBadge, Leaderboard}

  @doc """
  Returns the list of badges.

  ## Examples

      iex> list_badges()
      [%Badge{}, ...]

  """
  def list_badges do
    Repo.all(Badge)
  end

  @doc """
  Gets a single badge.

  Raises `Ecto.NoResultsError` if the Badge does not exist.

  ## Examples

      iex> get_badge!(123)
      %Badge{}

      iex> get_badge!(456)
      ** (Ecto.NoResultsError)

  """
  def get_badge!(id), do: Repo.get!(Badge, id)

  @doc """
  Creates a badge.

  ## Examples

      iex> create_badge(%{field: value})
      {:ok, %Badge{}}

      iex> create_badge(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_badge(attrs \\ %{}) do
    %Badge{}
    |> Badge.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a badge.

  ## Examples

      iex> update_badge(badge, %{field: new_value})
      {:ok, %Badge{}}

      iex> update_badge(badge, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_badge(%Badge{} = badge, attrs) do
    badge
    |> Badge.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a badge.

  ## Examples

      iex> delete_badge(badge)
      {:ok, %Badge{}}

      iex> delete_badge(badge)
      {:error, %Ecto.Changeset{}}

  """
  def delete_badge(%Badge{} = badge) do
    Repo.delete(badge)
  end

  @doc """
  Awards a badge to a user.

  ## Examples

      iex> award_badge(123, 456)
      {:ok, %UserBadge{}}

  """
  def award_badge(user_id, badge_id) do
    # Check if user already has this badge
    existing = Repo.get_by(UserBadge, user_id: user_id, badge_id: badge_id)

    if existing do
      {:error, :already_awarded}
    else
      %UserBadge{}
      |> UserBadge.changeset(%{user_id: user_id, badge_id: badge_id})
      |> Repo.insert()
    end
  end

  @doc """
  Gets user's badges.

  ## Examples

      iex> get_user_badges(123)
      [%Badge{}, ...]

  """
  def get_user_badges(user_id) do
    UserBadge
    |> where([ub], ub.user_id == ^user_id)
    |> join(:inner, [ub], b in Badge, on: ub.badge_id == b.id)
    |> select([ub, b], b)
    |> Repo.all()
  end

  @doc """
  Checks and awards achievement badges based on user progress.

  ## Examples

      iex> check_achievements(123)
      :ok

  """
  def check_achievements(user_id) do
    user = LmsApi.Accounts.get_user!(user_id)

    # Check various achievement conditions
    check_course_completion_achievements(user_id)
    check_assessment_achievements(user_id)
    check_streak_achievements(user_id)
    check_social_achievements(user_id)

    :ok
  end

  @doc """
  Gets leaderboard for a course.

  ## Examples

      iex> get_course_leaderboard(123)
      [%{user: %User{}, score: 100, rank: 1}, ...]

  """
  def get_course_leaderboard(course_id) do
    # Calculate scores based on progress, assessments, and engagement
    # This is a simplified version - in production, you'd have a more complex scoring system

    query = """
    SELECT
      u.id,
      u.full_name,
      COALESCE(p.completion_percentage, 0) as progress_score,
      COALESCE(a.avg_score, 0) as assessment_score,
      ROW_NUMBER() OVER (ORDER BY (COALESCE(p.completion_percentage, 0) + COALESCE(a.avg_score, 0)) DESC) as rank
    FROM users u
    LEFT JOIN enrollments e ON u.id = e.user_id AND e.course_id = $1
    LEFT JOIN progress p ON u.id = p.user_id AND p.course_id = $1
    LEFT JOIN (
      SELECT user_id, AVG(percentage) as avg_score
      FROM assessment_attempts aa
      JOIN assessments a ON aa.assessment_id = a.id AND a.course_id = $1
      WHERE aa.status = 'passed'
      GROUP BY user_id
    ) a ON u.id = a.user_id
    WHERE e.status = 'enrolled'
    ORDER BY rank
    LIMIT 10
    """

    case Repo.query(query, [course_id]) do
      {:ok, result} ->
        Enum.map(result.rows, fn [id, full_name, progress_score, assessment_score, rank] ->
          %{
            user: %{id: id, full_name: full_name},
            score: Float.round(progress_score + assessment_score, 1),
            rank: rank
          }
        end)
      {:error, _} ->
        []
    end
  end

  @doc """
  Updates user points and checks for level ups.

  ## Examples

      iex> add_points(123, 50, "completed_lesson")
      {:ok, %{new_level: false, points_added: 50}}

  """
  def add_points(user_id, points, reason) do
    # In a real implementation, you'd have a user_points table
    # For now, we'll just check achievements

    check_achievements(user_id)

    {:ok, %{new_level: false, points_added: points, reason: reason}}
  end

  # Private functions

  defp check_course_completion_achievements(user_id) do
    # First course completed
    completed_courses = LmsApi.Progress.get_user_completed_courses(user_id)
    if length(completed_courses) >= 1 do
      award_badge_if_not_exists(user_id, "first_course")
    end

    # Multiple courses completed
    if length(completed_courses) >= 5 do
      award_badge_if_not_exists(user_id, "course_master")
    end
  end

  defp check_assessment_achievements(user_id) do
    # Perfect score
    perfect_scores = Repo.one(
      from aa in LmsApi.Assessments.AssessmentAttempt,
      where: aa.user_id == ^user_id and aa.percentage == 100.0,
      select: count(aa.id)
    )

    if perfect_scores > 0 do
      award_badge_if_not_exists(user_id, "perfect_score")
    end

    # Assessment streak
    # This would require tracking consecutive good performances
  end

  defp check_streak_achievements(user_id) do
    # Daily login streak
    # Weekly study streak
    # These would require additional tracking tables
  end

  defp check_social_achievements(user_id) do
    # Help others, participate in discussions, etc.
    # Would require discussion/forum functionality
  end

  defp award_badge_if_not_exists(user_id, badge_name) do
    badge = Repo.get_by(Badge, name: badge_name)
    if badge do
      award_badge(user_id, badge.id)
    end
  end
end