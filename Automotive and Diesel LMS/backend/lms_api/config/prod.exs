import Config

# Minimal prod config placeholder. Real deployments should set env vars and secrets.

raw_database_url = System.get_env("DATABASE_URL")
database_url =
  if is_binary(raw_database_url) do
    trimmed = String.trim(raw_database_url)
    if trimmed == "", do: "ecto://postgres:postgres@localhost/lms_api_prod", else: trimmed
  else
    "ecto://postgres:postgres@localhost/lms_api_prod"
  end

config :lms_api, LmsApi.Repo,
  url: database_url,
  pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
