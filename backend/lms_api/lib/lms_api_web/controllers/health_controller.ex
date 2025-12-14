defmodule LmsApiWeb.HealthController do
  use LmsApiWeb, :controller
  @doc "Return a JSON health status including DB connectivity"
  def index(conn, _params) do
    db_status = check_db()

    status = if db_status == :ok, do: "healthy", else: "degraded"

    json(conn, %{status: status, database: Atom.to_string(db_status)})
  end

  defp check_db do
    try do
      case LmsApi.Repo.query("SELECT 1") do
        {:ok, _result} -> :ok
        {:error, _} -> :unavailable
      end
    rescue
      _ -> :unavailable
    catch
      _ -> :unavailable
    end
  end
end
