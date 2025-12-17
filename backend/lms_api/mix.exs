defmodule LmsApi.MixProject do
  use Mix.Project

  def project do
    [
      app: :lms_api,
      version: "0.1.0",
      elixir: "~> 1.15",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      test_coverage: [tool: ExCoveralls],
      preferred_cli_env: [
        coveralls: :test,
        "coveralls.detail": :test,
        "coveralls.post": :test,
        "coveralls.html": :test,
        "coveralls.json": :test
      ]
    ]
  end

  def application do
    [
      mod: {LmsApi.Application, []},
      extra_applications: [:logger, :runtime_tools]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:phoenix, "~> 1.7.12"},
      {:phoenix_html, "~> 4.3"},
      {:gettext, "~> 0.23"},
      {:phoenix_view, "~> 2.0"},
      {:phoenix_pubsub, "~> 2.1"},
      {:phoenix_ecto, "~> 4.4"},
      {:ecto_sql, "~> 3.10"},
      {:postgrex, ">= 0.0.0"},
      {:jason, "~> 1.4"},
      {:plug_cowboy, "~> 2.6"},
      {:httpoison, "~> 1.8"},
      {:guardian, "~> 2.0"},
      {:bcrypt_elixir, "~> 3.0"},
      {:redix, "~> 1.3"},
      {:poolboy, "~> 1.5"},
      {:oban, "~> 2.14"},
      {:phoenix_swagger, "~> 0.8.3"},
      {:phoenix_live_view, "~> 0.20.0"},
      {:benchee, "~> 1.1", only: :dev},
      {:excoveralls, "~> 0.18", only: :test}
    ]
  end
end
