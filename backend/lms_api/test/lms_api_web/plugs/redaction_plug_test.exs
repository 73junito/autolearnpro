defmodule LmsApiWeb.Plugs.RedactionPlugTest do
  use ExUnit.Case, async: true
  use Plug.Test

  alias LmsApiWeb.Plugs.RedactionPlug

  test "redacts sensitive keys in params" do
    conn = conn(:post, "/", %{ "email" => "user@example.com", "password" => "secret" })
    conn = RedactionPlug.call(conn, %{})

    assert conn.params["email"] == "[REDACTED]"
    assert conn.params["password"] == "[REDACTED]"
  end

  test "sanitizes nested structures" do
    conn = conn(:post, "/", %{ "user" => %{ "name" => "Alice", "profile" => %{ "email" => "a@b.com" } } })
    conn = RedactionPlug.call(conn, %{})

    assert conn.params["user"]["name"] == "[REDACTED]"
    assert conn.params["user"]["profile"]["email"] == "[REDACTED]"
  end
end
