defmodule LmsApi.Accounts do
  @moduledoc """
  The Accounts context.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo

  alias LmsApi.Accounts.User

  @doc """
  Returns the list of users.

  ## Examples

      iex> list_users()
      [%User{}, ...]

  """
  def list_users do
    Repo.all(User)
  end

  @doc """
  Gets a single user.

  Raises `Ecto.NoResultsError` if the User does not exist.

  ## Examples

      iex> get_user!(123)
      %User{}

      iex> get_user!(456)
      ** (Ecto.NoResultsError)

  """
  def get_user!(id), do: Repo.get!(User, id)

  @doc """
  Creates a user.

  ## Examples

      iex> create_user(%{field: value})
      {:ok, %User{}}

      iex> create_user(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_user(attrs \\ %{}) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a user.

  ## Examples

      iex> update_user(user, %{field: new_value})
      {:ok, %User{}}

      iex> update_user(user, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_user(%User{} = user, attrs) do
    user
    |> User.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a user.

  ## Examples

      iex> delete_user(user)
      {:ok, %User{}}

      iex> delete_user(user)
      {:error, %Ecto.Changeset{}}

  """
  def delete_user(%User{} = user) do
    Repo.delete(user)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking user changes.

  ## Examples

      iex> change_user(user)
      %Ecto.Changeset{data: %User{}}

  """
  def change_user(%User{} = user, attrs \\ %{}) do
    User.changeset(user, attrs)
  end

  @doc """
  Gets a user by email.

  ## Examples

      iex> get_user_by_email("email@example.com")
      %User{}

      iex> get_user_by_email("nonexistent@example.com")
      nil

  """
  def get_user_by_email(email) do
    Repo.get_by(User, email: email)
  end

  @doc """
  Authenticates a user.

  ## Examples

      iex> authenticate_user("email@example.com", "password")
      {:ok, %User{}}

      iex> authenticate_user("email@example.com", "wrong_password")
      {:error, :invalid_credentials}

  """
  def authenticate_user(email, password) do
    user = get_user_by_email(email)

    cond do
      user && Bcrypt.verify_pass(password, user.hashed_password) ->
        {:ok, user}
      user ->
        {:error, :invalid_credentials}
      true ->
        Bcrypt.no_user_verify()
        {:error, :invalid_credentials}
    end
  end

  @doc """
  Checks if user has instructor role or higher.

  ## Examples

      iex> is_instructor?(user)
      true

  """
  def is_instructor?(%{role: role}) when role in ["instructor", "admin"], do: true
  def is_instructor?(_), do: false

  @doc """
  Checks if user has admin role.

  ## Examples

      iex> is_admin?(user)
      true

  """
  def is_admin?(%{role: "admin"}), do: true
  def is_admin?(_), do: false

  @doc """
  Checks if user can manage a specific course.

  ## Examples

      iex> can_manage_course?(user, course_id)
      true

  """
  def can_manage_course?(user, _course_id) do
    # For now, all instructors and admins can manage all courses
    # In the future, this could check course ownership/assignments
    is_instructor?(user) or is_admin?(user)
  end

  @doc """
  Checks if user can view course analytics.

  ## Examples

      iex> can_view_analytics?(user, course_id)
      true

  """
  def can_view_analytics?(user, course_id) do
    can_manage_course?(user, course_id)
  end
end
