defmodule LmsApiWeb.AuthController do
  use LmsApiWeb, :controller

  alias LmsApi.Accounts
  alias LmsApi.Guardian

  action_fallback LmsApiWeb.FallbackController

  def register(conn, %{"user" => user_params}) do
    with {:ok, user} <- Accounts.create_user(user_params),
         {:ok, token, _claims} <- Guardian.encode_and_sign(user) do
      conn
      |> put_status(:created)
      |> render("user_with_token.json", user: user, token: token)
    end
  end

  def login(conn, %{"email" => email, "password" => password}) do
    with {:ok, user} <- Accounts.authenticate_user(email, password),
         {:ok, token, _claims} <- Guardian.encode_and_sign(user) do
      conn
      |> put_status(:ok)
      |> render("user_with_token.json", user: user, token: token)
    end
  end
end