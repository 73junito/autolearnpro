defmodule LmsApiWeb.PageController do
  use LmsApiWeb, :controller

  def index(conn, _params) do
    # Redirect browser root to the marketing site. This avoids needing
    # an HTML template inside the release and provides a clear user
    # experience while the marketing site is managed separately.
    redirect(conn, external: "https://autolearnpro.com/")
  end
end
