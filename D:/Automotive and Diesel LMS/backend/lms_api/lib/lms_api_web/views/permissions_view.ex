defmodule LmsApiWeb.PermissionsView do
  use LmsApiWeb, :view

  def render("roles.json", %{roles: roles}) do
    %{
      data: render_many(roles, __MODULE__, "role.json", as: :role)
    }
  end

  def render("role.json", %{role: role}) do
    %{
      id: role.id,
      name: role.name,
      description: role.description,
      is_system_role: role.is_system_role,
      permissions: render_many(role.role_permissions, __MODULE__, "role_permission.json", as: :role_permission),
      created_at: role.inserted_at,
      updated_at: role.updated_at
    }
  end

  def render("permissions.json", %{permissions: permissions}) do
    %{
      data: render_many(permissions, __MODULE__, "permission.json", as: :permission)
    }
  end

  def render("permission.json", %{permission: permission}) do
    %{
      id: permission.id,
      name: permission.name,
      description: permission.description,
      resource: permission.resource,
      action: permission.action,
      created_at: permission.inserted_at,
      updated_at: permission.updated_at
    }
  end

  def render("role_permission.json", %{role_permission: role_permission}) do
    %{
      id: role_permission.id,
      role_id: role_permission.role_id,
      permission_id: role_permission.permission_id,
      permission: render_one(role_permission.permission, __MODULE__, "permission.json", as: :permission)
    }
  end
end