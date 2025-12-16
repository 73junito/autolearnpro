defmodule LmsApi.RedactorTest do
  use ExUnit.Case, async: true

  alias LmsApi.Redactor

  test "sanitizes nested map values and emails" do
    input = %{"user" => %{"email" => "test@example.com", "name" => "Alice", "profile" => %{ "token" => "abc" }}}
    out = Redactor.sanitize(input)

    assert out["user"]["email"] == "[REDACTED]"
    assert out["user"]["name"] == "[REDACTED]"
    assert out["user"]["profile"]["token"] == "[REDACTED]"
  end
end
