import Config

# Minimal config to allow compilation in CI/container builds.
# Real app should override secrets and DB config via runtime.exs or environment.

config :logger, :console,
  format: "{\"time\": \"$time\",\"level\": \"$level\",\"msg\": \"$message\",\"metadata\": \"$metadata\"}\n",
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

# Compile-time defaults for AI model names. These mirror runtime defaults
# in `runtime.exs` so releases built in CI or locally have the same
# compile-time configuration and avoid `:validate_compile_env` errors
# when runtime values are provided by environment or secrets.
config :lms_api, :ai_models,
  content_generation: "qwen3-vl:8b",
  image_generation: "Flux_AI/Flux_AI:latest",
  default: "llama3.1:8b"

# Compile-time defaults for services expected at runtime
config :lms_api, :ollama_url, "http://host.docker.internal:11434"
config :lms_api, :redis_url, "redis://redis:6379"
