defmodule LmsApiWeb.Auth.Pipeline do
  use Guardian.Plug.Pipeline, otp_app: :lms_api,
                              module: LmsApi.Guardian,
                              error_handler: LmsApiWeb.Auth.ErrorHandler

  plug Guardian.Plug.VerifyHeader
  plug Guardian.Plug.EnsureAuthenticated
  plug Guardian.Plug.LoadResource
end