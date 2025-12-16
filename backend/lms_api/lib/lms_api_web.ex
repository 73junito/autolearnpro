defmodule LmsApiWeb do
  def controller do
    quote do
      use Phoenix.Controller, namespace: LmsApiWeb
      import Plug.Conn
      alias LmsApiWeb.Router.Helpers, as: Routes
    end
  end

  def router do
    quote do
      use Phoenix.Router
      import Plug.Conn
    end
  end

  def view do
    quote do
      use Phoenix.View, root: "lib/lms_api_web/templates", namespace: LmsApiWeb

      # Import convenience functions from controllers
      import Phoenix.Controller, only: [get_flash: 1, get_flash: 2, view_module: 1]

      # Include shared imports and aliases for views
      import LmsApiWeb.ErrorHelpers
      alias LmsApiWeb.Router.Helpers, as: Routes
    end
  end

  defmacro __using__(which) when is_atom(which) do
    apply(__MODULE__, which, [])
  end
end
