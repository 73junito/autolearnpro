import Config

# Minimal config to allow compilation in CI/container builds.
# Real app should override secrets and DB config via runtime.exs or environment.

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]
import Config

config :lms_api,
  ecto_repos: [LmsApi.Repo]

config :lms_api, LmsApiWeb.Endpoint,
  url: [host: "localhost"],
  render_errors: [view: LmsApiWeb.ErrorView, accepts: ~w(json), layout: false],
  pubsub_server: LmsApi.PubSub,
  live_view: [signing_salt: "change_me"]

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

config :phoenix, :json_library, Jason

config :guardian, Guardian,
  issuer: "lms_api",
  secret_key: "change_me_to_a_long_random_string",
  ttl: {30, :days}

config :bcrypt_elixir, :log_rounds, 12
