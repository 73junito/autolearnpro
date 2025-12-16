defmodule LmsApiWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :lms_api

  plug Plug.RequestId
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
