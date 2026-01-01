defmodule LmsApi.ReleaseTasks do
  @app :lms_api

  def migrate do
    IO.puts("Starting migrations for #{@app}")

    # Load the application without starting it fully
    Application.load(@app)

    # Ensure necessary apps are started
    for app <- [:postgrex, :ecto_sql, @app] do
      case Application.ensure_all_started(app) do
        {:ok, _} -> :ok
        {:error, {:already_started, _}} -> :ok
        {:error, reason} -> IO.puts("Failed to start #{inspect(app)}: #{inspect(reason)}")
      end
    end

    path = Application.app_dir(@app, "priv/repo/migrations")
    IO.puts("Running migrations from: #{path}")
    Ecto.Migrator.run(LmsApi.Repo, path, :up, all: true)

    IO.puts("Migrations finished")
    :init.stop()
  end
end
