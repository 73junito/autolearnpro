defmodule LmsApiWeb.AuthView do
  def render("user_with_token.json", %{user: user, token: token}) do
    %{
      data: %{
        user: %{
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          active: user.active
        },
        token: token
      }
    }
  end
end