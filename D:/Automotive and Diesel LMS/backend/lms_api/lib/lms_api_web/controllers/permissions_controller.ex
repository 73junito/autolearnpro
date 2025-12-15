defmodule LmsApiWeb.PermissionsController do
  use LmsApiWeb, :controller

  alias LmsApi.Permissions
  alias LmsApi.Permissions.{Role, Permission}

  action_fallback LmsApiWeb.FallbackController

  def index_roles(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      roles = Permissions.list_roles()
      render(conn, "roles.json", roles: roles)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def create_role(conn, %{"role" => role_params}) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      with {:ok, %Role{} = role} <- Permissions.create_role(role_params) do
        conn
        |> put_status(:created)
        |> render("role.json", role: role)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def show_role(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      role = Permissions.get_role!(id)
      render(conn, "role.json", role: role)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def update_role(conn, %{"id" => id, "role" => role_params}) do
    user = Guardian.Plug.current_resource(conn)
    role = Permissions.get_role!(id)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      with {:ok, %Role{} = role} <- Permissions.update_role(role, role_params) do
        render(conn, "role.json", role: role)
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def delete_role(conn, %{"id" => id}) do
    user = Guardian.Plug.current_resource(conn)
    role = Permissions.get_role!(id)

    if Permissions.user_has_permission?(user.id, "manage_roles") and not role.is_system_role do
      with {:ok, %Role{}} <- Permissions.delete_role(role) do
        send_resp(conn, :no_content, "")
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied or system role cannot be deleted"})
    end
  end

  def assign_role_to_user(conn, %{"user_id" => user_id, "role_id" => role_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(current_user.id, "manage_roles") do
      with {:ok, user_role} <- Permissions.assign_role_to_user(user_id, role_id) do
        json(conn, %{message: "Role assigned successfully", user_role: user_role})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def get_user_roles(conn, %{"user_id" => user_id}) do
    current_user = Guardian.Plug.current_resource(conn)

    # Allow users to view their own roles or admins to view any user's roles
    if current_user.id == String.to_integer(user_id) or
       Permissions.user_has_permission?(current_user.id, "manage_roles") do
      roles = Permissions.get_user_roles(user_id)
      render(conn, "roles.json", roles: roles)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def assign_permission_to_role(conn, %{"role_id" => role_id, "permission_id" => permission_id}) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      with {:ok, role_permission} <- Permissions.assign_permission_to_role(role_id, permission_id) do
        json(conn, %{message: "Permission assigned successfully", role_permission: role_permission})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def remove_permission_from_role(conn, %{"role_id" => role_id, "permission_id" => permission_id}) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      case Permissions.remove_permission_from_role(role_id, permission_id) do
        {:ok, _} -> json(conn, %{message: "Permission removed successfully"})
        {:error, :not_found} -> conn |> put_status(:not_found) |> json(%{error: "Permission not found"})
      end
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def get_role_permissions(conn, %{"role_id" => role_id}) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      permissions = Permissions.get_role_permissions(role_id)
      render(conn, "permissions.json", permissions: permissions)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end

  def check_permission(conn, %{"permission" => permission_name}) do
    user = Guardian.Plug.current_resource(conn)

    has_permission = Permissions.user_has_permission?(user.id, permission_name)
    json(conn, %{has_permission: has_permission, permission: permission_name})
  end

  def list_permissions(conn, _params) do
    user = Guardian.Plug.current_resource(conn)

    if Permissions.user_has_permission?(user.id, "manage_roles") do
      permissions = Repo.all(Permission)
      render(conn, "permissions.json", permissions: permissions)
    else
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Access denied"})
    end
  end
end