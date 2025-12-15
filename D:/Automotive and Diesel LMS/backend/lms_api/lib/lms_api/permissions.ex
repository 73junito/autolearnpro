defmodule LmsApi.Permissions do
  @moduledoc """
  The Permissions context for role-based access control and security.
  """

  import Ecto.Query, warn: false
  alias LmsApi.Repo
  alias LmsApi.Permissions.{Role, Permission, UserRole, RolePermission}

  @doc """
  Returns the list of roles.

  ## Examples

      iex> list_roles()
      [%Role{}, ...]

  """
  def list_roles do
    Repo.all(Role)
  end

  @doc """
  Gets a single role.

  Raises `Ecto.NoResultsError` if the Role does not exist.

  ## Examples

      iex> get_role!(123)
      %Role{}

      iex> get_role!(456)
      ** (Ecto.NoResultsError)

  """
  def get_role!(id), do: Repo.get!(Role, id)

  @doc """
  Creates a role.

  ## Examples

      iex> create_role(%{field: value})
      {:ok, %Role{}}

      iex> create_role(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_role(attrs \\ %{}) do
    %Role{}
    |> Role.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a role.

  ## Examples

      iex> update_role(role, %{field: new_value})
      {:ok, %Role{}}

      iex> update_role(role, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_role(%Role{} = role, attrs) do
    role
    |> Role.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a role.

  ## Examples

      iex> delete_role(role)
      {:ok, %Role{}}

      iex> delete_role(role)
      {:error, %Ecto.Changeset{}}

  """
  def delete_role(%Role{} = role) do
    Repo.delete(role)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking role changes.

  ## Examples

      iex> change_role(role)
      %Ecto.Changeset{data: %Role{}}

  """
  def change_role(%Role{} = role, attrs \\ %{}) do
    Role.changeset(role, attrs)
  end

  @doc """
  Assigns a role to a user.

  ## Examples

      iex> assign_role_to_user(user_id, role_id)
      {:ok, %UserRole{}}

  """
  def assign_role_to_user(user_id, role_id) do
    # Remove existing role assignment for this user
    from(ur in UserRole, where: ur.user_id == ^user_id)
    |> Repo.delete_all()

    %UserRole{}
    |> UserRole.changeset(%{user_id: user_id, role_id: role_id})
    |> Repo.insert()
  end

  @doc """
  Gets user roles.

  ## Examples

      iex> get_user_roles(123)
      [%Role{}, ...]

  """
  def get_user_roles(user_id) do
    UserRole
    |> where([ur], ur.user_id == ^user_id)
    |> join(:inner, [ur], r in Role, on: ur.role_id == r.id)
    |> select([ur, r], r)
    |> Repo.all()
  end

  @doc """
  Checks if user has a specific permission.

  ## Examples

      iex> user_has_permission?(user_id, "manage_courses")
      true

  """
  def user_has_permission?(user_id, permission_name) do
    user_roles = get_user_roles(user_id)

    Enum.any?(user_roles, fn role ->
      role_has_permission?(role.id, permission_name)
    end)
  end

  @doc """
  Checks if role has a specific permission.

  ## Examples

      iex> role_has_permission?(role_id, "manage_courses")
      true

  """
  def role_has_permission?(role_id, permission_name) do
    RolePermission
    |> where([rp], rp.role_id == ^role_id)
    |> join(:inner, [rp], p in Permission, on: rp.permission_id == p.id)
    |> where([rp, p], p.name == ^permission_name)
    |> Repo.exists?()
  end

  @doc """
  Assigns permission to role.

  ## Examples

      iex> assign_permission_to_role(role_id, permission_id)
      {:ok, %RolePermission{}}

  """
  def assign_permission_to_role(role_id, permission_id) do
    %RolePermission{}
    |> RolePermission.changeset(%{role_id: role_id, permission_id: permission_id})
    |> Repo.insert()
  end

  @doc """
  Removes permission from role.

  ## Examples

      iex> remove_permission_from_role(role_id, permission_id)
      {:ok, %RolePermission{}}

  """
  def remove_permission_from_role(role_id, permission_id) do
    role_permission = Repo.get_by(RolePermission, role_id: role_id, permission_id: permission_id)
    if role_permission do
      Repo.delete(role_permission)
    else
      {:error, :not_found}
    end
  end

  @doc """
  Gets role permissions.

  ## Examples

      iex> get_role_permissions(role_id)
      [%Permission{}, ...]

  """
  def get_role_permissions(role_id) do
    RolePermission
    |> where([rp], rp.role_id == ^role_id)
    |> join(:inner, [rp], p in Permission, on: rp.permission_id == p.id)
    |> select([rp, p], p)
    |> Repo.all()
  end

  @doc """
  Creates default roles and permissions.

  ## Examples

      iex> create_default_roles()
      :ok

  """
  def create_default_roles do
    # Create permissions
    permissions = [
      %{name: "view_courses", description: "Can view courses"},
      %{name: "create_courses", description: "Can create courses"},
      %{name: "edit_courses", description: "Can edit courses"},
      %{name: "delete_courses", description: "Can delete courses"},
      %{name: "manage_enrollments", description: "Can manage course enrollments"},
      %{name: "view_users", description: "Can view users"},
      %{name: "create_users", description: "Can create users"},
      %{name: "edit_users", description: "Can edit users"},
      %{name: "delete_users", description: "Can delete users"},
      %{name: "manage_roles", description: "Can manage roles and permissions"},
      %{name: "view_analytics", description: "Can view analytics"},
      %{name: "manage_assessments", description: "Can manage assessments"},
      %{name: "grade_assessments", description: "Can grade assessments"},
      %{name: "manage_live_sessions", description: "Can manage live sessions"},
      %{name: "view_reports", description: "Can view reports"},
      %{name: "manage_organization", description: "Can manage organization settings"}
    ]

    Enum.each(permissions, fn perm ->
      case Repo.get_by(Permission, name: perm.name) do
        nil -> create_permission(perm)
        _ -> :ok
      end
    end)

    # Create roles
    roles = [
      %{
        name: "super_admin",
        description: "Super Administrator with full access",
        permissions: ["view_courses", "create_courses", "edit_courses", "delete_courses",
                     "manage_enrollments", "view_users", "create_users", "edit_users",
                     "delete_users", "manage_roles", "view_analytics", "manage_assessments",
                     "grade_assessments", "manage_live_sessions", "view_reports", "manage_organization"]
      },
      %{
        name: "admin",
        description: "Administrator with most management capabilities",
        permissions: ["view_courses", "create_courses", "edit_courses", "delete_courses",
                     "manage_enrollments", "view_users", "create_users", "edit_users",
                     "delete_users", "view_analytics", "manage_assessments", "grade_assessments",
                     "manage_live_sessions", "view_reports"]
      },
      %{
        name: "instructor",
        description: "Course instructor with teaching capabilities",
        permissions: ["view_courses", "create_courses", "edit_courses", "manage_enrollments",
                     "view_analytics", "manage_assessments", "grade_assessments", "manage_live_sessions"]
      },
      %{
        name: "teaching_assistant",
        description: "Teaching assistant with limited teaching capabilities",
        permissions: ["view_courses", "edit_courses", "manage_assessments", "grade_assessments"]
      },
      %{
        name: "student",
        description: "Student with learning capabilities",
        permissions: ["view_courses"]
      },
      %{
        name: "auditor",
        description: "Read-only access for auditing purposes",
        permissions: ["view_courses", "view_users", "view_analytics", "view_reports"]
      }
    ]

    Enum.each(roles, fn role_attrs ->
      case Repo.get_by(Role, name: role_attrs.name) do
        nil ->
          {:ok, role} = create_role(%{name: role_attrs.name, description: role_attrs.description})
          assign_permissions_to_role(role.id, role_attrs.permissions)
        _ -> :ok
      end
    end)

    :ok
  end

  # Helper functions
  defp create_permission(attrs) do
    %Permission{}
    |> Permission.changeset(attrs)
    |> Repo.insert()
  end

  defp assign_permissions_to_role(role_id, permission_names) do
    Enum.each(permission_names, fn perm_name ->
      case Repo.get_by(Permission, name: perm_name) do
        nil -> :ok
        permission -> assign_permission_to_role(role_id, permission.id)
      end
    end)
  end
end