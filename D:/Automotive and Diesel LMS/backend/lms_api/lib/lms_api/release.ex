defmodule LmsApi.Release do
  @app :lms_api

  @doc """
  Run migrations for all repos configured under :ecto_repos.
  Designed to be invoked from a release via:
    /app/bin/lms_api eval "LmsApi.Release.migrate()"
  """
  def migrate do
    load_app()

    # Ensure required applications are started so Ecto/Postgrex can function
    apps = [:logger, :telemetry, :postgrex, :ecto_sql]
    for app <- apps do
      case Application.ensure_all_started(app) do
        {:ok, _} -> :ok
        {:error, {:already_started, _}} -> :ok
        {:error, reason} -> IO.puts("Failed to start #{inspect(app)}: #{inspect(reason)}")
      end
    end

    repos = Application.fetch_env!(@app, :ecto_repos)

    for repo <- repos do
      IO.puts("Running migrations for #{inspect(repo)}")
      # Start a small repo connection for migration. We do not explicitly
      # stop the repo here to avoid errors stopping the process from within
      # the same supervision context; the release will exit/cleanup on shutdown.
      {:ok, _pid} = repo.start_link(pool_size: 2)
      Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end

    IO.puts("Migrations finished")
  end

  defp load_app do
    Application.load(@app)
  end
end
