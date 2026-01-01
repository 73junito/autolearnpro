import Config

# Minimal dev config placeholder

config :lms_api, LmsApi.Repo,
  username: "postgres",
  password: "postgres",
  database: "lms_api_dev",
  hostname: "localhost",
  show_sensitive_data_on_connection_error: true,
  pool_size: 10
