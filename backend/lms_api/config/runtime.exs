import Config

# Minimal runtime config for container builds. Reads secrets from env when present.

secret = System.get_env("SECRET_KEY_BASE") || "dev_secret_base_not_for_prod"
port = String.to_integer(System.get_env("PORT") || "4000")

config :lms_api, LmsApiWeb.Endpoint,
  secret_key_base: secret,
  http: [port: port]

# Guardian secret used for JWT signing. Read from env in prod, but
# provide a clear dev fallback so requests that trigger token signing
# don't crash during development or in containerized builds.
guardian_secret = System.get_env("GUARDIAN_SECRET") || "dev_guardian_secret_not_for_prod"

# Guardian is used via `use Guardian, otp_app: :lms_api` in `LmsApi.Guardian`.
# Configure the implementation module under the application config so
# Guardian can find the signing secret at runtime.
config :lms_api, LmsApi.Guardian,
  secret_key: guardian_secret
import Config

raw_database_url = System.get_env("DATABASE_URL")
database_url =
  if is_binary(raw_database_url) do
    trimmed = String.trim(raw_database_url)
    if trimmed == "", do: "ecto://postgres:postgres@localhost/lms_api_dev", else: trimmed
  else
    "ecto://postgres:postgres@localhost/lms_api_dev"
  end

config :lms_api, LmsApi.Repo,
  url: database_url,
  pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")

# Redis URL for Redix. In dev we default to a docker service named `redis`.
redis_url = System.get_env("REDIS_URL") || "redis://redis:6379"
config :lms_api, :redis_url, redis_url

http_port = String.to_integer(System.get_env("PORT") || "4000")

config :lms_api, LmsApiWeb.Endpoint,
  http: [port: http_port],
  server: true

# Ollama AI integration (local instance accessible from Docker)
ollama_url = System.get_env("OLLAMA_URL") || "http://host.docker.internal:11434"
config :lms_api, :ollama_url, ollama_url

# AI model names for different tasks
config :lms_api, :ai_models,
  content_generation: "qwen3-vl:8b",      # Vision-language model for course content
  image_generation: "Flux_AI/Flux_AI:latest",  # Image generation for diagrams
  default: "llama3.1:8b"                  # Fallback general-purpose model
