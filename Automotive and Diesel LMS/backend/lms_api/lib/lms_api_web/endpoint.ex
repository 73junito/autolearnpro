defmodule LmsApiWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :lms_api

  # The session will be stored in the cookie and signed, so it
  # won't be readable by strangers. If you are concerned
  # about the size of the cookie, you can store the session
  # data in the database instead by uncommenting the line
  # below and running theSessionRepo.Migrations.AddSessions
  # migration.
  #
  # plug Plug.Session,
  #   store: :cookie,
  #   key: "_my_app_key",
  #   signing_salt: "change_me"

  plug Plug.RequestId
  # Use Cloudflare-aware remote IP plug
  plug LmsApiWeb.Plugs.CloudflareRemoteIp
  plug LmsApiWeb.Plugs.RedactionPlug
  plug Plug.Logger

  plug Plug.Parsers,
    parsers: [:urlencoded, :multipart, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()

  plug Plug.MethodOverride
  plug Plug.Head

  # Router is expected to be defined in lib/lms_api_web/router.ex
  plug LmsApiWeb.Router
end
