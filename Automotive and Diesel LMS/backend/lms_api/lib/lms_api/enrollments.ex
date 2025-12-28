defmodule LmsApi.Enrollments do
  @moduledoc """
  The Enrollments context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo

  alias LmsApi.Enrollments.Enrollment

  @doc """
  Returns the list of enrollments.

  ## Examples

      iex> list_enrollments()
      [%Enrollment{}, ...]

  """
  def list_enrollments do
    Repo.all(Enrollment)
  end

  @doc """
  Gets a single enrollment.

  Raises `Ecto.NoResultsError` if the Enrollment does not exist.

  ## Examples

      iex> get_enrollment!(123)
      %Enrollment{}

      iex> get_enrollment!(456)
      ** (Ecto.NoResultsError)

  """
  def get_enrollment!(id), do: Repo.get!(Enrollment, id)

  @doc """
  Creates a enrollment.

  ## Examples

      iex> create_enrollment(%{field: value})
      {:ok, %Enrollment{}}

      iex> create_enrollment(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_enrollment(attrs \\ %{}) do
    %Enrollment{}
    |> Enrollment.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a enrollment.

  ## Examples

      iex> update_enrollment(enrollment, %{field: new_value})
      {:ok, %Enrollment{}}

      iex> update_enrollment(enrollment, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_enrollment(%Enrollment{} = enrollment, attrs) do
    enrollment
    |> Enrollment.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a enrollment.

  ## Examples

      iex> delete_enrollment(enrollment)
      {:ok, %Enrollment{}}

      iex> delete_enrollment(enrollment)
      {:error, %Ecto.Changeset{}}

  """
  def delete_enrollment(%Enrollment{} = enrollment) do
    Repo.delete(enrollment)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking enrollment changes.

  ## Examples

      iex> change_enrollment(enrollment)
      %Ecto.Changeset{data: %Enrollment{}}

  """
  def change_enrollment(%Enrollment{} = enrollment, attrs \\ %{}) do
    Enrollment.changeset(enrollment, attrs)
  end

  @doc """
  Enrolls a user in a course.

  ## Examples

      iex> enroll_user_in_course(user_id, course_id)
      {:ok, %Enrollment{}}

      iex> enroll_user_in_course(user_id, course_id)
      {:error, :already_enrolled}

  """
  def enroll_user_in_course(user_id, course_id) do
    # Check if already enrolled
    case get_enrollment_by_user_and_course(user_id, course_id) do
      nil ->
        create_enrollment(%{user_id: user_id, course_id: course_id, status: "enrolled"})
      %Enrollment{status: "dropped"} = enrollment ->
        update_enrollment(enrollment, %{status: "enrolled", enrolled_at: NaiveDateTime.utc_now()})
      _enrollment ->
        {:error, :already_enrolled}
    end
  end

  @doc """
  Unenrolls a user from a course.

  ## Examples

      iex> unenroll_user_from_course(user_id, course_id)
      {:ok, %Enrollment{}}

      iex> unenroll_user_from_course(user_id, course_id)
      {:error, :not_enrolled}

  """
  def unenroll_user_from_course(user_id, course_id) do
    case get_enrollment_by_user_and_course(user_id, course_id) do
      %Enrollment{status: status} = enrollment when status in ["enrolled", "completed"] ->
        update_enrollment(enrollment, %{status: "dropped"})
      _ ->
        {:error, :not_enrolled}
    end
  end

  @doc """
  Gets enrollment by user and course.

  ## Examples

      iex> get_enrollment_by_user_and_course(user_id, course_id)
      %Enrollment{}

      iex> get_enrollment_by_user_and_course(user_id, course_id)
      nil

  """
  def get_enrollment_by_user_and_course(user_id, course_id) do
    Repo.get_by(Enrollment, user_id: user_id, course_id: course_id)
  end

  @doc """
  Lists enrollments for a user.

  ## Examples

      iex> list_user_enrollments(user_id)
      [%Enrollment{}, ...]

  """
  def list_user_enrollments(user_id) do
    Enrollment
    |> where([e], e.user_id == ^user_id and e.status != "dropped")
    |> preload([:course])
    |> Repo.all()
  end

  @doc """
  Lists enrollments for a course.

  ## Examples

      iex> list_course_enrollments(course_id)
      [%Enrollment{}, ...]

  """
  def list_course_enrollments(course_id) do
    Enrollment
    |> where([e], e.course_id == ^course_id and e.status == "enrolled")
    |> preload([:user])
    |> Repo.all()
  end

  @doc """
  Checks if a user is enrolled in a course.

  ## Examples

      iex> user_enrolled_in_course?(user_id, course_id)
      true

  """
  def user_enrolled_in_course?(user_id, course_id) do
    case get_enrollment_by_user_and_course(user_id, course_id) do
      %Enrollment{status: status} when status in ["enrolled", "completed"] -> true
      _ -> false
    end
  end

  @doc """
  Updates enrollment progress.

  ## Examples

      iex> update_enrollment_progress(user_id, course_id, 75)
      {:ok, %Enrollment{}}

  """
  def update_enrollment_progress(user_id, course_id, progress_percentage) do
    case get_enrollment_by_user_and_course(user_id, course_id) do
      %Enrollment{} = enrollment ->
        update_enrollment(enrollment, %{progress_percentage: progress_percentage})
      nil ->
        {:error, :not_enrolled}
    end
  end

  @doc """
  Completes enrollment for a course.

  ## Examples

      iex> complete_enrollment(user_id, course_id)
      {:ok, %Enrollment{}}

  """
  def complete_enrollment(user_id, course_id) do
    case get_enrollment_by_user_and_course(user_id, course_id) do
      %Enrollment{} = enrollment ->
        update_enrollment(enrollment, %{
          status: "completed",
          completed_at: NaiveDateTime.utc_now(),
          progress_percentage: 100
        })
      nil ->
        {:error, :not_enrolled}
    end
  end
end
