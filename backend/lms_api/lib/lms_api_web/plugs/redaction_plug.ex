defmodule LmsApiWeb.Plugs.RedactionPlug do
  @moduledoc """
  Plug to redact sensitive fields from request params before they are logged or exported.
  Keeps a conservative blocklist and applies recursive sanitization to maps/lists.
  """

  import Plug.Conn

  @blocklist_keys [
    "password",
    "passwd",
    "secret",
    "token",
    "access_token",
    "refresh_token",
    "credit_card",
    "card_number",
    "cvv",
    "ssn",
    "email",
    "name",
    "first_name",
    "last_name",
    "grades",
    "grade",
    "score",
    "answer",
    "answers",
    "payment",
    "payment_info"
  ]

  @redaction_text "[REDACTED]"

  def init(opts), do: opts

  def call(%Plug.Conn{params: params} = conn, _opts) do
    sanitized = sanitize(params || %{})
    %{conn | params: sanitized}
  end

  defp sanitize(value) when is_map(value) do
    value
    |> Enum.map(fn {k, v} -> {k, sanitize_entry(k, v)} end)
    |> Enum.into(%{})
  end

  defp sanitize(value) when is_list(value) do
    Enum.map(value, &sanitize/1)
  end

  defp sanitize(value), do: value

  defp sanitize_entry(key, value) do
    key_down = to_string(key) |> String.downcase()

    cond do
      sensitive_key?(key_down) -> @redaction_text
      is_map(value) -> sanitize(value)
      is_list(value) -> Enum.map(value, &sanitize/1)
      is_binary(value) and looks_like_email?(value) -> @redaction_text
      true -> value
    end
  end

  defp sensitive_key?(key) do
    Enum.any?(@blocklist_keys, fn blk -> String.contains?(key, blk) end)
  end

  defp looks_like_email?(val) when is_binary(val) do
    String.match?(val, ~r/^[\w.+\-]+@[\w\-]+\.[\w.\-]+$/)
  end

  defp looks_like_email?(_), do: false
end
