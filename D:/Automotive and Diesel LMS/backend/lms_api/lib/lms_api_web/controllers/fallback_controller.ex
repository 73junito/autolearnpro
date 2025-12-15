defmodule LmsApiWeb.FallbackController do
  use LmsApiWeb, :controller

  # Handle Ecto.Changeset errors
  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> put_view(LmsApiWeb.ChangesetView)
    |> render("error.json", changeset: changeset)
  end

  # Not found
  def call(conn, {:error, :not_found}) do
    conn
    |> put_status(:not_found)
    |> json(%{error: "Resource not found"})
  end

  # Generic error fallback
  def call(conn, {:error, reason}) do
    conn
    |> put_status(:internal_server_error)
    |> json(%{error: "Internal server error", reason: inspect(reason)})
  end
end
defmodule LmsApiWeb.FallbackController do
	use LmsApiWeb, :controller

	@doc "Plug init callback - returns given options."
	def init(opts), do: opts

	@doc "Handle controller action fallbacks for common error tuples."
	def call(conn, {:error, :not_found}) do
		conn
		|> put_status(:not_found)
		|> put_view(LmsApiWeb.ErrorView)
		|> render("404.json")
	end

	def call(conn, {:error, :secret_not_found}) do
		conn
		|> put_status(:bad_request)
		|> put_view(LmsApiWeb.ErrorView)
		|> render("400.json", %{reason: :secret_not_found})
	end

	def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
		conn
		|> put_status(:unprocessable_entity)
		|> put_view(LmsApiWeb.ChangesetView)
		|> render("error.json", changeset: changeset)
	end
end
