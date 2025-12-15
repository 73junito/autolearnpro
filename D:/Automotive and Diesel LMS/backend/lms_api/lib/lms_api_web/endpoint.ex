defmodule LmsApiWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :lms_api

  plug Plug.RequestId
  plug Plug.Logger

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head

  plug Plug.Static,
    at: "/",
    from: :lms_api,
    gzip: false,
    only: ~w(assets fonts images favicon.ico robots.txt)

  # Session support for browser requests. Uses cookie store with a signing salt.
  # `SESSION_SIGNING_SALT` may be provided in the environment; fallback is
  # supplied for development/testing but should be changed in production.
  plug Plug.Session,
    store: :cookie,
    key: "_lms_api_key",
    signing_salt: System.get_env("SESSION_SIGNING_SALT") || "change_me"

  # Router is expected to be defined in lib/lms_api_web/router.ex
  plug LmsApiWeb.Router
end
