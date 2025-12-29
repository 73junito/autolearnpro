defmodule LmsApi.Redactor do
  @moduledoc """
  Centralized redaction utilities used by request plugs and exporters.
  Provides `sanitize/1` which recursively redacts sensitive keys and patterns.
  Also provides `redact_string/1` for basic string redaction (emails).
  """

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

  @doc "Sanitize input (maps/lists/primitives) by redacting sensitive values." 
  def sanitize(value) when is_map(value) do
    value
    |> Enum.map(fn {k, v} -> {k, sanitize_entry(k, v)} end)
    |> Enum.into(%{})
  end

  def sanitize(value) when is_list(value) do
    Enum.map(value, &sanitize/1)
  end

  def sanitize(value), do: value

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

  @doc "Redact email addresses in an arbitrary string by replacing them with [REDACTED]."
  def redact_string(str) when is_binary(str) do
    Regex.replace(~r/[\w.+\-]+@[\w\-]+\.[\w.\-]+/u, str, @redaction_text)
  end

  def redact_string(other), do: other
end
